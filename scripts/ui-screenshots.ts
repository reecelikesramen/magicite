/**
 * UI visual check: drives the HUD, inventory/crafting, recipe book, skill-path panel, toasts,
 * downed and run-over screens and saves screenshots. Debug-pokes sim state through the
 * `window.game` handle to reach states that normal play takes minutes to produce.
 * Usage: bun scripts/ui-screenshots.ts [url] [outDir] [width] [height]
 */
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:4173/?seed=42';
const out = process.argv[3] ?? 'screenshots/ui';
const W = Number(process.argv[4] ?? 1280);
const H = Number(process.argv[5] ?? 720);
const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs: string[] = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/01-hud-banner.png` });

// Populate the player with a varied inventory (unknown ids still get keyword-based icons).
await page.evaluate(() => {
  const g = (window as any).game;
  const w = g.session.world;
  const p = w.players[0];
  const items: [string, number, number?][] = [
    ['axe', 1, 40], ['wooden_bow', 1], ['iron_sword', 1, 60], ['meat', 3], ['torch', 12],
    ['wood', 23], ['wood', 5], ['stone', 14], ['plank', 4], ['iron_ore', 6], ['gold_bar', 2], ['diamond', 1],
    ['health_potion', 2], ['mana_potion', 1], ['arrow', 99], ['string', 3], ['bomb', 4], ['bug_net', 1, 20], ['herb', 5], ['glowcap', 2],
  ];
  items.forEach(([id, count, dur], i) => (p.inventory[i] = dur !== undefined ? { id, count, durability: dur } : { id, count }));
  p.equipment.head = { id: 'iron_helmet', count: 1 };
  p.equipment.accessory1 = { id: 'ruby_ring', count: 1 };
  p.equipment.ammo = { id: 'arrow', count: 45 };
  p.gold = 37;
  p.xp = 5;
  p.knownRecipes.push('wood+wood', 'stick+string', 'iron_bar+iron_bar', 'herb+glowcap');
});
await page.waitForTimeout(300);
// Damage the axe so its durability bar shows.
await page.evaluate(() => {
  const p = (window as any).game.session.world.players[0];
  p.inventory[0].durability = 14;
  p.inventory[2].durability = 50;
  p.gold = 52;
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/02-hud-items.png` });

// Inventory open + hover tooltip.
await page.keyboard.press('Tab');
await page.waitForTimeout(250);
const scale = await page.evaluate(() => (window as any).game.renderer.scale as number);
const at = (x: number, y: number) => [x * scale + scale / 2, y * scale + scale / 2] as const;
let [mx, my] = at(3 + 2 * 16 + 7, 12 + 7);
await page.mouse.move(mx, my);
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/03-inventory-tooltip.png` });

// Shift+click wood + wood (backpack slots 0 and 1 → inventory 5, 6) to craft.
await page.keyboard.down('ShiftLeft');
[mx, my] = at(3 + 7, 94 + 7);
await page.mouse.click(mx, my);
await page.waitForTimeout(100);
await page.screenshot({ path: `${out}/04-craft-pick.png` });
[mx, my] = at(3 + 16 + 7, 94 + 7);
await page.mouse.click(mx, my);
await page.keyboard.up('ShiftLeft');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/05-crafted.png` });

// Pick up the bow and hover an equipment slot (invalid target highlight).
[mx, my] = at(3 + 16 + 7, 12 + 7);
await page.mouse.click(mx, my);
[mx, my] = at(3 + 7, 31 + 22 + 7);
await page.mouse.move(mx, my);
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/06-held-item.png` });
await page.mouse.click(mx, my);
await page.waitForTimeout(150);

// Recipe book.
const btn = await page.evaluate(() => (window as any).game.ui.inv.L.buttons.recipes);
[mx, my] = at(btn.x + 5, btn.y + 5);
await page.mouse.click(mx, my);
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/07-recipe-book.png` });
await page.keyboard.press('Tab');

// Skill path selection + slotted skills with cooldowns.
await page.evaluate(() => {
  const p = (window as any).game.session.world.players[0];
  p.skillPicks = 1;
  p.skillOffer = ['whirlwind', 'fire_burst', 'multishot'];
  p.skillSlots = ['cleave', 'blink'];
  p.skillCooldowns = [200, 0];
  p.level = 5;
});
await page.waitForTimeout(250);
const sp = await page.evaluate(() => (window as any).game.ui.skills.L.buttons[1]);
[mx, my] = at(sp.x + 10, sp.y + 10);
await page.mouse.move(mx, my);
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/08-skill-panel.png` });

// Toasts, pickups, level-up.
await page.evaluate(() => {
  const s = (window as any).game.session;
  s.pending.push(
    { type: 'message', text: 'A chill creeps into the air...', color: 0x9ad8ff },
    { type: 'pickup', player: 0, item: 'wood', count: 2 },
    { type: 'pickup', player: 0, item: 'wood', count: 1 },
    { type: 'pickup', player: 0, item: 'stone', count: 3 },
    { type: 'levelUp', player: 0, level: 6 },
  );
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/09-toasts-levelup.png` });

// Downed.
await page.evaluate(() => {
  const p = (window as any).game.session.world.players[0];
  p.skillPicks = 0;
  p.downed = true;
  p.reviveProgress = 70;
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/10-downed.png` });

// Run over.
await page.evaluate(() => {
  const w = (window as any).game.session.world;
  w.players[0].downed = false;
  Object.assign(w.players[0].runStats, { kills: 23, bossKills: 1, damageDealt: 141, damageTaken: 19, itemsCrafted: 12, recipesDiscovered: 4, treesChopped: 9, oresMined: 7, goldEarned: 312, districtsCleared: 3 });
  w.run.over = true;
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/11-run-over.png` });

console.log(logs.join('\n'));
await browser.close();
