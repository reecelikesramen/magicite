import { Application, TextureStyle } from 'pixi.js';
import { InputManager } from './engine/input';
import { Game } from './game/game';
import { App } from './game/app';
import { LocalSession } from './game/session';
import { enterLevel, requestFor } from './sim/run';
import { GAME_TITLE } from './config';
import { getIcon } from './render/sprites';
import { resolveSpriteDef } from './render/sprites/registry';
import { setItemIconSource } from './ui/icons';

async function boot(): Promise<void> {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x000000,
    antialias: false,
    roundPixels: true,
    autoDensity: true,
    resolution: 1,
    preference: 'webgl',
  });
  document.getElementById('app')!.appendChild(app.canvas);
  document.title = GAME_TITLE;

  setItemIconSource((def) => (resolveSpriteDef(def.sprite) ? getIcon(def.sprite) : null));

  const params = new URLSearchParams(location.search);
  const input = new InputManager(app.canvas);
  // `?seed=N` skips the menus straight into a solo run (dev/testing); otherwise the title screen.
  const fixedSeed = params.get('seed');
  // Dev: `&level=5&biome=woods` jumps straight to that run level (boss arenas, towns, the lair).
  const jumpLevel = Number(params.get('level') ?? 0);
  const solo = () =>
    new LocalSession(Number(fixedSeed), [{ name: 'RALVAND', race: 'drifter', hat: '', companion: '' }], (w) => {
      if (jumpLevel > 1) enterLevel(w, requestFor(w, jumpLevel, params.get('biome') ?? undefined));
    });
  const game = new Game(app, input, fixedSeed ? solo() : new LocalSession(1, [{ name: 'DEMO', race: 'drifter', hat: '', companion: '' }]), fixedSeed ? solo : undefined);
  if (!fixedSeed) (window as unknown as { app: App }).app = new App(app, game);
  game.start();
  // Debug handle for tests / console.
  (window as unknown as { game: Game }).game = game;
}

void boot();
