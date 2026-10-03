import { Application, TextureStyle } from 'pixi.js';
import { InputManager } from './engine/input';
import { Game } from './game/game';
import { LocalSession } from './game/session';
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
  const fixedSeed = params.get('seed');
  const newSession = () =>
    new LocalSession(fixedSeed ? Number(fixedSeed) : Math.floor(Math.random() * 1e9), [{ name: 'RALVAND', race: 'drifter', hat: '', companion: '' }]);
  const input = new InputManager(app.canvas);
  const game = new Game(app, input, newSession(), newSession);
  game.start();
  // Debug handle for tests / console.
  (window as unknown as { game: Game }).game = game;
}

void boot();
