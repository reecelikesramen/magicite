import { Application, TextureStyle } from 'pixi.js';
import { InputManager } from './engine/input';
import { Game } from './game/game';
import { LocalSession } from './game/session';
import { GAME_TITLE } from './config';

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

  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e9));
  const input = new InputManager(app.canvas);
  const session = new LocalSession(seed, [{ name: 'RALVAND', race: 'drifter', hat: '', companion: '' }]);
  const game = new Game(app, input, session);
  game.start();
  // Debug handle for tests / console.
  (window as unknown as { game: Game }).game = game;
}

void boot();
