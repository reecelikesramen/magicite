import { approach } from '../../engine/math';
import { DT, HOTBAR_SIZE, PHYS, TILE } from '../constants';
import { tileProps } from '../tiles';
import type { Entity, PlayerInput, PlayerState } from '../types';
import type { World } from '../world';

/** True on the tick a held button goes down. */
export function pressed(p: PlayerState, input: PlayerInput, key: keyof PlayerState['prev']): boolean {
  return input[key] && !p.prev[key];
}

function standingOnPlatformOnly(world: World, e: Entity): boolean {
  const grid = world.level.grid;
  const ty = Math.floor((e.y + e.h + 0.5) / TILE);
  const t0 = Math.floor(e.x / TILE);
  const t1 = Math.floor((e.x + e.w - 1e-4) / TILE);
  let any = false;
  for (let tx = t0; tx <= t1; tx++) {
    const p = tileProps(grid.get(tx, ty));
    if (p.solid) return false;
    if (p.oneWay) any = true;
  }
  return any;
}

/**
 * Platformer controller: acceleration-based run, coyote time, jump buffering, variable jump
 * height, one-way platform drop-through (Down + Jump), ladders and swimming.
 */
export function playerControlSystem(world: World): void {
  if (world.freeze > 0) return;
  for (const p of world.players) {
    const e = world.get(p.entityId);
    if (e) controlPlayer(world, p, e, world.inputs[p.index]!);
  }
}

/**
 * One player's movement for one tick. Exposed separately so netcode can re-run it for client-side
 * prediction (controlPlayer + physics `integrate` on the local player only).
 */
export function controlPlayer(world: World, p: PlayerState, e: Entity, input: PlayerInput): void {

  if (input.select >= 0 && input.select < HOTBAR_SIZE) p.selected = input.select;

  if (p.downed || p.out) {
    e.vx = approach(e.vx, 0, PHYS.groundDecel * DT);
    e.gravityScale = 1;
    return;
  }

  const mods = p.mods;
  const speed = PHYS.walkSpeed * (1 + (mods.moveSpeed ?? 0)) * (e.inLiquid ? 0.6 : 1);
  const jumpSpeed = PHYS.jumpSpeed * (1 + (mods.jump ?? 0));
  const ctl = p.ctl;

  // --- Horizontal -------------------------------------------------------------------
  const move = Math.abs(input.moveX) < 0.2 ? 0 : Math.sign(input.moveX);
  const friction = e.onGround ? tileProps(world.level.grid.get(Math.floor((e.x + e.w / 2) / TILE), Math.floor((e.y + e.h + 1) / TILE))).friction : 1;
  const accel = (e.onGround ? PHYS.groundAccel : PHYS.airAccel) * friction;
  const decel = (e.onGround ? PHYS.groundDecel : PHYS.airDecel) * friction;
  if (move !== 0) e.vx = approach(e.vx, move * speed, (Math.sign(e.vx) === -move ? decel + accel : accel) * DT);
  else e.vx = approach(e.vx, 0, decel * DT);

  if (move !== 0 && !e.swing) e.facing = move > 0 ? 1 : -1;

  // --- Ladders ------------------------------------------------------------------------
  if (e.onLadder && Math.abs(input.moveY) > 0.5 && !ctl.climbing) ctl.climbing = true;
  if (!e.onLadder) ctl.climbing = false;
  if (ctl.climbing) {
    e.gravityScale = 0;
    e.vy = Math.abs(input.moveY) > 0.3 ? Math.sign(input.moveY) * PHYS.climbSpeed : 0;
    e.vx = approach(e.vx, move * speed * 0.6, PHYS.groundAccel * DT);
    ctl.airJumpsUsed = 0;
  }

  // --- Jumping ------------------------------------------------------------------------
  if (e.onGround || ctl.climbing) {
    ctl.coyote = PHYS.coyoteTicks;
    ctl.airJumpsUsed = 0;
  } else if (ctl.coyote > 0) ctl.coyote--;

  if (pressed(p, input, 'jump')) ctl.jumpBuffer = PHYS.jumpBufferTicks;
  else if (ctl.jumpBuffer > 0) ctl.jumpBuffer--;

  if (ctl.dropThrough > 0) {
    ctl.dropThrough--;
    e.usesPlatforms = ctl.dropThrough === 0;
  }

  if (ctl.jumpBuffer > 0) {
    if (input.moveY > 0.5 && e.onGround && standingOnPlatformOnly(world, e)) {
      // Drop through a one-way platform.
      ctl.dropThrough = 10;
      e.usesPlatforms = false;
      e.y += 1;
      ctl.jumpBuffer = 0;
    } else if (e.inLiquid) {
      e.vy = -PHYS.swimJumpSpeed;
      ctl.jumpBuffer = 0;
    } else if (ctl.coyote > 0) {
      e.vy = -jumpSpeed;
      ctl.coyote = 0;
      ctl.jumpBuffer = 0;
      ctl.climbing = false;
      world.emit({ type: 'sfx', id: 'jump', x: e.x + e.w / 2, y: e.y + e.h });
    } else if (ctl.airJumpsUsed < (mods.airJumps ?? 0)) {
      e.vy = -jumpSpeed * 0.9;
      ctl.airJumpsUsed++;
      ctl.jumpBuffer = 0;
      world.emit({ type: 'particles', preset: 'airjump', x: e.x + e.w / 2, y: e.y + e.h });
      world.emit({ type: 'sfx', id: 'jump', x: e.x + e.w / 2, y: e.y + e.h, pitch: 1.3 });
    }
  }

  // Variable jump height: releasing jump while rising increases gravity.
  if (!ctl.climbing) e.gravityScale = e.vy < 0 && !input.jump ? PHYS.jumpCutGravity : 1;

  // Animation hint.
  e.anim = ctl.climbing ? 'climb' : !e.onGround ? (e.vy < 0 ? 'jump' : 'fall') : Math.abs(e.vx) > 4 ? 'run' : 'idle';
}

/** Store this tick's button states for edge detection. Runs last in the pipeline. */
export function playerInputLatchSystem(world: World): void {
  for (const p of world.players) {
    const input = world.inputs[p.index]!;
    p.prev.jump = input.jump;
    p.prev.attack = input.attack;
    p.prev.interact = input.interact;
    p.prev.alt = input.alt;
  }
}

