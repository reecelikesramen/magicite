/**
 * Minimal fake WebAudio for headless tests: records node creation, connections and scheduled starts
 * so the AudioManager / sequencer can be exercised without a browser.
 */
export class FakeParam {
  value: number;
  readonly calls: [string, number, number][] = [];
  constructor(v: number) {
    this.value = v;
  }
  setValueAtTime(v: number, t: number): this {
    this.calls.push(['set', v, t]);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.calls.push(['linear', v, t]);
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.calls.push(['exp', v, t]);
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, t: number, _tc: number): this {
    this.calls.push(['target', v, t]);
    this.value = v;
    return this;
  }
  cancelScheduledValues(t: number): this {
    this.calls.push(['cancel', 0, t]);
    return this;
  }
}

export class FakeNode {
  readonly outputs: FakeNode[] = [];
  disconnected = false;
  constructor(readonly ctx: FakeAudioContext, readonly kind: string) {
    ctx.created.push(this);
  }
  connect<T>(n: T): T {
    this.outputs.push(n as unknown as FakeNode);
    return n;
  }
  disconnect(): void {
    this.outputs.length = 0;
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

class FakeScheduled extends FakeNode {
  startAt: number | null = null;
  stopAt: number | null = null;
  onended: (() => void) | null = null;
  start(t = 0): void {
    this.startAt = t;
    this.ctx.starts.push(this);
  }
  stop(t = 0): void {
    this.stopAt = t;
  }
}

class FakeOsc extends FakeScheduled {
  type = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
  wave: unknown = null;
  setPeriodicWave(w: unknown): void {
    this.wave = w;
  }
}

class FakeBufferSource extends FakeScheduled {
  buffer: FakeBuffer | null = null;
  loop = false;
  readonly playbackRate = new FakeParam(1);
}

export class FakeBuffer {
  private readonly data: Float32Array[];
  readonly duration: number;
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    this.duration = length / sampleRate;
  }
  getChannelData(i: number): Float32Array {
    return this.data[i]!;
  }
}

export class FakeAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0;
  readonly sampleRate = 44100;
  readonly created: FakeNode[] = [];
  readonly starts: FakeScheduled[] = [];
  readonly destination: FakeNode;
  constructor() {
    this.destination = new FakeNode(this, 'destination');
  }
  createGain(): FakeGain {
    return new FakeGain(this, 'gain');
  }
  createOscillator(): FakeOsc {
    return new FakeOsc(this, 'osc');
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource(this, 'source');
  }
  createBuffer(ch: number, len: number, sr: number): FakeBuffer {
    return new FakeBuffer(ch, len, sr);
  }
  createPeriodicWave(real: Float32Array, imag: Float32Array): { real: Float32Array; imag: Float32Array } {
    return { real, imag };
  }
  createBiquadFilter(): FakeNode & { type: string; frequency: FakeParam; Q: FakeParam } {
    return Object.assign(new FakeNode(this, 'filter'), { type: 'lowpass', frequency: new FakeParam(350), Q: new FakeParam(1) });
  }
  createDelay(): FakeNode & { delayTime: FakeParam } {
    return Object.assign(new FakeNode(this, 'delay'), { delayTime: new FakeParam(0) });
  }
  createStereoPanner(): FakeNode & { pan: FakeParam } {
    return Object.assign(new FakeNode(this, 'panner'), { pan: new FakeParam(0) });
  }
  createDynamicsCompressor(): FakeNode & Record<'threshold' | 'knee' | 'ratio' | 'attack' | 'release', FakeParam> {
    return Object.assign(new FakeNode(this, 'compressor'), {
      threshold: new FakeParam(-24),
      knee: new FakeParam(30),
      ratio: new FakeParam(12),
      attack: new FakeParam(0.003),
      release: new FakeParam(0.25),
    });
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
  /** Started nodes of a kind with start time in [from, to). */
  startedBetween(kind: string, from: number, to: number): FakeScheduled[] {
    return this.starts.filter((s) => s.kind === kind && s.startAt !== null && s.startAt >= from && s.startAt < to);
  }
}

export function asAudioContext(f: FakeAudioContext): AudioContext {
  return f as unknown as AudioContext;
}
