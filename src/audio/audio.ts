import type { GameEvent } from '../sim/types';
import { beginBatch, createAudioEventState, mapGameEvent, type AudioEventState, type CueSink } from './events';
import { MusicEngine } from './music/sequencer';
import { resolveTrackId } from './music/moods';
import { DEFAULT_GAP, DEFAULT_VARY, DEFAULT_VOICES, normalizeSamples, resolveSfxId, SFX } from './presets';
import { spatialize, type SpatialOut } from './spatial';
import { VoiceLimiter } from './voices';
import { loadZzfx, type SampleBuilder } from './zzfx';

export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
}

export interface AudioManagerOptions {
  /** Context factory (tests inject a fake). Default: `new AudioContext()` when available. */
  createContext?: () => AudioContext | null;
  /** Run a background timer for the music scheduler (default true; tests tick manually). */
  timer?: boolean;
  /** Seed for generative music (default 1). */
  musicSeed?: number;
}

/** Bus trims so 1.0 user volumes are comfortable (pulse waves are loud). */
const MUSIC_TRIM = 0.55;
const SFX_TRIM = 0.75;
const TIMER_MS = 50;

/**
 * Procedural audio: zzfx SFX + generative chiptune music, driven by GameEvents.
 *
 * Graph: per-sound source → gain → panner → sfx bus ┐
 *        track players (lead/harmony/bass/drums, echo) → music bus ┴→ master → compressor → out
 *
 * Everything no-ops safely without WebAudio (tests, Node/Bun, locked-down webviews). The context is
 * created on the first `unlock()` (a user gesture), so browsers never block or warn about autoplay;
 * music requested before that (e.g. the first `levelEnter`) starts as soon as audio unlocks.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private failed = false;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private music: MusicEngine | null = null;
  private builder: SampleBuilder | null = null;
  private readonly buffers = new Map<string, AudioBuffer | null>();
  private readonly limiter = new VoiceLimiter(24);
  private readonly spatialTmp: SpatialOut = { gain: 1, pan: 0 };
  private readonly state: AudioEventState = createAudioEventState();
  private readonly volumes: AudioVolumes = { master: 0.8, music: 0.6, sfx: 0.8 };
  private listenerX = 0;
  private listenerY = 0;
  private hasListener = false;
  /** Track wanted by the game (kept while locked so it can start on unlock). */
  private wantTrack = '';
  private batchMusic: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ready: Promise<boolean> = Promise.resolve(false);
  private readonly onVisibility = (): void => this.handleVisibility();
  private readonly sink: CueSink = {
    sfx: (id, x, y, spatial, volume, pitch) => {
      this.playSfxAt(id, x, y, spatial, volume, pitch);
    },
    music: (track) => {
      this.batchMusic = track;
    },
  };

  constructor(private readonly opts: AudioManagerOptions = {}) {}

  /** True once an AudioContext exists and is running. */
  get running(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Track id the game currently wants ('' = none), whether or not audio is unlocked yet. */
  get currentTrack(): string {
    return this.wantTrack;
  }

  /** Browsers require a user gesture before audio can start. Safe to call on every input event. */
  unlock(): void {
    if (this.failed) return;
    if (!this.ctx && !this.init()) return;
    const ctx = this.ctx!;
    // 'suspended' (autoplay policy / tab hidden) or Safari's 'interrupted' (phone call, other app).
    if (ctx.state !== 'running' && ctx.state !== 'closed' && !this.hidden()) {
      try {
        void ctx.resume().catch(() => undefined);
      } catch {
        // ignore — some webviews throw synchronously
      }
    }
  }

  /** Listener (local player centre) in world px; sound sources are spatialised around it. */
  setListener(x: number, y: number): void {
    this.listenerX = x;
    this.listenerY = y;
    this.hasListener = true;
  }

  /** Which player is local, so menus/level-ups of teammates aren't played at full volume. -1 = all. */
  setLocalPlayer(index: number): void {
    this.state.localPlayer = index;
  }

  /** React to one frame's GameEvents (call once per rendered frame). */
  handleEvents(events: readonly GameEvent[]): void {
    beginBatch(this.state);
    this.batchMusic = null;
    for (let i = 0; i < events.length; i++) mapGameEvent(events[i]!, this.state, this.sink);
    if (this.batchMusic !== null) this.playMusic(this.batchMusic);
    this.music?.tick();
  }

  /** Switch background music by track id (biome music id, 'town', 'boss', 'title'…; '' = silence). */
  playMusic(track: string): void {
    const id = resolveTrackId(track);
    this.wantTrack = id;
    if (!this.music) return;
    if (id === '') this.music.stop(1);
    else this.music.play(id);
  }

  stopMusic(fade = 1): void {
    this.wantTrack = '';
    this.music?.stop(fade);
  }

  setVolumes(v: Partial<AudioVolumes>): void {
    if (v.master !== undefined) this.volumes.master = clampVol(v.master);
    if (v.music !== undefined) this.volumes.music = clampVol(v.music);
    if (v.sfx !== undefined) this.volumes.sfx = clampVol(v.sfx);
    this.applyVolumes();
  }

  getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  /** Play a sound by id (UI sounds, previews). Non-positional unless x/y given. */
  playSfx(id: string, x?: number, y?: number, volume = 1, pitch = 1): boolean {
    const positional = x !== undefined && y !== undefined;
    return this.playSfxAt(id, x ?? 0, y ?? 0, positional, volume, pitch);
  }

  /** Resolves once the SFX synth is loaded (true) or known unavailable (false). */
  whenReady(): Promise<boolean> {
    return this.ready;
  }

  /** Debug/test view of the music engine. */
  musicDebug(): { playing: string | null; players: number } {
    return { playing: this.music?.currentId ?? null, players: this.music?.playerCount ?? 0 };
  }

  /** Release the context and timers (e.g. leaving the game). */
  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.music?.dispose();
    this.music = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private init(): boolean {
    let ctx: AudioContext | null = null;
    try {
      if (this.opts.createContext) ctx = this.opts.createContext();
      else {
        const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const Ctor = g.AudioContext ?? g.webkitAudioContext;
        if (typeof Ctor === 'function') ctx = new Ctor({ latencyHint: 'interactive' });
      }
    } catch {
      ctx = null;
    }
    if (!ctx) {
      this.failed = true;
      return false;
    }
    try {
      this.ctx = ctx;
      const master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 8;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      master.connect(comp).connect(ctx.destination);
      const musicBus = ctx.createGain();
      const sfxBus = ctx.createGain();
      musicBus.connect(master);
      sfxBus.connect(master);
      this.master = master;
      this.musicBus = musicBus;
      this.sfxBus = sfxBus;
      this.applyVolumes();
      this.music = new MusicEngine(ctx, musicBus, { seed: this.opts.musicSeed ?? 1 });
      if (this.wantTrack !== '') this.music.play(this.wantTrack, 0.4);
      if (this.opts.timer !== false) this.timer = setInterval(() => this.music?.tick(), TIMER_MS);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
      this.ready = loadZzfx(ctx).then((b) => {
        this.builder = b;
        if (b) this.prewarm();
        return b !== null;
      });
      return true;
    } catch {
      this.failed = true;
      this.ctx = null;
      this.music = null;
      return false;
    }
  }

  private hidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  /** Suspend audio while the tab is hidden (the sim/render loop pauses too); resume on return. */
  private handleVisibility(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (this.hidden()) void ctx.suspend().catch(() => undefined);
      else void ctx.resume().catch(() => undefined);
    } catch {
      // ignore
    }
  }

  private applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * MUSIC_TRIM, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx * SFX_TRIM, t, 0.02);
  }

  /** Render presets ahead of time in small chunks so the first hit of each sound has no hitch. */
  private prewarm(): void {
    const ids = Object.keys(SFX);
    let i = 0;
    const step = (): void => {
      if (!this.ctx) return;
      for (let k = 0; k < 6 && i < ids.length; k++, i++) this.getBuffer(ids[i]!);
      if (i < ids.length) setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  /** Lazily render a preset to an AudioBuffer (cached; null if zzfx isn't loaded yet). */
  private getBuffer(key: string): AudioBuffer | null {
    const cached = this.buffers.get(key);
    if (cached !== undefined) return cached;
    const ctx = this.ctx;
    const preset = SFX[key];
    if (!ctx || !this.builder || !preset) return null;
    let buf: AudioBuffer | null = null;
    try {
      const samples = normalizeSamples(this.builder(preset.z, ctx.sampleRate));
      if (samples.length > 0) {
        buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
        buf.getChannelData(0).set(samples);
      }
    } catch {
      buf = null;
    }
    this.buffers.set(key, buf);
    return buf;
  }

  private playSfxAt(id: string, x: number, y: number, spatial: boolean, volume: number, pitch: number): boolean {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || ctx.state !== 'running') return false;
    const key = resolveSfxId(id);
    const preset = SFX[key]!;
    let gain = (preset.gain ?? 1) * volume;
    let pan = 0;
    if (spatial && preset.spatial !== false && this.hasListener) {
      const s = spatialize(x - this.listenerX, y - this.listenerY, this.spatialTmp);
      gain *= s.gain;
      pan = s.pan;
    }
    if (gain < 0.01) return false;
    const buf = this.getBuffer(key);
    if (!buf) return false;
    const vary = preset.vary ?? DEFAULT_VARY;
    let rate = pitch * (1 + (Math.random() * 2 - 1) * vary);
    rate = rate < 0.25 ? 0.25 : rate > 4 ? 4 : rate;
    const now = ctx.currentTime;
    if (!this.limiter.tryStart(key, now, buf.duration / rate, preset.voices ?? DEFAULT_VOICES, preset.gap ?? DEFAULT_GAP)) return false;
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g);
      let tail: AudioNode = g;
      if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        tail = p;
      }
      tail.connect(bus);
      src.onended = () => tail.disconnect();
      src.start(now);
      return true;
    } catch {
      return false;
    }
  }
}

function clampVol(v: number): number {
  return Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 1;
}
