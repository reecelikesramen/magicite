import { Content } from '../../../content';
import type { EnemyDef } from '../../../content/types';
import { Pen } from '../draw';
import { BUILTIN_PRIORITY, defineSprite, defineSpriteFamily, type SpriteDef } from '../registry';

/**
 * Creature fallbacks until the enemies/sprites wave lands: rounded-box slimes in any colour
 * (any key containing "slime"). Everything else falls through to the labelled placeholder.
 */
let spriteToEnemy: Map<string, EnemyDef> | null = null;
let enemyCount = -1;
export function enemyForSprite(key: string): EnemyDef | undefined {
  if (!spriteToEnemy || enemyCount !== Content.enemies.size) {
    spriteToEnemy = new Map();
    for (const d of Content.enemies.values()) if (!spriteToEnemy.has(d.sprite)) spriteToEnemy.set(d.sprite, d);
    enemyCount = Content.enemies.size;
  }
  return spriteToEnemy.get(key);
}

interface SlimeLook {
  body: number;
  light: number;
  dark: number;
  eye: number;
  glow: number;
}

const SLIMES: [RegExp, SlimeLook][] = [
  [/bog|swamp|mire/, { body: 0x7a9a3a, light: 0xb8d070, dark: 0x3a5a1a, eye: 0x101808, glow: 0 }],
  [/ice|frost|snow/, { body: 0x8ad0f0, light: 0xe0f8ff, dark: 0x3a7ab0, eye: 0x102030, glow: 0 }],
  [/magma|lava|fire|ember/, { body: 0xff6020, light: 0xffd060, dark: 0xa02010, eye: 0x200800, glow: 0xff6020 }],
  [/blight|pink/, { body: 0xd04090, light: 0xff90d0, dark: 0x701848, eye: 0x200010, glow: 0xff40a0 }],
  [/floaty|sky|blue/, { body: 0x60a0ff, light: 0xc0e0ff, dark: 0x2a4aa0, eye: 0x101020, glow: 0 }],
  [/void|shadow|purple/, { body: 0x8040c0, light: 0xc090ff, dark: 0x40186a, eye: 0xffe040, glow: 0 }],
];
const GREEN: SlimeLook = { body: 0x5ce65c, light: 0xa8ff8a, dark: 0x2e8a2e, eye: 0x102010, glow: 0 };

/** Rounded-box slime; frames: idle (2, squish), move (3: crouch, stretch, air), hurt. */
export function slimeDef(key: string, bw = 8, bh = 6): SpriteDef {
  const look = SLIMES.find(([re]) => re.test(key))?.[1] ?? GREEN;
  const W = bw + 4;
  const H = bh + 3;
  return {
    w: W,
    h: H,
    anims: { idle: 2, move: 3, hurt: 1 },
    fps: { idle: 3, move: 8 },
    meta: { glow: look.glow },
    draw(ctx, anim, frame) {
      const p = new Pen(ctx);
      let w = bw;
      let h = bh;
      if (anim === 'idle' && frame === 1) {
        w = bw + 1;
        h = bh - 1;
      } else if (anim === 'move') {
        if (frame === 0) {
          w = bw + 2;
          h = bh - 2;
        } else if (frame === 1) {
          w = bw - 2;
          h = bh + 2;
        }
      }
      const x0 = Math.round((W - w) / 2);
      const y0 = H - h;
      p.rect(x0, y0 + 1, w, h - 1, look.body);
      p.rect(x0 + 1, y0, w - 2, 1, look.body);
      p.hline(x0 + 1, x0 + w - 2, H - 1, look.dark);
      p.px(x0, H - 1, look.dark);
      p.px(x0 + w - 1, H - 1, look.dark);
      // Highlight.
      p.hline(x0 + 1, x0 + Math.min(3, w - 2), y0 + 1, look.light);
      p.px(x0 + 1, y0 + 2, look.light);
      // Eyes (looking right).
      const ey = y0 + Math.max(2, Math.floor(h / 2) - 1);
      const ex = x0 + w - 3;
      if (anim === 'hurt') {
        p.px(ex - 2, ey, look.eye);
        p.px(ex, ey, look.eye);
        p.px(ex - 1, ey + 1, look.eye);
      } else {
        p.vline(ex - 2, ey, ey + 1, look.eye);
        p.vline(ex, ey, ey + 1, look.eye);
      }
    },
  };
}

export function registerCreatureSprites(): void {
  defineSpriteFamily(
    'slimes',
    (key) => {
      if (!/slime/.test(key) || key.startsWith('item_') || key.startsWith('held:') || key.startsWith('proj')) return null;
      const d = enemyForSprite(key);
      return slimeDef(key, d?.w ?? 8, d?.h ?? 6);
    },
    BUILTIN_PRIORITY,
  );
  defineSprite('enemy_green_slime', slimeDef('enemy_green_slime', 8, 6), BUILTIN_PRIORITY);
}
