/**
 * Headless walk through the menus: title → main → creation → solo run → pause → main.
 * Usage: bun scripts/menu-walk.ts [url] [outDir]
 */
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:4173/';
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
const tap = async (key: string, wait = 120) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(wait);
};
await page.goto(url);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/01-title.png` });
await tap('Enter', 300);
await page.screenshot({ path: `${out}/02-main.png` });
await tap('Enter', 300); // Play Solo
await page.screenshot({ path: `${out}/03-create.png` });
await tap('ArrowUp'); // Difficulty
await tap('ArrowRight');
await page.screenshot({ path: `${out}/04-create-madcap.png` });
await tap('ArrowLeft');
await tap('ArrowDown');
await tap('Enter', 1500); // Descend
await page.screenshot({ path: `${out}/05-playing.png` });
await page.keyboard.down('KeyD');
await page.waitForTimeout(700);
await page.keyboard.up('KeyD');
await tap('Escape', 300);
await page.screenshot({ path: `${out}/06-pause.png` });
await tap('ArrowDown');
await tap('Enter', 600); // Quit to menu
await page.screenshot({ path: `${out}/07-back-to-main.png` });
console.log(logs.join('\n'));
await browser.close();
