/**
 * Headless visual check: serves the built game (or dev server URL), drives some input and saves
 * screenshots. Usage: bun scripts/screenshot.ts [url] [outDir]
 * Uses the system/pre-installed Chromium (CHROMIUM_PATH or /opt/pw-browsers/chromium).
 */
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:4173/?seed=42';
const out = process.argv[3] ?? 'screenshots';
const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs: string[] = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/01-start.png` });
await page.keyboard.down('KeyD');
await page.waitForTimeout(900);
await page.keyboard.down('Space');
await page.waitForTimeout(250);
await page.keyboard.up('Space');
await page.waitForTimeout(600);
await page.keyboard.up('KeyD');
await page.screenshot({ path: `${out}/02-moved.png` });
await page.mouse.move(800, 360);
await page.mouse.down();
await page.waitForTimeout(800);
await page.mouse.up();
await page.screenshot({ path: `${out}/03-attack.png` });
console.log(logs.join('\n'));
await browser.close();
