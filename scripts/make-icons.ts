/**
 * Generates the desktop app icons from a 32×32 pixel-art shard drawn in code (nearest-neighbour
 * upscaled): desktop/assets/icon.png (512), icon.ico (PNG-in-ICO, 256) and icon.iconset/ (macOS).
 * Usage: bun scripts/make-icons.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

// 32×32 shard: palette indices per row ('.' = transparent).
const ART = [
  '................................',
  '...............aa...............',
  '..............abba..............',
  '.............abbcca.............',
  '............abbbccca............',
  '...........abbbbcccca...........',
  '..........abbbbbccccca..........',
  '.........abbbbbbcccccca.........',
  '........abbbbbbbccccccca........',
  '.......abbbbbbbbcccccccca.......',
  '......abbbwbbbbbcccccccccа......',
  '.....abbbwwbbbbbccccccccca......',
  '.....abbwwbbbbbbcccccccccca.....',
  '....abbbwbbbbbbbccccccccccca....',
  '....abbbbbbbbbbbcccccccccccа....',
  '...addddddddddddeeeeeeeeeeeea...',
  '...adddddddddddddeeeeeeeeeeea...',
  '....addddddddddddeeeeeeeeeea....',
  '....adddddddddddddeeeeeeeeea....',
  '.....addddddddddddeeeeeeeea.....',
  '.....adddddddddddddeeeeeeea.....',
  '......addddddddddddeeeeeea......',
  '.......adddddddddddeeeeea.......',
  '........addddddddddeeeea........',
  '.........adddddddddeeea.........',
  '..........addddddddeea..........',
  '...........adddddddea...........',
  '............addddddа............',
  '.............addda..............',
  '..............ada...............',
  '...............a................',
  '................................',
].map((r) => r.replace(/а/g, 'a'));
const PAL: Record<string, string> = { a: '#1a0f2e', b: '#9fe8ff', c: '#4fb8e8', d: '#2a7fc0', e: '#1c4f8a', w: '#ffffff' };

const out = 'desktop/assets';
mkdirSync(`${out}/icon.iconset`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

async function render(size: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ art, pal, size }) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d')!;
      // Rounded dark tile behind the shard so it reads on light and dark docks.
      const r = size * 0.18;
      g.fillStyle = '#120c08';
      g.beginPath();
      g.roundRect(size * 0.04, size * 0.04, size * 0.92, size * 0.92, r);
      g.fill();
      const px = (size * 0.84) / 32;
      const o = size * 0.08;
      art.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch === '.') return;
          g.fillStyle = pal[ch] ?? '#ff00ff';
          g.fillRect(Math.floor(o + x * px), Math.floor(o + y * px), Math.ceil(px), Math.ceil(px));
        }),
      );
      return c.toDataURL('image/png');
    },
    { art: ART, pal: PAL, size },
  );
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

writeFileSync(`${out}/icon.png`, await render(512));
// ICO containing one 256×256 PNG (supported since Windows Vista).
const png256 = await render(256);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt8(0, 6); // 0 = 256 px
ico.writeUInt8(0, 7);
ico.writeUInt8(0, 8);
ico.writeUInt8(0, 9);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png256.length, 14);
ico.writeUInt32LE(22, 18);
writeFileSync(`${out}/icon.ico`, Buffer.concat([ico, png256]));
for (const s of [16, 32, 128, 256, 512]) {
  writeFileSync(`${out}/icon.iconset/icon_${s}x${s}.png`, await render(s));
  writeFileSync(`${out}/icon.iconset/icon_${s}x${s}@2x.png`, await render(s * 2));
}
await browser.close();
console.log(`icons written to ${out}`);
