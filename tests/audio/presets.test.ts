import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { FALLBACK_SFX, hasSfx, normalizeSamples, resolvesSfx, resolveSfxId, SFX, SFX_ALIASES, SFX_PREFIXES } from '../../src/audio/presets';
import { loadZzfx } from '../../src/audio/zzfx';
import { readSources, scanSfxIds, splitArgs, stringLiterals } from './sfx-scan';

const REQUIRED = [
  'jump', 'double_jump', 'dash', 'swing', 'hit', 'crit', 'player_hurt', 'death_enemy', 'coin', 'pickup', 'craft',
  'craft_fail', 'chop', 'mine', 'clink', 'tile_break', 'levelup', 'portal', 'eat', 'drink', 'bow', 'arrow_hit',
  'magic_cast', 'fireball', 'explosion', 'freeze', 'burn', 'revive', 'downed', 'ui_click', 'ui_open', 'ui_close',
  'boss_roar', 'splash', 'step',
];

/** Ids emitted by sibling workstreams (combat, player) at the time of writing — keep them covered after merge. */
const SIBLING_IDS = [
  'teleport', 'place', 'block', 'item_break', 'shield_hit', 'harvest', 'dig', 'deflect', 'explode', 'arrow_stick',
  'sizzle', 'empty', 'fizzle', 'thrust', 'swing_heavy', 'shoot_crossbow', 'shoot_bow', 'cast', 'throw', 'slam',
  'land', 'stamina_empty', 'dive',
  // progression / run flow
  'portal_enter', 'portal_unlock', 'portal_locked', 'portal_open', 'victory', 'wraith_warning', 'wraith_spawn',
  'skill_learn', 'skill_not_ready', 'skill_fail', 'trap_snap', 'companion_heal', 'companion_shield', 'companion_zap',
  'level_up',
];

/** GDD §10 skills; progression emits `skill_${id}` when one is used. */
const SKILL_IDS = [
  'whirlwind', 'ground_slam', 'war_cry', 'charge', 'iron_skin', 'cleave', 'fire_burst', 'frost_nova',
  'chain_lightning', 'blink', 'arcane_ward', 'meteor', 'multishot', 'arrow_rain', 'bear_trap', 'smoke_bomb', 'hawk',
  'volley_step',
];

describe('sfx preset table', () => {
  it('has a preset for every required id', () => {
    for (const id of REQUIRED) expect(SFX[id], id).toBeDefined();
  });

  it('covers ids emitted by the combat/player workstreams', () => {
    for (const id of SIBLING_IDS) expect(hasSfx(id), id).toBe(true);
  });

  it('covers every sfx id found in the source code', () => {
    const root = join(__dirname, '../../src');
    const files = readSources(root, (rel) => rel.startsWith('audio/'));
    const found = scanSfxIds(files);
    // The scanner must actually find things (guards against a silently broken regex).
    for (const id of ['jump', 'swing', 'hit', 'coin', 'pickup', 'chop']) expect(found.has(id), `scanner finds ${id}`).toBe(true);
    const ok = (id: string): boolean => (id.endsWith('*') ? resolvesSfx(`${id.slice(0, -1)}x`) : hasSfx(id));
    const missing = [...found.keys()].filter((id) => !ok(id)).map((id) => `${id} (${found.get(id)!.join(', ')})`);
    expect(missing).toEqual([]);
  });

  it('every skill has a dedicated sound (skill_<id>)', () => {
    const ids = new Set([...SKILL_IDS, ...Content.skills.keys()]);
    for (const id of ids) expect(hasSfx(`skill_${id}`), `skill_${id}`).toBe(true);
    expect(resolveSfxId('skill_some_future_skill')).toBe('skill');
  });

  it('aliases point at real presets and unknown ids fall back', () => {
    for (const [alias, target] of Object.entries(SFX_ALIASES)) {
      expect(SFX[target], `${alias} → ${target}`).toBeDefined();
      expect(resolveSfxId(alias)).toBe(target);
    }
    for (const [prefix, target] of SFX_PREFIXES) expect(SFX[target], prefix).toBeDefined();
    expect(resolveSfxId('definitely_not_a_sound')).toBe(FALLBACK_SFX);
    expect(resolveSfxId('toString')).toBe(FALLBACK_SFX);
  });

  it('presets have sane parameters', () => {
    for (const [id, p] of Object.entries(SFX)) {
      expect(p.z.length, id).toBeLessThanOrEqual(21);
      expect(p.z[1] ?? 0, `${id}: randomness must be 0 (variance comes from playback rate)`).toBe(0);
      expect(p.gain ?? 1, id).toBeGreaterThan(0);
      expect(p.voices ?? 3, id).toBeGreaterThanOrEqual(1);
    }
  });

  it('every preset renders through zzfx to a short, finite, normalised buffer', async () => {
    const build = await loadZzfx();
    expect(build).not.toBeNull();
    for (const [id, p] of Object.entries(SFX)) {
      const s = normalizeSamples(build!(p.z, 44100));
      expect(s.length, id).toBeGreaterThan(100);
      expect(s.length / 44100, id).toBeLessThan(3);
      let peak = 0;
      let finite = true;
      for (const v of s) {
        if (!Number.isFinite(v)) finite = false;
        else peak = Math.max(peak, Math.abs(v));
      }
      expect(finite, id).toBe(true);
      expect(peak, id).toBeGreaterThan(0.01);
      expect(peak, id).toBeLessThanOrEqual(0.9 + 1e-6);
    }
  });

  it('rendering is deterministic (randomness forced off)', async () => {
    const build = (await loadZzfx())!;
    const a = build(SFX.hit!.z, 44100);
    const b = build(SFX.hit!.z, 44100);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('normalizeSamples', () => {
  it('brings quiet sounds up and caps peaks', () => {
    const quiet = new Float32Array(1000).map((_, i) => 0.01 * Math.sin(i / 5));
    normalizeSamples(quiet, 0.2, 0.9, 0.25, 3);
    expect(Math.max(...quiet)).toBeCloseTo(0.03, 2); // gain capped at 3×
    const loud = new Float32Array(1000).map((_, i) => 1.5 * Math.sin(i / 5));
    normalizeSamples(loud);
    expect(Math.max(...Array.from(loud, Math.abs))).toBeLessThanOrEqual(0.9 + 1e-6);
  });

  it('zeroes non-finite samples and leaves silence alone', () => {
    const s = new Float32Array([0, NaN, Infinity, 0]);
    normalizeSamples(s);
    expect(Array.from(s)).toEqual([0, 0, 0, 0]);
  });
});

describe('sfx source scanner', () => {
  it('splits args and finds literals around templates and ternaries', () => {
    expect(splitArgs("world, p, `Out of ${a ?? 'ammo'}!`, 'empty'")).toEqual(['world', 'p', "`Out of ${a ?? 'ammo'}!`", "'empty'"]);
    expect(stringLiterals("x ? 'a' : 'b_c'")).toEqual(['a', 'b_c']);
    expect(stringLiterals('`${q ? \'no\' : \'nope\'}`')).toEqual([]);
    expect(stringLiterals("def.tool === 'axe' ? 'chop' : def.tool !== 'net' ? 'mine' : 'x'")).toEqual(['chop', 'mine', 'x']);
  });

  it('follows helper functions that forward the id', () => {
    const text = [
      "function emitAt(world: World, e: Entity, id: string, pitch?: number): void {",
      "  world.emit({ type: 'sfx', id, x: e.x, y: e.y });",
      '}',
      "function fail(world: World, text: string, sfx: string): void {",
      "  world.emit({ type: 'sfx', id: sfx, x: 0, y: 0 });",
      '}',
      "function other(id: string): void { log(id); }",
      "emitAt(world, e, 'slam');",
      "emitAt(world, e, air ? 'dash' : 'dash_ground', 1.2);",
      "fail(world, `Out of ${def.ammo ?? 'ammo'}!`, 'empty');",
      "other('not_a_sound');",
      "world.emit({ type: 'sfx', id: heavy ? 'swing_heavy' : 'swing', x, y });",
      "world.emit({ type: 'sfx', id: `skill_${def.id}`, x: cx, y: e.y });",
    ].join('\n');
    const ids = [...scanSfxIds([{ path: 'x.ts', text }]).keys()].sort();
    expect(ids).toEqual(['dash', 'dash_ground', 'empty', 'skill_*', 'slam', 'swing', 'swing_heavy']);
  });
});
