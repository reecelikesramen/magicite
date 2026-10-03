/**
 * Real multiplayer end-to-end check: two headless Chromium browsers, real WebRTC (trystero), a local
 * signaling relay (server/relay.ts) — no mocks. The host creates a room through the menus, the
 * joiner types the room code, both play, and we assert that state flows both ways.
 *
 *   bun scripts/build-artifact.ts && (cd dist-artifact && python3 -m http.server 4400) &
 *   bun scripts/mp-e2e.ts [pageUrl] [outDir]
 *
 * pageUrl defaults to http://localhost:4400/local-test.html. Exits non-zero on failure.
 */
import { spawn } from 'node:child_process';
import { chromium, type Page } from 'playwright-core';

const pageUrl = process.argv[2] ?? 'http://localhost:4400/local-test.html';
const out = process.argv[3] ?? 'screenshots';
const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const RELAY_PORT = Number(process.env.RELAY_PORT ?? 7787);
/** RELAY_URL=ws://127.0.0.1:8790 tests another relay (e.g. `wrangler dev` of server/cloudflare). */
const relayUrl = process.env.RELAY_URL ?? `ws://127.0.0.1:${RELAY_PORT}`;
const url = `${pageUrl}?relay=${encodeURIComponent(relayUrl)}&ice=none`;

type Status = { screen: string; purpose: string; roomCode: string; message: string };
type Probe = {
  /** This page's own player index. */
  me: number;
  players: { name: string; x: number; y: number; hp: number }[];
  level: number;
  tick: number;
  rtt?: number;
  snapshots?: number;
  corrections?: number;
};

const relay = process.env.RELAY_URL
  ? null
  : spawn('bun', ['server/relay.ts'], { env: { ...process.env, PORT: String(RELAY_PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
if (relay) {
  await new Promise<void>((resolve, reject) => {
    relay.stdout!.on('data', (d: Buffer) => (d.toString().includes('signaling relay') ? resolve() : undefined));
    relay.on('exit', (c) => reject(new Error(`relay exited ${c}`)));
    setTimeout(() => reject(new Error('relay did not start')), 10_000);
  });
}
console.log(`relay: ${relayUrl}`);

const browser = await chromium.launch({
  executablePath: exe,
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    // Same-machine peers: expose real host candidates instead of unresolvable mDNS names.
    '--disable-features=WebRtcHideLocalIpsWithMdns',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

async function open(label: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${label} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${label} ${m.type()}] ${m.text()}`);
  });
  await page.goto(url);
  await page.waitForFunction(() => !!(window as unknown as { app?: unknown }).app, null, { timeout: 15_000 });
  return page;
}

const status = (p: Page) => p.evaluate(() => (window as unknown as { app: { status(): Status } }).app.status());
const probe = (p: Page) =>
  p.evaluate((): Probe => {
    const g = (window as unknown as { game: { session: { world: any; stats?: any } } }).game;
    const w = g.session.world;
    return {
      me: (g.session as unknown as { localPlayers: number[] }).localPlayers[0] ?? 0,
      players: w.players.map((pl: any, i: number) => {
        const e = w.playerEntity(i);
        return { name: pl.name, x: e?.x ?? NaN, y: e?.y ?? NaN, hp: e?.hp ?? NaN };
      }),
      level: w.run.path?.length ?? 0,
      tick: w.tick ?? 0,
      rtt: g.session.stats?.rttMs,
      snapshots: g.session.stats?.snapshots,
      corrections: g.session.stats?.corrections,
    };
  });

async function tap(p: Page, key: string, times = 1) {
  for (let i = 0; i < times; i++) {
    await p.keyboard.press(key);
    await p.waitForTimeout(80);
  }
}

async function waitScreen(p: Page, screen: string, timeoutMs: number): Promise<Status> {
  const t0 = Date.now();
  let s = await status(p);
  while (s.screen !== screen && Date.now() - t0 < timeoutMs) {
    await p.waitForTimeout(250);
    s = await status(p);
  }
  return s;
}

try {
  // ---- Host: title → Host Online → creation → Host game
  const host = await open('host');
  await tap(host, 'Enter');
  await waitScreen(host, 'main', 5_000);
  await tap(host, 'ArrowDown'); // Host Online
  await tap(host, 'Enter'); // → creation (focus on start)
  await waitScreen(host, 'create', 5_000);
  await tap(host, 'Enter'); // Host game
  const hs = await waitScreen(host, 'playing', 30_000);
  check(hs.screen === 'playing' && /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(hs.roomCode), `host opened room ${hs.roomCode} (${hs.screen} ${hs.message})`);

  // ---- Joiner: title → Join Online → type code → Continue → creation → Join
  const join = await open('join');
  await tap(join, 'Enter');
  await waitScreen(join, 'main', 5_000);
  await tap(join, 'ArrowDown', 2); // Join Online
  await tap(join, 'Enter');
  await waitScreen(join, 'join', 5_000);
  for (const ch of hs.roomCode.replace('-', '')) await tap(join, ch.toLowerCase());
  await tap(join, 'ArrowDown'); // Continue
  await tap(join, 'Enter');
  await waitScreen(join, 'create', 5_000);
  await tap(join, 'Enter'); // Join XXX-XXX
  const t0 = Date.now();
  const js = await waitScreen(join, 'playing', 40_000);
  check(js.screen === 'playing', `joiner connected in ${((Date.now() - t0) / 1000).toFixed(1)}s (${js.screen} ${js.message})`);

  await host.waitForTimeout(1500);
  const h1 = await probe(host);
  const j1 = await probe(join);
  check(h1.players.length === 2, `host world has 2 players (${h1.players.map((p) => p.name).join(', ')})`);
  check(j1.players.length === 2, `joiner world has 2 players (${j1.players.map((p) => p.name).join(', ')})`);
  check((j1.snapshots ?? 0) > 20, `joiner receives snapshots (${j1.snapshots})`);

  // ---- Joiner moves right: host must see player 1 move.
  await join.bringToFront();
  await join.keyboard.down('KeyD');
  await join.waitForTimeout(1200);
  await join.keyboard.up('KeyD');
  await join.waitForTimeout(600);
  const h2 = await probe(host);
  const j2 = await probe(join);
  const hostSeesMove = Math.abs(h2.players[1]!.x - h1.players[1]!.x);
  check(hostSeesMove > 16, `host sees joiner move (${hostSeesMove.toFixed(1)}px)`);
  const agree = Math.abs(h2.players[1]!.x - j2.players[1]!.x);
  check(agree < 12, `joiner prediction agrees with host (${agree.toFixed(1)}px apart)`);

  // ---- Host moves left: joiner must see player 0 move.
  await host.bringToFront();
  await host.keyboard.down('KeyA');
  await host.waitForTimeout(1200);
  await host.keyboard.up('KeyA');
  await host.waitForTimeout(800);
  const h3 = await probe(host);
  const j3 = await probe(join);
  const joinerSeesMove = Math.abs(j3.players[0]!.x - j2.players[0]!.x);
  check(joinerSeesMove > 16, `joiner sees host move (${joinerSeesMove.toFixed(1)}px)`);
  const agree0 = Math.abs(h3.players[0]!.x - j3.players[0]!.x);
  check(agree0 < 12, `interpolated host position close to authoritative (${agree0.toFixed(1)}px)`);
  console.log(`      rtt ${j3.rtt?.toFixed(1)}ms, snapshots ${j3.snapshots}, corrections ${j3.corrections}`);

  // ---- Host tab goes to the background (rAF stops): the world must keep running for the joiner.
  await host.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await host.waitForTimeout(300);
  const hb0 = await probe(host);
  await join.bringToFront();
  await join.keyboard.down('KeyA');
  await join.waitForTimeout(1000);
  await join.keyboard.up('KeyA');
  await join.waitForTimeout(600);
  const hb1 = await probe(host);
  const hiddenMove = Math.abs(hb1.players[1]!.x - hb0.players[1]!.x);
  check(hiddenMove > 16, `hidden host keeps simulating (joiner moved ${hiddenMove.toFixed(1)}px on host)`);

  await host.screenshot({ path: `${out}/mp-host.png` });
  await join.screenshot({ path: `${out}/mp-join.png` });

  // ---- Joiner quits: host keeps running and is told.
  await tap(join, 'Escape');
  await waitScreen(join, 'pause', 5_000);
  await tap(join, 'ArrowDown');
  await tap(join, 'Enter');
  const jq = await waitScreen(join, 'main', 5_000);
  check(jq.screen === 'main', 'joiner returned to the main menu');
  await host.waitForTimeout(1500);
  const hs2 = await status(host);
  check(hs2.screen === 'playing', 'host still playing after joiner left');
  // Free the CPU for the next phase (software-rendered pages are heavy).
  await host.context().close();
  await join.context().close();

  // ---- Dedicated server: two browsers join `bun server/dedicated.ts` over WebSocket ("Join Server").
  const SERVER_PORT = Number(process.env.SERVER_PORT ?? 8799);
  const server = spawn('bun', ['server/dedicated.ts'], { env: { ...process.env, PORT: String(SERVER_PORT), SEED: '99' }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise<void>((resolve, reject) => {
      server.stdout!.on('data', (d: Buffer) => (/listening|ws:\/\//i.test(d.toString()) ? resolve() : undefined));
      server.on('exit', (c) => reject(new Error(`dedicated server exited ${c}`)));
      setTimeout(resolve, 3000);
    });
    const serverUrl = `${pageUrl}?server=${encodeURIComponent(`ws://127.0.0.1:${SERVER_PORT}`)}`;
    const joinServer = async (label: string) => {
      const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log(`[${label} pageerror] ${e.message}`));
      await page.goto(serverUrl);
      await page.waitForFunction(() => !!(window as unknown as { app?: unknown }).app, null, { timeout: 15_000 });
      await tap(page, 'Enter');
      await waitScreen(page, 'main', 5_000);
      await tap(page, 'ArrowDown', 3); // Play Solo, Host, Join, *Join Server*
      await tap(page, 'Enter');
      await waitScreen(page, 'create', 5_000);
      await tap(page, 'Enter');
      return { page, status: await waitScreen(page, 'playing', 20_000) };
    };
    const a = await joinServer('srvA');
    check(a.status.screen === 'playing', `browser A joined the dedicated server (${a.status.screen} ${a.status.message})`);
    const b2 = await joinServer('srvB');
    check(b2.status.screen === 'playing', `browser B joined the dedicated server (${b2.status.screen} ${b2.status.message})`);
    await a.page.waitForTimeout(1500);
    const pa = await probe(a.page);
    const pb = await probe(b2.page);
    check(pa.players.length === 2 && pb.players.length === 2, `both see 2 players on the server (${pa.players.length}, ${pb.players.length})`);
    // B walks (whichever way is open); A must see B where B is (indices come from the server).
    await b2.page.bringToFront();
    const bi = pb.me;
    const selfBefore = pb.players[bi]?.x ?? 0;
    for (const key of ['KeyD', 'KeyA']) {
      await b2.page.keyboard.down(key);
      await b2.page.waitForTimeout(1200);
      await b2.page.keyboard.up(key);
      if (Math.abs(((await probe(b2.page)).players[bi]?.x ?? 0) - selfBefore) > 16) break;
    }
    await a.page.waitForTimeout(800);
    const selfAfter = (await probe(b2.page)).players[bi]?.x ?? 0;
    const seenByA = (await probe(a.page)).players[bi]?.x ?? 0;
    check(Math.abs(selfAfter - selfBefore) > 16, `B moved on the server (${(selfAfter - selfBefore).toFixed(1)}px)`);
    check(Math.abs(seenByA - selfAfter) < 12, `A sees B where B is (${Math.abs(seenByA - selfAfter).toFixed(1)}px apart)`);
  } finally {
    server.kill();
  }
} catch (err) {
  failures.push(String(err));
  console.log(`FAIL  ${String(err)}`);
} finally {
  await browser.close();
  relay?.kill();
}

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall multiplayer checks passed');
process.exit(failures.length ? 1 : 0);
