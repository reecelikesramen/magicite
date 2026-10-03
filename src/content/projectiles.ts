import type { ProjectileDef } from './types';

export const PROJECTILES: ProjectileDef[] = [
  // --- added by items workstream: minimal canonical defs so item references validate; the combat
  // workstream owns the real tuning (lead: keep combat's versions, add `spark` + `pebble` if missing).
  { id: 'arrow', sprite: 'proj_arrow', speed: 300, gravity: 0, size: 3, life: 1.2, pierce: 0, damageType: 'physical', recoverItem: 'arrow' }, // added by items workstream
  { id: 'bolt', sprite: 'proj_bolt', speed: 380, gravity: 0, size: 3, life: 1.0, pierce: 1, damageType: 'physical', recoverItem: 'bolt' }, // added by items workstream
  { id: 'fireball', sprite: 'proj_fireball', speed: 220, gravity: 0, size: 5, life: 1.1, pierce: 0, damageType: 'fire', light: { radius: 40, color: 0xff8030 } }, // added by items workstream
  { id: 'ice_shard', sprite: 'proj_ice_shard', speed: 230, gravity: 0, size: 4, life: 1.0, pierce: 1, damageType: 'ice', light: { radius: 28, color: 0x80d0ff } }, // added by items workstream
  { id: 'lightning', sprite: 'proj_lightning', speed: 640, gravity: 0, size: 6, life: 0.45, pierce: 99, damageType: 'lightning', light: { radius: 56, color: 0xc0e0ff } }, // added by items workstream
  { id: 'arcane_orb', sprite: 'proj_arcane_orb', speed: 130, gravity: 0, size: 5, life: 2.5, pierce: 0, damageType: 'magic', homing: 4, light: { radius: 36, color: 0xb070ff } }, // added by items workstream
  { id: 'bomb', sprite: 'proj_bomb', speed: 170, gravity: 520, size: 5, life: 1.6, pierce: 0, bounces: 6, damageType: 'physical', explode: { radius: 20, breaksTiles: true } }, // added by items workstream
  { id: 'throwing_knife', sprite: 'proj_throwing_knife', speed: 270, gravity: 260, size: 3, life: 1.2, pierce: 0, damageType: 'physical', recoverItem: 'throwing_knife' }, // added by items workstream
  { id: 'slime_ball', sprite: 'proj_slime_ball', speed: 130, gravity: 420, size: 4, life: 2, pierce: 0, damageType: 'poison' }, // added by items workstream
  { id: 'fire_spit', sprite: 'proj_fire_spit', speed: 150, gravity: 260, size: 4, life: 2, pierce: 0, damageType: 'fire', light: { radius: 24, color: 0xff6020 } }, // added by items workstream
  { id: 'magic_orb', sprite: 'proj_magic_orb', speed: 90, gravity: 0, size: 5, life: 3, pierce: 0, damageType: 'magic', homing: 1.2, light: { radius: 32, color: 0xd060ff } }, // added by items workstream
  { id: 'web_shot', sprite: 'proj_web_shot', speed: 140, gravity: 120, size: 5, life: 2, pierce: 0, damageType: 'physical' }, // added by items workstream
  // Non-canonical, needed by items: spark_wand's bolt and the sling's stone.
  { id: 'spark', sprite: 'proj_spark', speed: 280, gravity: 0, size: 3, life: 0.6, pierce: 0, damageType: 'magic', light: { radius: 20, color: 0xfff080 } }, // added by items workstream
  { id: 'pebble', sprite: 'proj_pebble', speed: 230, gravity: 300, size: 3, life: 1.2, pierce: 0, damageType: 'physical', recoverItem: 'stone' }, // added by items workstream
];
