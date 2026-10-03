import { ITEMS } from './items';
import type { ProjectileDef, StatusApply } from './types';

/**
 * Combat-only projectile knobs read by src/sim/combat/projectiles.ts. They live next to the defs
 * (content stays data) without widening the shared ProjectileDef contract.
 */
export interface ProjectileExtras {
  /** Statuses applied to whatever it hits (on top of the source item's / enemy's onHit). */
  onHit?: StatusApply[];
  /** Flies through solid tiles (only lifetime or targets stop it). */
  ghost?: boolean;
  /** Fired at a point: spawns under the ceiling above that point and strikes straight down. */
  fromAbove?: boolean;
  /** Explodes when its life runs out (or on touching a target); walls only bounce it. */
  fuse?: boolean;
  /** Velocity kept on a bounce (0..1). Default 0.6. */
  restitution?: number;
  /** Knockback in px/s applied to targets. Default 70. */
  knockback?: number;
  /** Chance (0..1) that a projectile with `recoverItem` leaves the item when it sticks. Default 0.5. */
  recoverChance?: number;
  /** Damage multiplier vs players caught in its own team's explosion (friendly splash). */
  selfDamage?: number;
}

export type CombatProjectileDef = ProjectileDef & ProjectileExtras;

/** Only reference items that exist in the catalogue (keeps validateContent() green while items land). */
const ifItem = (id: string): string | undefined => (ITEMS.some((i) => i.id === id) ? id : undefined);

/**
 * Canonical projectile ids (the item catalogue and enemy defs reference these):
 * arrow bolt fireball ice_shard lightning arcane_orb bomb throwing_knife slime_ball fire_spit magic_orb web_shot.
 * Damage is not part of the def: it comes from the weapon/ammo/enemy that fires it.
 */
export const PROJECTILES: CombatProjectileDef[] = [
  // --- Player: bows & crossbows (DEX) -------------------------------------------------------
  {
    id: 'arrow', sprite: 'proj_arrow', speed: 300, gravity: 0, size: 3, life: 1.2, pierce: 0, damageType: 'physical',
    recoverItem: ifItem('arrow'), recoverChance: 0.5, knockback: 60,
  },
  {
    id: 'bolt', sprite: 'proj_bolt', speed: 380, gravity: 0, size: 3, life: 1.0, pierce: 1, damageType: 'physical',
    recoverItem: ifItem('bolt'), recoverChance: 0.5, knockback: 90,
  },
  // --- Player: spells (MAG) --------------------------------------------------------------------
  {
    id: 'fireball', sprite: 'proj_fireball', speed: 220, gravity: 0, size: 5, life: 1.1, pierce: 0, damageType: 'fire',
    trail: 'trail_fire', light: { radius: 40, color: 0xff8030 }, knockback: 80,
    onHit: [{ id: 'burn', duration: 2, chance: 0.6, power: 1 }],
  },
  {
    id: 'ice_shard', sprite: 'proj_ice_shard', speed: 230, gravity: 0, size: 4, life: 1.0, pierce: 1, damageType: 'ice',
    trail: 'trail_ice', light: { radius: 28, color: 0x80d0ff }, knockback: 40,
    onHit: [{ id: 'slow', duration: 2, chance: 1, power: 0.45 }],
  },
  {
    id: 'lightning', sprite: 'proj_lightning', speed: 640, gravity: 0, size: 6, life: 0.45, pierce: 99, damageType: 'lightning',
    trail: 'trail_spark', light: { radius: 56, color: 0xc0e0ff }, fromAbove: true, knockback: 30,
    onHit: [{ id: 'stun', duration: 0.4, chance: 0.3 }],
  },
  {
    id: 'arcane_orb', sprite: 'proj_arcane_orb', speed: 130, gravity: 0, size: 5, life: 2.5, pierce: 0, damageType: 'magic',
    trail: 'trail_arcane', light: { radius: 36, color: 0xb070ff }, homing: 4, ghost: true, knockback: 50,
  },
  // Non-canonical, referenced by the items catalogue (ws/items): the spark wand's bolt and the sling's stone.
  {
    id: 'spark', sprite: 'proj_spark', speed: 280, gravity: 0, size: 3, life: 0.6, pierce: 0, damageType: 'magic',
    trail: 'trail_spark', light: { radius: 20, color: 0xfff080 }, knockback: 40,
  },
  {
    id: 'pebble', sprite: 'proj_pebble', speed: 230, gravity: 300, size: 3, life: 1.2, pierce: 0, damageType: 'physical',
    recoverItem: ifItem('stone'), recoverChance: 0.5, knockback: 70,
  },
  // --- Player: thrown (DEX) ------------------------------------------------------------------
  {
    id: 'bomb', sprite: 'proj_bomb', speed: 170, gravity: 520, size: 5, life: 1.6, pierce: 0, bounces: 6, damageType: 'physical',
    trail: 'trail_fuse', light: { radius: 14, color: 0xffa040 }, explode: { radius: 20, breaksTiles: true },
    fuse: true, restitution: 0.45, knockback: 180, selfDamage: 0.5,
  },
  {
    id: 'throwing_knife', sprite: 'proj_throwing_knife', speed: 270, gravity: 260, size: 3, life: 1.2, pierce: 0, damageType: 'physical',
    recoverItem: ifItem('throwing_knife'), recoverChance: 0.75, knockback: 50,
    onHit: [{ id: 'bleed', duration: 3, chance: 0.25, power: 1 }],
  },
  // --- Enemy projectiles -----------------------------------------------------------------------
  {
    id: 'slime_ball', sprite: 'proj_slime_ball', speed: 130, gravity: 420, size: 4, life: 2, pierce: 0, damageType: 'poison',
    trail: 'trail_slime', knockback: 50, onHit: [{ id: 'slow', duration: 1.5, chance: 0.5, power: 0.3 }],
  },
  {
    id: 'fire_spit', sprite: 'proj_fire_spit', speed: 150, gravity: 260, size: 4, life: 2, pierce: 0, damageType: 'fire',
    trail: 'trail_fire', light: { radius: 24, color: 0xff6020 }, knockback: 60,
    onHit: [{ id: 'burn', duration: 2, chance: 0.5, power: 1 }],
  },
  {
    id: 'magic_orb', sprite: 'proj_magic_orb', speed: 90, gravity: 0, size: 5, life: 3, pierce: 0, damageType: 'magic',
    trail: 'trail_magic', light: { radius: 32, color: 0xd060ff }, homing: 1.2, knockback: 60,
  },
  {
    id: 'web_shot', sprite: 'proj_web_shot', speed: 140, gravity: 120, size: 5, life: 2, pierce: 0, damageType: 'physical',
    trail: 'trail_web', knockback: 20, onHit: [{ id: 'slow', duration: 2.5, chance: 1, power: 0.55 }],
  },
  // --- Boss attacks ----------------------------------------------------------------------------
  {
    id: 'acid_glob', sprite: 'proj_acid_glob', speed: 150, gravity: 380, size: 5, life: 2.2, pierce: 0, damageType: 'poison',
    trail: 'trail_slime', light: { radius: 12, color: 0xc0ff40 }, knockback: 40,
    onHit: [{ id: 'poison', duration: 3, chance: 0.6, power: 1 }],
  },
  {
    id: 'shockwave', sprite: 'proj_shockwave', speed: 150, gravity: 0, size: 7, life: 1.1, pierce: 99, damageType: 'physical',
    knockback: 140,
  },
  {
    id: 'crystal_spike', sprite: 'proj_crystal_spike', speed: 420, gravity: 0, size: 5, life: 0.6, pierce: 99, damageType: 'physical',
    trail: 'trail_spark', light: { radius: 18, color: 0xc070ff }, fromAbove: true, knockback: 40,
  },
  {
    id: 'blight_bolt', sprite: 'proj_blight_bolt', speed: 95, gravity: 0, size: 6, life: 7, pierce: 0, damageType: 'magic',
    homing: 1.4, light: { radius: 20, color: 0xff3cb4 }, ghost: true, knockback: 60,
  },
];
