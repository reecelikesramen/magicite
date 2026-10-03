import { Container, Graphics } from 'pixi.js';
import { Content } from '../content';
import { PixelText } from '../render/pixelfont';
import type { Entity } from '../sim/types';
import type { World } from '../sim/world';

/** How close (px) the local player must be to an untouched boss for its bar to appear. */
const SHOW_RANGE = 260;
/** A boss already in the fight (damaged) keeps its bar up within this range. */
const FIGHT_RANGE = 640;
const BAR_W = 160;

/**
 * The boss to show a health bar for: the nearest living boss that is close, or already hurt and
 * within fight range. Pure (works on a client's mirror world: hp/maxHp are in snapshots).
 */
export function bossForBar(world: World, playerIndex: number): Entity | undefined {
  const me = world.playerEntity(playerIndex);
  if (!me) return undefined;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const e of world.entities) {
    if (e.kind !== 'boss' || e.dead || e.hp <= 0) continue;
    const d = Math.hypot(e.x + e.w / 2 - (me.x + me.w / 2), e.y + e.h / 2 - (me.y + me.h / 2));
    const range = e.hp < e.maxHp ? FIGHT_RANGE : SHOW_RANGE;
    if (d <= range && d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Boss title + HP bar along the bottom of the screen, with a trailing "recent damage" segment. */
export class BossBar extends Container {
  private readonly bar = new Graphics();
  private readonly title = new PixelText('', { color: 0xffc040, align: 'center' });
  private viewW = 320;
  private viewH = 180;
  private shown = 0;
  private trail = 1;
  private bossId = 0;

  constructor() {
    super();
    this.addChild(this.bar, this.title);
    this.visible = false;
  }

  layout(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
  }

  update(world: World, playerIndex: number, dt: number): void {
    const boss = bossForBar(world, playerIndex);
    this.shown = Math.max(0, Math.min(1, this.shown + (boss ? dt * 4 : -dt * 2)));
    this.visible = this.shown > 0;
    if (!boss) return;
    if (boss.id !== this.bossId) {
      this.bossId = boss.id;
      this.trail = 1;
      this.title.text = Content.bosses.get(boss.def)?.title ?? boss.def;
    }
    const f = Math.max(0, boss.hp / Math.max(1, boss.maxHp));
    this.trail = Math.max(f, this.trail - dt * 0.35);
    const x = Math.round((this.viewW - BAR_W) / 2);
    const y = this.viewH - 16;
    this.alpha = this.shown;
    this.bar
      .clear()
      .rect(x - 1, y - 1, BAR_W + 2, 6)
      .fill({ color: 0x120c08, alpha: 0.9 })
      .rect(x, y, BAR_W, 4)
      .fill(0x3a1010)
      .rect(x, y, Math.round(BAR_W * this.trail), 4)
      .fill(0xffe0a0)
      .rect(x, y, Math.round(BAR_W * f), 4)
      .fill(0xd02828)
      .rect(x, y, Math.round(BAR_W * f), 1)
      .fill(0xff7060);
    this.title.position.set(Math.round(this.viewW / 2 - this.title.textWidth / 2), y - 10);
  }
}
