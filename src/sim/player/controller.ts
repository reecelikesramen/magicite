import { dexSpeedMul } from '../items/stats';
import { approach } from '../../engine/math';
import { DT, HOTBAR_SIZE, PHYS, TILE } from '../constants';
import { dropDistance, isPlatformTile, ladderAt, ladderBelow, liquidAt } from '../physics';
import { Tile, tileProps } from '../tiles';
import type { Entity, PlayerInput, PlayerState } from '../types';
import type { World } from '../world';
import { spendStamina } from './meters';

type BoolKey = 'jump' | 'attack' | 'interact' | 'alt';

/** True on the tick a held button goes down. */
export function pressed(p: PlayerState, input: PlayerInput, key: BoolKey): boolean {
  return input[key] && !p.prev[key];
}

/** Standing only on one-way platforms / ladder tops (so Down + Jump may drop through). */
function standingOnPlatformOnly(world: World, e: Entity): boolean {
  const grid = world.level.grid;
  const ty = Math.floor((e.y + e.h + 0.5) / TILE);
  const t0 = Math.floor(e.x / TILE);
  const t1 = Math.floor((e.x + e.w - 1e-4) / TILE);
  let any = false;
  for (let tx = t0; tx <= t1; tx++) {
    if (tileProps(grid.get(tx, ty)).solid) return false;
    if (isPlatformTile(grid, tx, ty)) any = true;
  }
  return any;
}

/** Spike tiles in the row just above pixel row `feetY` across the entity's columns (unsafe landing). */
function spikesAt(world: World, e: Entity, feetY: number): boolean {
  const grid = world.level.grid;
  const ty = Math.floor((feetY - 1) / TILE);
  const t0 = Math.floor(e.x / TILE);
  const t1 = Math.floor((e.x + e.w - 1e-4) / TILE);
  for (let tx = t0; tx <= t1; tx++) if (grid.get(tx, ty) === Tile.SPIKES) return true;
  return false;
}

/** Ground friction under the feet (ice < 1). Rimefrost's biome special block is slippery ice. */
function surfaceFriction(world: World, e: Entity): number {
  const grid = world.level.grid;
  const id = grid.get(Math.floor((e.x + e.w / 2) / TILE), Math.floor((e.y + e.h + 1) / TILE));
  if (id === Tile.SPECIAL && world.level.info.biome === 'rime') return 0.18;
  return tileProps(id).friction;
}

/**
 * Movement-affecting statuses (applied by combat): stun/freeze disable control, slow/haste scale speed.
 * `power` is the fraction (slow 0.4 = −40%, haste 0.3 = +30%); defaults used when 0/absent.
 * Returns the speed multiplier, or 0 when control is disabled.
 */
function statusMoveMul(e: Entity): number {
  let mul = 1;
  for (const s of e.status) {
    if (s.ticks <= 0) continue;
    if (s.id === 'stun' || s.id === 'freeze') return 0;
    if (s.id === 'slow') mul *= 1 - Math.min(0.8, s.power > 0 ? s.power : 0.4);
    else if (s.id === 'haste') mul *= 1 + (s.power > 0 ? s.power : 0.3);
  }
  return mul;
}

/**
 * Platformer controller: acceleration curves, coyote time, jump buffering, variable jump height
 * (jump-cut + apex hang), stamina double jump, Q/E dashes (air dash faster/longer, i-frames),
 * dive (Down + Jump in air), one-way drop-through, ladders, swimming, crawling while downed.
 */
export function playerControlSystem(world: World): void {
  if (world.freeze > 0) {
    // Hit-stop pauses movement, but the input latch still runs: keep presses made during it buffered.
    for (const p of world.players) bufferPresses(p, world.inputs[p.index]!);
    return;
  }
  for (const p of world.players) {
    const e = world.get(p.entityId);
    if (e) controlPlayer(world, p, e, world.inputs[p.index]!);
  }
}

/** During hit-stop (world.freeze) the controller doesn't run; remember jump/dash presses for afterwards. */
function bufferPresses(p: PlayerState, input: PlayerInput): void {
  if (p.downed || p.out) return;
  if (pressed(p, input, 'jump')) p.ctl.jumpBuffer = PHYS.jumpBufferTicks;
  const dash = input.dash ?? 0;
  if (dash !== 0 && dash !== p.prev.dash) p.ctl.dashBuf = dash * PHYS.dashBufferTicks;
}

function emitAt(world: World, e: Entity, id: string, pitch?: number): void {
  world.emit(pitch === undefined ? { type: 'sfx', id, x: e.x + e.w / 2, y: e.y + e.h } : { type: 'sfx', id, x: e.x + e.w / 2, y: e.y + e.h, pitch });
}

function dust(world: World, e: Entity, preset: string, count: number, dirX = 0): void {
  world.emit({ type: 'particles', preset, x: e.x + e.w / 2, y: e.y + e.h, count, dirX });
}

/** Finish (or cancel) a dash: clamp exit speed so momentum doesn't carry forever. */
function endDash(p: PlayerState, e: Entity, keep: number): void {
  const c = p.ctl;
  if (c.dashDir !== 0 && Math.abs(e.vx) > keep && Math.sign(e.vx) === c.dashDir) e.vx = c.dashDir * keep;
  c.dashT = 0;
  c.dashDir = 0;
  c.dashAir = false;
  c.dashCd = PHYS.dashCooldownTicks;
  e.gravityScale = 1;
}

/** Downed: crawl slowly, no jumping/dashing. Out: lie still. */
function controlDowned(p: PlayerState, e: Entity, input: PlayerInput): void {
  const c = p.ctl;
  c.dashT = 0;
  c.dashDir = 0;
  c.climbing = false;
  c.diving = false;
  c.jumping = false;
  e.gravityScale = 1;
  e.usesPlatforms = true;
  const move = p.out ? 0 : Math.abs(input.moveX) < 0.2 ? 0 : Math.sign(input.moveX);
  const decel = e.onGround ? PHYS.groundDecel : PHYS.airDecel;
  e.vx = approach(e.vx, move * PHYS.crawlSpeed, (move !== 0 ? PHYS.groundAccel : decel) * DT);
  if (move !== 0) e.facing = move > 0 ? 1 : -1;
  setAnim(e, p.out ? 'out' : move !== 0 ? 'crawl' : 'downed');
}

function setAnim(e: Entity, anim: string): void {
  if (e.anim === anim) e.animT++;
  else {
    e.anim = anim;
    e.animT = 0;
  }
}

/**
 * One player's movement for one tick. Exposed separately so netcode can re-run it for client-side
 * prediction (controlPlayer + physics `integrate` on the local player only). Deterministic and
 * allocation-free; reads only the tile grid, the player's state/entity and this tick's input.
 */
export function controlPlayer(world: World, p: PlayerState, e: Entity, input: PlayerInput): void {
  if (input.select >= 0 && input.select < HOTBAR_SIZE) p.selected = input.select;
  const c = p.ctl;
  if (p.downed || p.out) {
    controlDowned(p, e, input);
    return;
  }
  const grid = world.level.grid;
  const mods = p.mods;
  const liquid = liquidAt(grid, e);
  const lava = liquid === Tile.LAVA;
  const statusMul = statusMoveMul(e);
  const stunned = statusMul === 0;
  const speedMul = (1 + (mods.moveSpeed ?? 0)) * dexSpeedMul(p.stats.dex) * (stunned ? 1 : statusMul);
  const speed = PHYS.walkSpeed * speedMul * (lava ? PHYS.lavaSpeedMul : liquid ? PHYS.swimSpeedMul : 1);
  const jumpSpeed = PHYS.jumpSpeed * (1 + (mods.jump ?? 0));
  const move = stunned || Math.abs(input.moveX) < 0.2 ? 0 : Math.sign(input.moveX);
  const upHeld = !stunned && input.moveY < -0.5;
  const downHeld = !stunned && input.moveY > 0.5;
  const jumpPressed = !stunned && pressed(p, input, 'jump');
  const jumpHeld = !stunned && input.jump;
  const cx = e.x + e.w / 2;

  // --- Timers & landing ---------------------------------------------------------------
  if (c.dashCd > 0) c.dashCd--;
  if (c.dropThrough > 0) {
    c.dropThrough--;
    if (c.dropThrough === 0 && !c.climbing) e.usesPlatforms = true;
  }
  if (e.onGround || liquid !== 0) {
    if (c.airT > 0 && e.onGround) {
      if (c.diving) {
        dust(world, e, 'slam', 10);
        emitAt(world, e, 'slam');
        world.emit({ type: 'shake', amount: 2, ticks: 6 });
      } else if (c.fallPeak > 170) {
        dust(world, e, 'land_dust', 4);
        emitAt(world, e, 'land');
      }
    }
    if (c.airT > 0 && liquid !== 0 && c.fallPeak > 120) {
      dust(world, e, 'splash', 8);
      emitAt(world, e, 'splash');
    }
    c.airT = 0;
    c.fallPeak = 0;
    c.diving = false;
    if (e.vy >= 0) c.jumping = false;
  } else {
    c.airT++;
    if (e.vy > c.fallPeak) c.fallPeak = e.vy;
    if (c.jumping && (e.vy > PHYS.apexSpeed || e.hitCeiling)) c.jumping = false; // no apex hang under a ceiling
  }

  // --- Dash request / finalise ----------------------------------------------------------
  const dashIn = input.dash ?? 0;
  const dashPressed = !stunned && dashIn !== 0 && dashIn !== p.prev.dash;
  if (dashPressed) c.dashBuf = dashIn * PHYS.dashBufferTicks;
  else if (c.dashBuf !== 0) c.dashBuf -= Math.sign(c.dashBuf);
  if (c.dashT > 0 && (e.wallDir === c.dashDir || liquid !== 0 || stunned)) endDash(p, e, 0);
  if (c.dashT === 0 && c.dashDir !== 0) endDash(p, e, PHYS.walkSpeed * speedMul);
  if (c.dashBuf !== 0 && c.dashT === 0 && c.dashCd === 0 && liquid === 0) {
    const dir = Math.sign(c.dashBuf);
    c.dashBuf = 0;
    if (spendStamina(p, 1)) {
      const air = !e.onGround && !c.climbing;
      c.dashT = air ? PHYS.dashAirTicks : PHYS.dashGroundTicks;
      c.dashDir = dir;
      c.dashAir = air;
      c.climbing = false;
      c.diving = false;
      c.jumping = false;
      e.usesPlatforms = c.dropThrough === 0;
      e.invuln = Math.max(e.invuln, PHYS.dashIframes);
      dust(world, e, air ? 'dash_air' : 'dash', 6, -dir);
      emitAt(world, e, 'dash', air ? 1.2 : 1);
    } else {
      emitAt(world, e, 'stamina_empty');
    }
  }
  const dashing = c.dashT > 0;

  // --- Ladders ------------------------------------------------------------------------
  const onLadder = ladderAt(grid, e);
  if (!c.climbing && !dashing && !stunned) {
    // Grab with Up (not right after jumping off one); climb down from a ladder top with Down.
    const freshJump = c.jumping && e.vy < 0 && c.airT < 10;
    if (onLadder && !freshJump && upHeld) {
      c.climbing = true;
    } else if (downHeld && !jumpPressed && e.onGround && ladderBelow(grid, e)) {
      // Climb down through the top of a ladder.
      c.climbing = true;
      e.y += 1;
    }
    if (c.climbing) {
      c.jumping = false;
      c.diving = false;
    }
  }
  if (c.climbing) {
    const still = ladderAt(grid, e);
    if (!still || stunned) {
      c.climbing = false;
      if (e.vy < 0) e.vy = 0;
    } else if (e.onGround && downHeld && grid.isSolid(Math.floor(cx / TILE), Math.floor((e.y + e.h + 1) / TILE))) {
      c.climbing = false; // reached the floor
    }
  }
  if (!c.climbing && c.dropThrough === 0) e.usesPlatforms = true;

  // --- Horizontal ---------------------------------------------------------------------
  if (c.climbing) {
    e.usesPlatforms = false;
    e.gravityScale = 0;
    e.vy = Math.abs(input.moveY) > 0.3 && !stunned ? Math.sign(input.moveY) * PHYS.climbSpeed * speedMul : 0;
    if (move !== 0) e.vx = approach(e.vx, move * PHYS.walkSpeed * 0.5 * speedMul, PHYS.groundAccel * DT);
    else {
      // Settle onto the ladder's centre line.
      e.vx = 0;
      const target = Math.floor(cx / TILE) * TILE + TILE / 2 - e.w / 2;
      e.x = approach(e.x, target, 60 * DT);
    }
    c.airJumpsUsed = 0;
  } else if (!dashing) {
    const ground = e.onGround;
    const fric = ground ? surfaceFriction(world, e) : 1;
    const ctrl = (e.hurt > 0 ? PHYS.hurtControl : 1) * fric;
    const accel = (ground ? PHYS.groundAccel : PHYS.airAccel) * ctrl;
    const decel = (ground ? PHYS.groundDecel : PHYS.airDecel) * ctrl;
    const over = (ground ? PHYS.groundOverspeedDecel : PHYS.airOverspeedDecel) * ctrl;
    if (c.diving) e.vx = approach(e.vx, move * speed * 0.35, accel * DT);
    else if (move !== 0) {
      const target = move * speed;
      if (Math.sign(e.vx) === move && Math.abs(e.vx) > speed) e.vx = approach(e.vx, target, over * DT);
      else if (Math.sign(e.vx) === -move) e.vx = approach(e.vx, target, (decel + accel) * DT);
      else e.vx = approach(e.vx, target, accel * DT);
    } else e.vx = approach(e.vx, 0, decel * DT);
  }

  // --- Jumping / swimming -------------------------------------------------------------
  if (e.onGround || c.climbing) {
    c.coyote = PHYS.coyoteTicks;
    c.airJumpsUsed = 0;
  } else if (c.coyote > 0) c.coyote--;
  if (liquid !== 0) {
    c.airJumpsUsed = 0;
    c.coyote = 0;
  }

  if (jumpPressed) c.jumpBuffer = PHYS.jumpBufferTicks;
  else if (c.jumpBuffer > 0) c.jumpBuffer--;

  let swimDown = false;
  if (liquid !== 0 && !c.climbing) {
    // Swimming: hold Jump/Up to rise, Down to dive; Jump with the head out of the liquid leaps out.
    const headTile = grid.get(Math.floor(cx / TILE), Math.floor((e.y + 2) / TILE));
    const headOut = !tileProps(headTile).liquid;
    if (headOut && (c.jumpBuffer > 0 || (jumpHeld && e.vy < 0))) {
      const leap = lava ? PHYS.lavaJumpSpeed : PHYS.swimJumpSpeed;
      // Held jump keeps re-leaping until the feet are out; only the first tick splashes.
      if (e.vy > -leap * 0.5) {
        dust(world, e, 'splash', 6);
        emitAt(world, e, 'splash', 1.2);
      }
      e.vy = -leap;
      c.jumpBuffer = 0;
      c.jumping = true;
    } else if (jumpHeld || upHeld) {
      e.vy = approach(e.vy, -(lava ? PHYS.lavaUpSpeed : PHYS.swimUpSpeed), PHYS.swimAccel * DT);
    } else if (downHeld && !lava) {
      // Dive down: steered here with gravity off (gravity shaping below), since physics caps passive
      // sinking at swimMaxFall; a fast entry is braked with the same liquid drag.
      e.vy = approach(e.vy, PHYS.swimDownSpeed, (e.vy > PHYS.swimDownSpeed ? PHYS.liquidDrag : PHYS.swimAccel) * DT);
      swimDown = true;
    }
  } else if (c.jumpBuffer > 0 && !stunned) {
    if (c.climbing && downHeld) {
      // Let go of the ladder.
      c.climbing = false;
      c.jumpBuffer = 0;
    } else if (downHeld && e.onGround && standingOnPlatformOnly(world, e)) {
      // Drop through a one-way platform / ladder top.
      c.dropThrough = PHYS.dropThroughTicks;
      e.usesPlatforms = false;
      e.y += 1;
      c.jumpBuffer = 0;
    } else if (downHeld && jumpPressed && !e.onGround && !c.climbing) {
      // Dive: fast-fall slam.
      c.diving = true;
      c.jumping = false;
      c.jumpBuffer = 0;
      if (dashing) endDash(p, e, PHYS.walkSpeed * speedMul);
      e.vy = Math.max(e.vy, PHYS.diveSpeed);
      e.vx *= 0.3;
      dust(world, e, 'dive', 4);
      emitAt(world, e, 'dive');
    } else if (c.coyote > 0) {
      if (dashing && !c.dashAir) endDash(p, e, PHYS.dashGroundSpeed * speedMul * PHYS.dashJumpCarry);
      else if (dashing) endDash(p, e, PHYS.walkSpeed * speedMul);
      e.vy = -jumpSpeed;
      c.coyote = 0;
      c.jumpBuffer = 0;
      c.climbing = false;
      c.jumping = true;
      c.diving = false;
      dust(world, e, 'jump_dust', 3);
      emitAt(world, e, 'jump');
    } else if (c.airJumpsUsed < PHYS.baseAirJumps + (mods.airJumps ?? 0)) {
      // Hold the press for a free ground jump if we're about to land anyway. Re-checked every tick
      // while the press is buffered, so drifting off the ledge edge instead still double-jumps.
      const reach = e.vy > 0 ? e.vy * PHYS.airJumpLandGrace * DT + 0.5 : 0;
      const drop = reach > 0 ? dropDistance(grid, e, reach + 1) : reach + 1;
      const landingSoon = drop < reach && !spikesAt(world, e, e.y + e.h + drop);
      if (!landingSoon) {
        if (spendStamina(p, 1)) {
          if (dashing) endDash(p, e, PHYS.walkSpeed * speedMul);
          e.vy = -PHYS.airJumpSpeed * (1 + (mods.jump ?? 0));
          c.airJumpsUsed++;
          c.jumpBuffer = 0;
          c.jumping = true;
          c.diving = false;
          world.emit({ type: 'particles', preset: 'airjump', x: cx, y: e.y + e.h, count: 6 });
          emitAt(world, e, 'double_jump', 1.3);
        } else if (jumpPressed) {
          emitAt(world, e, 'stamina_empty');
        }
      }
    }
  }

  // --- Active dash ----------------------------------------------------------------------
  if (c.dashT > 0) {
    e.vx = c.dashDir * (c.dashAir ? PHYS.dashAirSpeed : PHYS.dashGroundSpeed) * speedMul;
    if (c.dashAir) e.vy = 0;
    c.dashT--;
  }

  // --- Gravity shaping (variable jump height + apex hang) ---------------------------------
  if (c.climbing || swimDown || (c.dashDir !== 0 && c.dashAir)) e.gravityScale = 0;
  else if (c.jumping && e.vy < 0 && !jumpHeld) e.gravityScale = PHYS.jumpCutGravity;
  else if (c.jumping && jumpHeld && Math.abs(e.vy) < PHYS.apexSpeed && liquid === 0) e.gravityScale = PHYS.apexGravity;
  else e.gravityScale = 1;

  // --- Facing: aim while attacking/swinging, else dash/movement ---------------------------
  if (e.swing || input.attack || input.alt) {
    const dx = input.aimX - cx;
    if (Math.abs(dx) > 0.5) e.facing = dx > 0 ? 1 : -1;
  } else if (c.dashDir !== 0) e.facing = c.dashDir > 0 ? 1 : -1;
  else if (move !== 0 && !c.climbing) e.facing = move > 0 ? 1 : -1;

  // --- Animation hint ---------------------------------------------------------------------
  setAnim(
    e,
    c.dashDir !== 0
      ? 'dash'
      : c.climbing
        ? 'climb'
        : liquid !== 0 && !e.onGround
          ? 'swim'
          : c.diving
            ? 'dive'
            : !e.onGround
              ? e.vy < 0
                ? 'jump'
                : 'fall'
              : Math.abs(e.vx) > 4
                ? 'run'
                : 'idle',
  );
}

/** Remember this tick's button states for edge detection on the next tick. */
export function latchInput(p: PlayerState, input: PlayerInput): void {
  p.prev.jump = input.jump;
  p.prev.attack = input.attack;
  p.prev.interact = input.interact;
  p.prev.alt = input.alt;
  p.prev.dash = input.dash ?? 0;
}

/** Store this tick's button states for edge detection. Runs last in the pipeline. */
export function playerInputLatchSystem(world: World): void {
  for (const p of world.players) latchInput(p, world.inputs[p.index]!);
}
