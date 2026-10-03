import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { hashSeed } from '../../src/engine/rng';
import { registerBuiltinSprites } from '../../src/render/sprites';
import { heldKey } from '../../src/render/sprites/builtin/items';
import {
  defineSprite,
  defineSpriteFamily,
  hasSprite,
  pickAnim,
  resolveSpriteDef,
  ShelfPacker,
  spriteOrigin,
  type PixelContext,
  type SpriteDef,
} from '../../src/render/sprites/registry';

/** Fake 2D context that records drawn pixels (generators only use fillRect + fillStyle). */
class FakeCtx implements PixelContext {
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  globalAlpha = 1;
  inside = 0;
  outside = 0;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {}
  fillRect(x: number, y: number, w: number, h: number): void {
    if (!/^#[0-9a-f]{6}$/i.test(String(this.fillStyle))) throw new Error(`bad colour ${String(this.fillStyle)}`);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) xx >= 0 && yy >= 0 && xx < this.w && yy < this.h ? this.inside++ : this.outside++;
  }
  clearRect(): void {}
}

function drawAll(key: string, def: SpriteDef): FakeCtx[] {
  const out: FakeCtx[] = [];
  for (const [anim, n] of Object.entries(def.anims)) {
    for (let f = 0; f < n; f++) {
      const ctx = new FakeCtx(def.w, def.h);
      def.draw(ctx, anim, f, { key, seed: hashSeed(key) });
      out.push(ctx);
    }
  }
  return out;
}

registerBuiltinSprites();

describe('sprite registry', () => {
  it('explicit defs override families; lower priority never clobbers higher', () => {
    const a: SpriteDef = { w: 4, h: 4, anims: { idle: 1 }, draw: () => {} };
    const b: SpriteDef = { w: 6, h: 6, anims: { idle: 2 }, draw: () => {} };
    defineSprite('test_thing', a, 5);
    defineSprite('test_thing', b, 1);
    expect(resolveSpriteDef('test_thing')).toBe(a);
    defineSprite('test_thing', b, 5);
    expect(resolveSpriteDef('test_thing')).toBe(b);
    expect(hasSprite('test_thing')).toBe(true);
  });

  it('families resolve pattern keys and unknown keys resolve to null (placeholder)', () => {
    defineSpriteFamily('test_fam', (k) => (k.startsWith('zz_') ? { w: 3, h: 3, anims: { idle: 1 }, draw: () => {} } : null), 3);
    expect(resolveSpriteDef('zz_anything')?.w).toBe(3);
    expect(resolveSpriteDef('no_such_sprite_key_at_all')).toBeNull();
  });

  it('validates definitions', () => {
    expect(() => defineSprite('bad', { w: 0, h: 4, anims: { idle: 1 }, draw: () => {} })).toThrow();
    expect(() => defineSprite('bad2', { w: 4, h: 4, anims: {}, draw: () => {} })).toThrow();
  });

  it('maps sim anim hints onto the anims a sprite has', () => {
    const d: SpriteDef = { w: 4, h: 4, anims: { idle: 1, move: 2, dead: 1 }, draw: () => {} };
    expect(pickAnim(d, 'run')).toBe('move');
    expect(pickAnim(d, 'downed')).toBe('dead');
    expect(pickAnim(d, 'whatever')).toBe('idle');
    expect(spriteOrigin(d)).toEqual({ x: 2, y: 4 });
  });

  it('shelf packer allocates without overlap and reports full pages', () => {
    const p = new ShelfPacker(16, 16);
    const a = p.alloc(10, 4)!;
    const b = p.alloc(10, 4)!;
    expect(a).toEqual({ x: 0, y: 0 });
    expect(b).toEqual({ x: 0, y: 4 });
    expect(p.alloc(20, 2)).toBeNull();
    p.alloc(16, 8);
    expect(p.alloc(4, 4)).toBeNull();
  });
});

describe('built-in generators', () => {
  const keys = [
    'player', 'player_drifter#0', 'player_drifter#3', 'race_cyclorc#1', 'enemy_green_slime', 'enemy_magma_slime', 'res_tree_forest', 'res_tree_rime',
    'res_rock_stone', 'res_rock_gold', 'res_plant_herb', 'res_bug_firefly', 'res_chest_wood', 'exit_portal', 'exit_portal_glow', 'exit_portal_bars',
    'gold_coin', 'pickup',
  ];
  for (const k of ['arrow', 'bolt', 'fireball', 'ice_shard', 'lightning', 'arcane_orb', 'bomb', 'throwing_knife', 'slime_ball', 'fire_spit', 'magic_orb', 'web_shot']) keys.push(`proj_${k}`);
  for (const kind of ['sword', 'axe', 'pickaxe', 'hammer', 'spear', 'bow', 'staff', 'wand', 'torch', 'bomb', 'knife', 'net', 'sickle', 'shield', 'food', 'potion', 'generic']) keys.push(`held:${kind}:iron`);
  for (const item of Content.items.values()) keys.push(item.sprite, heldKey(item));

  it.each(keys)('%s draws inside its canvas without throwing', (key) => {
    const def = resolveSpriteDef(key);
    expect(def, key).not.toBeNull();
    let inside = 0;
    let outside = 0;
    for (const c of drawAll(key, def!)) {
      inside += c.inside;
      outside += c.outside;
    }
    expect(inside).toBeGreaterThan(0);
    expect(outside).toBe(0);
  });

  it('players get per-index tunics and the chibi has the required anims', () => {
    const d = resolveSpriteDef('player_drifter#0')!;
    for (const a of ['idle', 'run', 'jump', 'fall', 'climb', 'downed']) expect(d.anims[a]).toBeGreaterThan(0);
    expect(d.w).toBeGreaterThanOrEqual(8);
    expect(d.h).toBeGreaterThanOrEqual(12);
  });

  it('trees are tall with per-entity variants', () => {
    const d = resolveSpriteDef('res_tree_forest')!;
    expect(d.h).toBeGreaterThan(60);
    expect(d.meta?.variants).toBe(true);
  });
});
