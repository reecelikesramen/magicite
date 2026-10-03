import type { Application } from 'pixi.js';
import { Container } from 'pixi.js';
import { GAME_TITLE, NET_CONFIG, VERSION } from '../config';
import { hashSeed, Rng } from '../engine/rng';
import { ClientSession, HostSession, joinTrysteroRoom, makeRoomCode, normalizeRoomCode, type Transport } from '../net';
import { dailySeed, randomName } from '../sim/progression/creation';
import { PixelText } from '../render/pixelfont';
import { creationItems, cycleCreation, formatRoomCode, moveFocus, randomCreation, setupFromCreation, statLine, type CreationState, type MenuModel } from '../ui/menus/model';
import { MenuView } from '../ui/menus/view';
import type { Game, GameOverlay } from './game';
import { availableCompanions, availableHats, availableRaces, loadMeta, type MetaSave } from './meta';
import { LocalSession, type Session } from './session';

type Screen = 'title' | 'main' | 'create' | 'join' | 'connecting' | 'playing' | 'pause' | 'controls';
type Purpose = 'solo' | 'daily' | 'host' | 'join';

const TOKEN_KEY = 'shardfall.token.';
const CONNECT_TIMEOUT_MS = 25_000;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / sandbox: tokens just don't persist */
  }
}

/** WebRTC is unavailable in some sandboxes (claude.ai artifacts) and some Linux webviews. */
export function webrtcAvailable(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

/**
 * App flow: title → main menu → character creation → (host / join / solo) → playing ⇄ pause →
 * run over → main menu. Owns the menus overlay; the Game keeps rendering a demo world behind it.
 */
export class App implements GameOverlay {
  active = true;
  private screen: Screen = 'title';
  private view = new MenuView();
  private toastLayer = new Container();
  private toasts: { text: PixelText; ttl: number }[] = [];
  private model: MenuModel = { title: '', items: [], focus: 0 };
  private keyQ: { key: string; code: string }[] = [];
  private pointer = { x: 0, y: 0, moved: false, clicked: false };
  private meta: MetaSave = loadMeta();
  private creation!: CreationState;
  private purpose: Purpose = 'solo';
  private roomCode = '';
  private transport: Transport | null = null;
  private tick = 0;
  private scale = 1;
  private connectToken = 0;
  private message = '';

  constructor(
    private readonly app: Application,
    private readonly game: Game,
  ) {
    app.stage.addChild(this.view.root, this.toastLayer);
    game.overlay = this;
    game.ui.onRestart = () => this.toMain();
    window.addEventListener('keydown', (e) => {
      if (!this.active && !(e.code === 'Escape' && this.screen === 'playing')) return;
      if (this.active && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Backspace')) e.preventDefault();
      this.keyQ.push({ key: e.key, code: e.code });
    });
    app.canvas.addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.moved = true;
    });
    app.canvas.addEventListener('pointerdown', (e) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      if (e.button === 0) this.pointer.clicked = true;
    });
    this.game.setSession(this.demoSession());
    this.game.ui.onRestart = () => this.toMain();
    this.show('title');
  }

  /** Debug/E2E view of the menu state (window.app.status()). */
  status(): { screen: Screen; purpose: Purpose; roomCode: string; message: string } {
    return { screen: this.screen, purpose: this.purpose, roomCode: formatRoomCode(this.roomCode), message: this.message };
  }

  // --------------------------------------------------------------------------------------------
  // GameOverlay
  // --------------------------------------------------------------------------------------------

  layout(screenW: number, screenH: number, scale: number): void {
    this.scale = scale;
    this.view.layout(screenW, screenH, scale);
    this.toastLayer.scale.set(scale);
  }

  frame(dt: number): void {
    this.tick++;
    // Esc while playing opens the pause menu (unless the HUD is using Esc for the inventory).
    if (this.screen === 'playing') {
      const esc = this.keyQ.some((k) => k.code === 'Escape');
      this.keyQ.length = 0;
      if (esc && !this.game.ui.inventoryOpen) this.show('pause');
    } else if (this.active) this.handleInput();
    this.updateToasts(dt);
    this.view.root.visible = this.active;
    if (this.active) this.view.render({ ...this.model, message: this.message || this.model.message }, this.tick);
  }

  // --------------------------------------------------------------------------------------------
  // Screens
  // --------------------------------------------------------------------------------------------

  private show(screen: Screen): void {
    this.screen = screen;
    this.active = screen !== 'playing';
    this.message = '';
    this.view.logo = screen === 'title' || screen === 'main' ? GAME_TITLE.toUpperCase() : null;
    this.view.shadeAlpha = screen === 'pause' ? 0.5 : 0.65;
    this.game.paused = screen === 'pause' && this.game.session instanceof LocalSession && this.purpose !== 'host';
    this.rebuild();
  }

  private rebuild(): void {
    const online = webrtcAvailable();
    const offlineHint = 'Online play needs the web or desktop build (WebRTC is blocked here)';
    switch (this.screen) {
      case 'title':
        this.model = { title: 'Press any key', items: [], focus: 0, subtitle: `v${VERSION}` };
        break;
      case 'main':
        this.model = {
          title: 'Main Menu',
          focus: this.model.title === 'Main Menu' ? this.model.focus : 0,
          items: [
            { id: 'solo', label: 'Play Solo', hint: 'Descend alone. Death is permanent.' },
            { id: 'host', label: 'Host Online', disabled: !online, hint: online ? 'Start a run; friends join with your room code' : offlineHint },
            { id: 'join', label: 'Join Online', disabled: !online, hint: online ? "Join a friend's run with their room code" : offlineHint },
            { id: 'daily', label: 'Daily Run', hint: `Same world for everyone today (${todayString()})` },
            { id: 'controls', label: 'Controls' },
          ],
        };
        break;
      case 'controls':
        this.model = {
          title: 'Controls',
          focus: 0,
          items: [
            { id: 'c1', label: 'Move / climb', value: 'A D / W S' },
            { id: 'c2', label: 'Jump, double jump', value: 'Space' },
            { id: 'c3', label: 'Dash', value: 'Q / E' },
            { id: 'c4', label: 'Use item', value: 'Mouse L / J' },
            { id: 'c5', label: 'Interact, portal', value: 'F' },
            { id: 'c6', label: 'Skills', value: 'Z X C' },
            { id: 'c7', label: 'Hotbar', value: '1-5, wheel' },
            { id: 'c8', label: 'Inventory', value: 'Tab' },
            { id: 'c9', label: 'Craft', value: 'Shift+click 2' },
            { id: 'back', label: 'Back' },
          ],
        };
        this.model.focus = this.model.items.length - 1;
        break;
      case 'create': {
        const opts = this.unlocked();
        const start = this.purpose === 'host' ? 'Host game' : this.purpose === 'join' ? `Join ${formatRoomCode(this.roomCode)}` : 'Descend';
        const items = creationItems(this.creation, { ...opts, startLabel: start });
        // Keep focus while editing; arriving from another screen focuses the start button.
        const focus = this.model.title === 'New Delver' ? Math.min(this.model.focus, items.length - 1) : items.findIndex((i) => i.id === 'start');
        this.model = { title: 'New Delver', subtitle: statLine(this.creation), items, focus };
        break;
      }
      case 'join':
        this.model = {
          title: 'Join Online',
          focus: this.model.title === 'Join Online' ? this.model.focus : 0,
          items: [
            { id: 'code', label: 'Room code', value: formatRoomCode(this.roomCode) || '___-___', hint: 'Type the code your friend sees' },
            { id: 'next', label: 'Continue', disabled: normalizeRoomCode(this.roomCode).length < 6 },
            { id: 'back', label: 'Back' },
          ],
        };
        break;
      case 'connecting':
        this.model = { title: 'Connecting', subtitle: formatRoomCode(this.roomCode), focus: 0, items: [{ id: 'cancel', label: 'Cancel' }] };
        break;
      case 'pause': {
        const items = [{ id: 'resume', label: 'Resume' }] as MenuModel['items'];
        if (this.purpose === 'host') items.push({ id: 'room', label: 'Room code', value: formatRoomCode(this.roomCode), hint: 'Share this code; friends can join any time' });
        items.push({ id: 'quit', label: 'Quit to menu', hint: this.purpose === 'join' ? 'Leave the run' : 'Abandon this run' });
        this.model = { title: 'Paused', subtitle: this.game.paused ? undefined : 'The world keeps moving online', items, focus: 0 };
        break;
      }
      case 'playing':
        break;
    }
  }

  // --------------------------------------------------------------------------------------------
  // Input
  // --------------------------------------------------------------------------------------------

  private handleInput(): void {
    let keys = this.keyQ.splice(0);
    if (this.screen === 'title') {
      if (!keys.length && !this.pointer.clicked) return;
      this.pointer.clicked = false;
      // Only the first key dismisses the title; later keys from the same frame navigate the menu.
      keys = keys.slice(1);
      this.show('main');
    }
    for (const k of keys) {
      if (this.textEdit(k)) continue;
      switch (k.code) {
        case 'ArrowUp':
        case 'KeyW':
          this.model.focus = moveFocus(this.model, -1);
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.model.focus = moveFocus(this.model, 1);
          break;
        case 'ArrowLeft':
        case 'KeyA':
          this.cycle(-1);
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.cycle(1);
          break;
        case 'Enter':
        case 'NumpadEnter':
        case 'Space':
          this.activate();
          break;
        case 'Escape':
          this.back();
          break;
      }
    }
    if (this.pointer.moved) {
      const i = this.view.hit(this.pointer.x, this.pointer.y);
      if (i >= 0 && !this.model.items[i]!.disabled) this.model.focus = i;
      this.pointer.moved = false;
    }
    if (this.pointer.clicked) {
      this.pointer.clicked = false;
      const i = this.view.hit(this.pointer.x, this.pointer.y);
      if (i >= 0 && !this.model.items[i]!.disabled) {
        this.model.focus = i;
        const side = this.view.side(this.pointer.x, i);
        if (this.model.items[i]!.cycle && side !== 0) this.cycle(side);
        else this.activate();
      }
    }
  }

  /** Typing on text items (name / room code). Returns true if the key was consumed. */
  private textEdit(k: { key: string; code: string }): boolean {
    const item = this.model.items[this.model.focus];
    if (!item) return false;
    if (this.screen === 'create' && item.id === 'name') {
      if (k.code === 'Backspace') this.creation.name = this.creation.name.slice(0, -1);
      // Every letter types here (arrows still navigate), so names can contain W/A/S/D.
      else if (/^[a-zA-Z]$/.test(k.key)) this.creation.name = (this.creation.name + k.key.toUpperCase()).slice(0, 10);
      else return false;
      this.rebuild();
      return true;
    }
    if (this.screen === 'join' && item.id === 'code') {
      if (k.code === 'Backspace') this.roomCode = normalizeRoomCode(this.roomCode).slice(0, -1);
      else if (/^[a-zA-Z0-9]$/.test(k.key)) this.roomCode = normalizeRoomCode(this.roomCode + k.key).slice(0, 6);
      else return false;
      this.rebuild();
      return true;
    }
    return false;
  }

  private cycle(dir: number): void {
    const item = this.model.items[this.model.focus];
    if (!item?.cycle || this.screen !== 'create') return;
    cycleCreation(this.creation, item.id, dir, this.unlocked());
    this.rebuild();
  }

  private back(): void {
    switch (this.screen) {
      case 'create':
        this.show(this.purpose === 'join' ? 'join' : 'main');
        break;
      case 'join':
      case 'controls':
        this.show('main');
        break;
      case 'connecting':
        this.cancelConnect();
        break;
      case 'pause':
        this.show('playing');
        break;
    }
  }

  private activate(): void {
    const item = this.model.items[this.model.focus];
    if (!item || item.disabled) return;
    switch (this.screen) {
      case 'main':
        if (item.id === 'controls') this.show('controls');
        else if (item.id === 'join') {
          this.purpose = 'join';
          this.show('join');
        } else this.beginCreation(item.id as Purpose);
        break;
      case 'controls':
        if (item.id === 'back') this.show('main');
        break;
      case 'join':
        if (item.id === 'next' && normalizeRoomCode(this.roomCode).length >= 6) this.beginCreation('join');
        else if (item.id === 'back') this.show('main');
        break;
      case 'create':
        if (item.id === 'name') {
          this.creation.name = randomName(new Rng(hashSeed(`${this.tick}:${this.creation.name}`)));
          this.rebuild();
        } else if (item.id === 'start') void this.startRun();
        else if (item.id === 'back') this.back();
        else if (item.cycle) this.cycle(1);
        break;
      case 'connecting':
        this.cancelConnect();
        break;
      case 'pause':
        if (item.id === 'resume') this.show('playing');
        else if (item.id === 'quit') this.toMain();
        break;
    }
  }

  // --------------------------------------------------------------------------------------------
  // Runs & sessions
  // --------------------------------------------------------------------------------------------

  private unlocked(): { races: string[]; hats: string[]; companions: string[] } {
    return {
      races: availableRaces(this.meta).map((r) => r.id),
      hats: availableHats(this.meta).map((h) => h.id),
      companions: availableCompanions(this.meta).map((c) => c.id),
    };
  }

  private beginCreation(purpose: Purpose): void {
    this.purpose = purpose;
    if (!this.creation) this.creation = randomCreation(new Rng(hashSeed(`create:${performance.now()}`)), this.unlocked().races);
    this.model = { title: '', items: [], focus: 0 };
    this.show('create');
  }

  private demoSession(): Session {
    const s = new LocalSession(hashSeed('menu-demo'), [{ name: 'DEMO', race: 'drifter', hat: '', companion: '' }]);
    const e = s.world.playerEntity(0);
    if (e) e.invuln = 1e9;
    return s;
  }

  private async startRun(): Promise<void> {
    const setup = setupFromCreation(this.creation);
    if (this.purpose === 'solo' || this.purpose === 'daily') {
      const seed = this.purpose === 'daily' ? dailySeed(todayString()) : Math.floor(Math.random() * 1e9);
      this.game.setSession(new LocalSession(seed, [setup]));
      this.game.ui.onRestart = () => this.toMain();
      this.show('playing');
      return;
    }
    if (this.purpose === 'host') {
      this.roomCode = normalizeRoomCode(makeRoomCode());
      await this.connect(async (track) => {
        const transport = track(await joinTrysteroRoom({ roomCode: formatRoomCode(this.roomCode), ...NET_CONFIG.trystero }));
        const host = new HostSession({ transport, seed: Math.floor(Math.random() * 1e9), setups: [setup] });
        host.onPlayerJoin = (_i, name, reconnect) => this.toast(`${name} ${reconnect ? 'reconnected' : 'joined'}`);
        host.onPlayerLeave = (_i, name, reason) => this.toast(`${name} left (${reason})`);
        return host;
      });
      if (this.screen === 'playing') this.toast(`Room ${formatRoomCode(this.roomCode)} - share it! (Esc shows it again)`, 8);
      return;
    }
    await this.connect(async (track) => {
      const code = formatRoomCode(this.roomCode);
      const transport = track(await joinTrysteroRoom({ roomCode: code, ...NET_CONFIG.trystero }));
      const client = new ClientSession({ transport, setup, token: storageGet(TOKEN_KEY + normalizeRoomCode(code)) ?? undefined });
      if (this.transport !== transport) throw new Error('cancelled');
      // The client only processes packets when ticked: run it behind the "Connecting" menu.
      this.game.setSession(client);
      this.game.ui.onRestart = () => this.toMain();
      await new Promise<void>((resolve, reject) => {
        client.onStateChange = (state, reason) => {
          if (state === 'joined') {
            storageSet(TOKEN_KEY + normalizeRoomCode(code), client.token);
            resolve();
          } else if (state === 'rejected') reject(new Error(reason || 'rejected'));
          else if (state === 'disconnected') {
            if (this.screen === 'playing' || this.screen === 'pause') {
              this.toast(`Disconnected: ${reason || 'host left'}`, 6);
              this.toMain();
            } else reject(new Error(reason || 'disconnected'));
          }
        };
      });
      return client;
    });
  }

  /**
   * Run a connect attempt with a timeout and a cancel button; swaps the session on success. `open`
   * registers its transport with `track` as soon as it exists so a timeout/cancel can close it.
   */
  private async connect(open: (track: (t: Transport) => Transport) => Promise<Session>): Promise<void> {
    const token = ++this.connectToken;
    this.show('connecting');
    this.message = this.purpose === 'host' ? 'Opening room...' : 'Finding the host...';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const track = (t: Transport) => {
      // A cancelled attempt that finishes late just closes its own transport.
      if (token !== this.connectToken) t.close();
      else this.transport = t;
      return t;
    };
    try {
      const session = await Promise.race([
        open(track),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timed out - is the host online?')), CONNECT_TIMEOUT_MS);
        }),
      ]);
      if (token !== this.connectToken) {
        if (this.game.session !== session) session.dispose();
        return;
      }
      this.game.setSession(session);
      this.game.ui.onRestart = () => this.toMain();
      this.show('playing');
    } catch (err) {
      if (token !== this.connectToken) return;
      this.abandonConnection();
      this.show(this.purpose === 'join' ? 'join' : 'main');
      this.message = `!Could not connect: ${(err as Error).message}`;
    } finally {
      clearTimeout(timer);
    }
  }

  private cancelConnect(): void {
    this.connectToken++;
    this.abandonConnection();
    this.show(this.purpose === 'join' ? 'join' : 'main');
  }

  /** Drop a half-open connection: close its transport and put the demo world back. */
  private abandonConnection(): void {
    this.transport?.close();
    this.transport = null;
    if (!(this.game.session instanceof LocalSession)) this.game.setSession(this.demoSession());
  }

  /** Leave the current run (any mode) and return to the main menu over the demo world. */
  toMain(): void {
    this.connectToken++;
    this.game.setSession(this.demoSession());
    this.game.ui.onRestart = () => this.toMain();
    this.transport?.close();
    this.transport = null;
    this.meta = loadMeta();
    this.show('main');
  }

  // --------------------------------------------------------------------------------------------
  // Toasts (connection news, room code) — shown in menus and in game
  // --------------------------------------------------------------------------------------------

  toast(text: string, seconds = 4): void {
    const t = new PixelText(text, { color: 0x9fe0ff });
    this.toastLayer.addChild(t);
    this.toasts.push({ text: t, ttl: seconds });
  }

  private updateToasts(dt: number): void {
    const viewW = this.app.screen.width / this.scale;
    let y = 30;
    for (const t of this.toasts) {
      t.ttl -= dt;
      t.text.alpha = Math.max(0, Math.min(1, t.ttl));
      t.text.position.set(Math.round((viewW - t.text.textWidth) / 2), y);
      y += 10;
    }
    for (const t of this.toasts.filter((x) => x.ttl <= 0)) t.text.destroy();
    this.toasts = this.toasts.filter((x) => x.ttl > 0);
  }
}

function todayString(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

