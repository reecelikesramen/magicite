import { Content, maybeItem } from '../../content';
import type { CombatProjectileDef } from '../../content/projectiles';
import type { DamageType, ItemDef, StatusApply } from '../../content/types';
import { DT, secs, TILE } from '../constants';
import { Tile, tileProps } from '../tiles';
import type { Entity, ProjectileComp, Team } from '../types';
import type { World } from '../world';
import { applyDamage, combatDef, critChance, enemyDamage, playerOf } from './damage';
import { breakTile } from './harvest';
import { applyStatuses } from './status';
import { COMBAT } from './tuning';

/** Projectile def including the combat extras declared in src/content/projectiles.ts. */
export function projDef(id: string): CombatProjectileDef | undefined {
  return Content.projectiles.get(id) as CombatProjectileDef | undefined;
}

export interface FireOpts {
  /** Damage carried by the projectile (already stat-scaled; crits are rolled on hit). Default: owner enemy's damage, else 1. */
  damage?: number;
  speedMul?: number;
  /** Default: the owner's team (neutral without owner). */
  team?: Team;
  /** Item it came from: ammo/thrown item to recover, spell/weapon for onHit and stats. */
  sourceItem?: string;
  /** Extra targets to pierce. */
  pierce?: number;
  /** Lifetime override in seconds. */
  life?: number;
}

/** Max distance a `fromAbove` strike searches upward for a ceiling. */
const STRIKE_HEIGHT = 12 * TILE;
/** Aiming this many tiles deep into the ground still strikes the surface above it. */
const STRIKE_SURFACE_DEPTH = 3;

/**
 * y of the ceiling above (x, y) (first solid tile going up), capped at STRIKE_HEIGHT. A point inside the
 * ground (aiming at an enemy's feet) is first lifted to the open tile above it, so the strike still lands
 * on that surface; only a point buried deeper than STRIKE_SURFACE_DEPTH tiles returns `y` (fizzles).
 */
export function ceilingAbove(world: World, x: number, y: number): number {
  const grid = world.level.grid;
  const tx = Math.floor(x / TILE);
  let ty = Math.floor(y / TILE);
  const deepest = ty - STRIKE_SURFACE_DEPTH;
  while (grid.isSolid(tx, ty) && ty > deepest) ty--;
  if (grid.isSolid(tx, ty)) return y; // buried in rock: strike from where we are
  const top = Math.floor((Math.min(y, (ty + 1) * TILE - 1e-3) - STRIKE_HEIGHT) / TILE);
  while (ty > top && !grid.isSolid(tx, ty - 1)) ty--;
  return ty * TILE;
}

/**
 * Spawn a projectile from its def. `x, y` = centre of the spawn point, `angle` in radians (0 = right,
 * π/2 = down). For `fromAbove` defs (lightning) `x, y` is the *target point*: the bolt spawns under the
 * ceiling above it and strikes straight down. Exported for AI and bosses.
 */
export function fireProjectile(world: World, owner: Entity | null | undefined, defId: string, x: number, y: number, angle: number, opts: FireOpts = {}): Entity | undefined {
  const def = projDef(defId);
  if (!def) return undefined;
  const team: Team = opts.team ?? owner?.team ?? 'neutral';
  let damage = opts.damage;
  if (damage === undefined) {
    const od = owner ? combatDef(owner) : undefined;
    damage = owner && od ? enemyDamage(owner, od.damage) : 1;
  }
  if (def.fromAbove) {
    y = ceilingAbove(world, x, y) + def.size / 2 + 1;
    angle = Math.PI / 2;
  }
  const speed = def.speed * (opts.speedMul ?? 1);
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  const pc: ProjectileComp = {
    def: def.id,
    owner: owner?.id ?? 0,
    team,
    damage: Math.max(0, damage),
    life: Math.max(1, secs(opts.life ?? def.life)),
    pierceLeft: def.pierce + (opts.pierce ?? 0),
    bouncesLeft: def.bounces ?? 0,
    hit: [],
    sourceItem: opts.sourceItem ?? '',
  };
  return world.spawn('projectile', def.id, x - def.size / 2, y - def.size / 2, {
    w: def.size,
    h: def.size,
    vx,
    vy,
    team,
    gravityScale: 0,
    collides: false,
    usesPlatforms: false,
    facing: vx < 0 ? -1 : 1,
    anim: 'fly',
    owner: owner?.id,
    projectile: pc,
    light: def.light ? { radius: def.light.radius, color: def.light.color, intensity: 1, flicker: 0.1 } : undefined,
  });
}

/** Can a projectile of `team` hurt `t`? Player shots hit enemies/bosses; enemy shots hit active players. */
function canHit(world: World, team: Team, t: Entity): boolean {
  if (t.dead) return false;
  if (t.kind === 'enemy' || t.kind === 'boss') return team !== 'enemy';
  if (t.kind === 'player') {
    if (team === 'player') return false;
    const p = world.players[t.playerIndex ?? -1];
    return !!p && !p.downed && !p.out;
  }
  return false;
}

/**
 * The bow/crossbow behind a player's shot. ProjectileComp only records the ammo (`sourceItem`), so this is
 * the shooter's held 'shoot' weapon, and only when the shot's source item is ammo for it: thrown knives,
 * spells and skill volleys never pick up the element or onHit of a bow that happens to be in hand.
 */
function firingBow(world: World, pc: ProjectileComp): ItemDef | undefined {
  if (!pc.owner || !pc.sourceItem) return undefined;
  const owner = world.get(pc.owner);
  if (owner?.kind !== 'player') return undefined;
  const bow = maybeItem(owner.held);
  if (bow?.use !== 'shoot' || !bow.ammoType) return undefined;
  const ammo = maybeItem(pc.sourceItem);
  if (!ammo) return undefined;
  const kind = ammo.ammoKind ?? (ammo.category === 'ammo' ? ammo.id : undefined);
  return kind === bow.ammoType ? bow : undefined;
}

/** Statuses a projectile applies: its def's, its source item's, and the firing bow's / enemy owner's onHit. */
function applyProjectileStatuses(world: World, pc: ProjectileComp, def: CombatProjectileDef, t: Entity, src: Entity): void {
  if (t.dead) return;
  applyStatuses(world, t, def.onHit, pc.owner || src);
  const item = maybeItem(pc.sourceItem);
  applyStatuses(world, t, item?.onHit, pc.owner || src);
  const owner = pc.owner ? world.get(pc.owner) : undefined;
  if (owner) {
    const od = combatDef(owner);
    if (od) applyStatuses(world, t, od.onHit, owner);
    else applyStatuses(world, t, firingBow(world, pc)?.onHit, owner);
  }
}

/** Damage type of a hit: an elemental bow (e.g. fire) converts the physical arrows it fired. */
function hitType(world: World, pc: ProjectileComp, def: CombatProjectileDef): DamageType {
  if (def.damageType !== 'physical') return def.damageType;
  return firingBow(world, pc)?.damageType ?? def.damageType;
}

export interface ExplodeOpts {
  radius: number;
  damage: number;
  team: Team;
  /** Entity credited for kills (projectile or owner). */
  source?: Entity;
  breaksTiles?: boolean;
  type?: DamageType;
  knockback?: number;
  statuses?: readonly (readonly StatusApply[] | undefined)[];
  /** Fraction of damage dealt to players by their own team's explosion (capped by COMBAT.friendlySplashMax). */
  selfDamage?: number;
}

/**
 * Explosion at (x, y): damages everything hostile within `radius` (full in the inner half, down to 50% at
 * the edge), knocks outward, optionally breaks tiles with hardness ≤ COMBAT.mining.bombPower (never
 * bedrock, never in towns). Friendly players take a capped splash (bombs sting their throwers too).
 */
export function explode(world: World, x: number, y: number, o: ExplodeOpts): void {
  const r = o.radius;
  const kb = o.knockback ?? 160;
  const type = o.type ?? 'physical';
  // Credit statuses (burn kills) to a projectile's owner: the exploding projectile itself is gone next tick.
  const statusSrc = o.source?.projectile?.owner || o.source;
  for (const t of world.entities) {
    if (t.dead) continue;
    const hostile = canHit(world, o.team, t);
    const friendly = !hostile && o.team === 'player' && t.kind === 'player' && (o.selfDamage ?? 0) > 0 && canHit(world, 'neutral', t);
    if (!hostile && !friendly) continue;
    const nx = Math.max(t.x, Math.min(x, t.x + t.w));
    const ny = Math.max(t.y, Math.min(y, t.y + t.h));
    const d = Math.hypot(nx - x, ny - y);
    if (d > r) continue;
    const fall = 1 - 0.5 * Math.max(0, Math.min(1, (d - r / 2) / (r / 2)));
    let amount = Math.max(1, Math.round(o.damage * fall));
    if (friendly) amount = Math.max(1, Math.min(COMBAT.friendlySplashMax, Math.round(amount * (o.selfDamage ?? 0))));
    const dir = Math.sign(t.x + t.w / 2 - x) || 1;
    const dealt = applyDamage(world, t, amount, { source: o.source, type, knockback: kb, dir, unblockable: true, ignoreIframes: hostile && o.team === 'player' });
    if (dealt > 0 && !t.dead) {
      t.vy = Math.min(t.vy, -kb * 0.8 * (1 - t.kbResist));
      if (o.statuses) for (const list of o.statuses) applyStatuses(world, t, list, statusSrc);
    }
  }
  if (o.breaksTiles && !world.level.info.isTown) {
    const grid = world.level.grid;
    const t0x = Math.floor((x - r) / TILE);
    const t1x = Math.floor((x + r) / TILE);
    const t0y = Math.floor((y - r) / TILE);
    const t1y = Math.floor((y + r) / TILE);
    for (let ty = t0y; ty <= t1y; ty++) {
      for (let tx = t0x; tx <= t1x; tx++) {
        const dx = tx * TILE + TILE / 2 - x;
        const dy = ty * TILE + TILE / 2 - y;
        if (dx * dx + dy * dy > r * r) continue;
        const id = grid.get(tx, ty);
        if (id === Tile.AIR || !grid.inBounds(tx, ty)) continue;
        const h = tileProps(id).hardness;
        if (h <= 0 || h > COMBAT.mining.bombPower) continue;
        breakTile(world, tx, ty, COMBAT.mining.bombDropChance);
      }
    }
  }
  world.emit({ type: 'particles', preset: 'explosion', x, y, count: 24 });
  world.emit({ type: 'sfx', id: 'explode', x, y });
  world.emit({ type: 'shake', amount: 5, ticks: 14 });
}

function detonate(world: World, e: Entity, pc: ProjectileComp, def: CombatProjectileDef): void {
  const x = e.x + e.w / 2;
  const y = e.y + e.h / 2;
  world.kill(e);
  if (!def.explode) return;
  const item = maybeItem(pc.sourceItem);
  explode(world, x, y, {
    radius: def.explode.radius,
    damage: pc.damage,
    team: pc.team,
    source: e,
    breaksTiles: def.explode.breaksTiles,
    type: def.damageType,
    knockback: def.knockback,
    statuses: [def.onHit, item?.onHit, item?.consume?.status],
    selfDamage: def.selfDamage,
  });
}

function fizzle(world: World, e: Entity, def: CombatProjectileDef): void {
  world.kill(e);
  world.emit({ type: 'particles', preset: `impact_${def.damageType}`, x: e.x + e.w / 2, y: e.y + e.h / 2, count: 4, dirX: -Math.sign(e.vx) });
}

/**
 * Arrow/knife sticks where it stopped: maybe leaves a recoverable pickup stuck in place. Shots fired from
 * an item give that item back (fire arrows stay fire arrows); shots with no source item fall back to the
 * def's recoverItem; skill/scripted shots (`sourceItem` like 'skill:arrow_rain') never leave items, or a
 * volley skill would be a free ammo farm.
 */
function stick(world: World, e: Entity, pc: ProjectileComp, def: CombatProjectileDef): void {
  const id = pc.sourceItem ? (Content.items.has(pc.sourceItem) ? pc.sourceItem : undefined) : def.recoverItem;
  let cx = e.x + e.w / 2;
  let cy = e.y + e.h / 2;
  world.kill(e);
  world.emit({ type: 'sfx', id: 'arrow_stick', x: cx, y: cy });
  if (!id || !Content.items.has(id) || !world.rng.chance(def.recoverChance ?? 0.5)) {
    world.emit({ type: 'particles', preset: 'arrow_break', x: cx, y: cy, count: 3 });
    return;
  }
  // The pickup box (6 px) is bigger than the shaft: back it out of the wall along the flight path.
  const sp = Math.hypot(e.vx, e.vy) || 1;
  const bx = -e.vx / sp;
  const by = -e.vy / sp;
  const grid = world.level.grid;
  for (let i = 0; i < 8; i++) {
    if (!grid.solidAt(cx - 3, cy - 3) && !grid.solidAt(cx + 2.99, cy - 3) && !grid.solidAt(cx - 3, cy + 2.99) && !grid.solidAt(cx + 2.99, cy + 2.99)) break;
    cx += bx;
    cy += by;
  }
  world.spawn('pickup', id, cx - 3, cy - 3, {
    w: 6, h: 6, gravityScale: 0, facing: e.facing, anim: 'stuck', pickup: { item: { id, count: 1 }, delay: 12, gold: 0 },
  });
}

/** True if the tile at a pixel stops a projectile (solid; one-way only for falling gravity shots from above). */
function tileStops(world: World, px: number, py: number, prevPy: number, falling: boolean): boolean {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  const props = tileProps(world.level.grid.get(tx, ty));
  if (props.solid) return true;
  return falling && props.oneWay && prevPy <= ty * TILE;
}

const cands: Entity[] = [];

/**
 * Bounce off the wall/floor that stopped the leading edge moving from (ox,oy) to (nx,ny) (leading-edge
 * points). Returns true when a fuse shot came to rest.
 */
function bounce(world: World, e: Entity, def: CombatProjectileDef, ox: number, oy: number, nx: number, ny: number): boolean {
  const falling = e.vy > 0;
  let hitX = tileStops(world, nx, oy, oy, false);
  let hitY = tileStops(world, ox, ny, oy, falling);
  if (!hitX && !hitY) hitX = hitY = true; // corner
  const rest = def.restitution ?? (def.gravity > 0 ? 0.6 : 1);
  if (hitX) e.vx = -e.vx * rest;
  if (hitY) {
    e.vy = -e.vy * rest;
    if (falling) e.vx *= 0.8; // floor friction
  }
  world.emit({ type: 'particles', preset: 'bounce', x: e.x + e.w / 2, y: e.y + e.h / 2, count: 2 });
  if (def.fuse && hitY && falling && Math.abs(e.vy) < 45) {
    e.vy = 0;
    if (Math.abs(e.vx) < 12) e.vx = 0;
    return e.vx === 0;
  }
  return false;
}

/** Steer toward the nearest valid target within 120 px at up to `homing` rad/s. */
function steer(world: World, e: Entity, pc: ProjectileComp, homing: number): void {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  let best: Entity | undefined;
  let bestD = 120 * 120;
  for (const t of world.entities) {
    if (!canHit(world, pc.team, t) || pc.hit.includes(t.id)) continue;
    const dx = t.x + t.w / 2 - cx;
    const dy = t.y + t.h / 2 - cy;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  if (!best) return;
  const speed = Math.hypot(e.vx, e.vy);
  const cur = Math.atan2(e.vy, e.vx);
  let diff = Math.atan2(best.y + best.h / 2 - cy, best.x + best.w / 2 - cx) - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = homing * DT;
  const a = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
  e.vx = Math.cos(a) * speed;
  e.vy = Math.sin(a) * speed;
}

/** Returns true when the projectile was consumed by the hit. */
function hitTarget(world: World, e: Entity, pc: ProjectileComp, def: CombatProjectileDef, t: Entity): boolean {
  if (def.fuse && def.explode) {
    detonate(world, e, pc, def);
    return true;
  }
  pc.hit.push(t.id);
  // Enemy shots pass through players in i-frames (dash dodges arrows instead of eating them).
  if (pc.team !== 'player' && t.kind === 'player' && t.invuln > 0) return false;
  let amount = pc.damage;
  let crit = false;
  const op = playerOf(world, e);
  if (op) {
    const chance = critChance(op);
    if (chance > 0 && world.rng.next() < chance) {
      crit = true;
      amount = Math.max(amount + 1, Math.round(amount * COMBAT.crit.mult));
    }
  }
  const dir = Math.sign(e.vx) || e.facing;
  const dealt = applyDamage(world, t, amount, {
    source: e, type: hitType(world, pc, def), knockback: def.knockback ?? 70, dir, crit, ignoreIframes: pc.team === 'player',
  });
  if (e.dead) return true; // blocked by a shield
  if (dealt > 0) applyProjectileStatuses(world, pc, def, t, e);
  world.emit({ type: 'particles', preset: `impact_${def.damageType}`, x: e.x + e.w / 2, y: e.y + e.h / 2, count: 3, dirX: dir });
  if (pc.pierceLeft > 0) {
    pc.pierceLeft--;
    return false;
  }
  if (def.explode) detonate(world, e, pc, def);
  else world.kill(e);
  return true;
}

/** A shot stopped by a tile: explode, stick (recoverable) or fizzle. */
function impact(world: World, e: Entity, pc: ProjectileComp, def: CombatProjectileDef): void {
  if (def.explode) detonate(world, e, pc, def);
  else if (def.recoverItem) stick(world, e, pc, def);
  else fizzle(world, e, def);
}

function updateProjectile(world: World, e: Entity, pc: ProjectileComp, def: CombatProjectileDef): void {
  const grid = world.level.grid;
  const half = e.w / 2;
  // Sweep from last tick's position to where physics moved it this tick.
  const sx = e.px + half;
  const sy = e.py + e.h / 2;
  const ex = e.x + half;
  const ey = e.y + e.h / 2;
  const dist = Math.hypot(ex - sx, ey - sy);
  const steps = Math.max(1, Math.ceil(dist / Math.max(1, Math.min(3, e.w))));
  cands.length = 0;
  const minX = Math.min(sx, ex) - half;
  const maxX = Math.max(sx, ex) + half;
  const minY = Math.min(sy, ey) - half;
  const maxY = Math.max(sy, ey) + half;
  for (const t of world.entities) {
    if (t === e || t.id === pc.owner || !canHit(world, pc.team, t) || pc.hit.includes(t.id)) continue;
    if (t.x > maxX || t.x + t.w < minX || t.y > maxY || t.y + t.h < minY) continue;
    cands.push(t);
  }
  // Tiles are tested at the leading edge (so shots don't sink into walls), entities with the full box.
  const lx = ex > sx ? half * 0.9 : ex < sx ? -half * 0.9 : 0;
  const ly = ey > sy ? (e.h / 2) * 0.9 : ey < sy ? (-e.h / 2) * 0.9 : 0;
  const fallingShot = ey > sy && def.gravity > 0;
  let ox = sx;
  let oy = sy;
  let bounced = false;
  for (let i = 1; i <= steps; i++) {
    const cx = sx + ((ex - sx) * i) / steps;
    const cy = sy + ((ey - sy) * i) / steps;
    if (!def.ghost && tileStops(world, cx + lx, cy + ly, oy + ly, fallingShot)) {
      e.x = ox - half;
      e.y = oy - e.h / 2;
      if (def.fuse || pc.bouncesLeft > 0) {
        if (!def.fuse) pc.bouncesLeft--;
        bounce(world, e, def, ox + lx, oy + ly, cx + lx, cy + ly);
        bounced = true;
        break;
      }
      impact(world, e, pc, def);
      return;
    }
    for (const t of cands) {
      if (t.dead || pc.hit.includes(t.id)) continue;
      if (cx + half <= t.x || cx - half >= t.x + t.w || cy + half <= t.y || cy - half >= t.y + t.h) continue;
      e.x = cx - half;
      e.y = cy - e.h / 2;
      if (hitTarget(world, e, pc, def, t)) return;
    }
    ox = cx;
    oy = cy;
  }
  if (!bounced) {
    // Pierced targets moved us to the contact point; carry on to where physics put us.
    e.x = ex - half;
    e.y = ey - e.h / 2;
  }

  // Water snuffs fire.
  if (def.damageType === 'fire' && grid.get(Math.floor(ex / TILE), Math.floor(ey / TILE)) === Tile.WATER) {
    world.emit({ type: 'particles', preset: 'steam', x: ex, y: ey, count: 5 });
    world.emit({ type: 'sfx', id: 'sizzle', x: ex, y: ey });
    world.kill(e);
    return;
  }

  if (--pc.life <= 0) {
    if (def.explode) detonate(world, e, pc, def);
    else fizzle(world, e, def);
    return;
  }

  // Forces for next tick (physics integrates velocity; gravityScale stays 0 so we own gravity).
  const resting = e.vx === 0 && e.vy === 0;
  if (def.gravity > 0) {
    const bx = e.x + half;
    const by = e.y + e.h + 1;
    const supported = resting && tileStops(world, bx, by, e.y + e.h, true);
    if (!supported) e.vy = Math.min(e.vy + def.gravity * DT, 420);
  }
  if (def.homing && !resting) steer(world, e, pc, def.homing);
  if (e.vx !== 0) e.facing = e.vx < 0 ? -1 : 1;
  if (def.trail && e.age % 3 === 0 && !resting) world.emit({ type: 'particles', preset: def.trail, x: e.x + half, y: e.y + e.h / 2, count: 1 });
}

/**
 * Flight, tile/entity collision (swept, no tunnelling), pierce, bounce, explode, stick/recover, homing.
 * Hit-stop pauses projectiles, but a hit-stop raised earlier in this same tick (meleeSystem runs after
 * physics) must not skip the segment physics already moved them: anything that moved this tick is still
 * swept, otherwise a fast shot could pass through a target or a thin wall unseen.
 */
export function projectileSystem(world: World): void {
  const frozen = world.freeze > 0;
  for (const e of world.entities) {
    const pc = e.projectile;
    if (!pc || e.dead) continue;
    if (frozen && e.x === e.px && e.y === e.py) continue;
    const def = projDef(pc.def);
    if (!def) {
      world.kill(e);
      continue;
    }
    // Projectiles spawned without fireProjectile (e.g. progression skills) may use tile-colliding,
    // gravity-driven physics: physics then stops them flush against walls/floors where the swept test
    // below never sees a tile, and they slide or hang until their life ends. Combat owns projectile
    // flight, so adopt them; if physics already stopped one against a tile this tick, that's its impact.
    let blocked = false;
    if (e.collides || e.gravityScale !== 0) {
      blocked = e.collides && (e.wallDir !== 0 || e.hitCeiling || e.onGround);
      e.collides = false;
      e.gravityScale = 0;
    }
    updateProjectile(world, e, pc, def);
    if (blocked && !e.dead && !def.ghost && !def.fuse) impact(world, e, pc, def);
  }
}
