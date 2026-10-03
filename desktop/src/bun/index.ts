import { BrowserWindow } from 'electrobun/bun';

// One window running the web build. Everything (sim, render, netcode) lives in the page; the Bun
// side only owns the window, so the desktop and web versions behave identically. The app quits
// when the window closes (runtime.exitOnLastWindowClosed defaults to true).
new BrowserWindow({
  title: 'Shardfall',
  url: 'views://game/index.html',
  frame: { width: 1280, height: 760, x: 120, y: 80 },
});
