import { Container, Graphics } from 'pixi.js';
import { PixelText } from './pixelfont';

/**
 * World-space UI drawn at screen resolution over the composited world (not lit): floating damage
 * numbers and player name tags. Text uses the pixel font at half native scale (like the original's
 * tiny name tags) when the integer scale allows it.
 */
interface Floater {
  text: PixelText;
  x: number;
  y: number;
  vx: number;
  t: number;
  life: number;
  big: boolean;
}

/** Damage number colours. */
export const DAMAGE_COLORS = {
  toPlayer: 0xff4a3a,
  toEnemy: 0xffffff,
  crit: 0xffe040,
  heal: 0x70ff70,
  fire: 0xffa040,
  ice: 0x90e0ff,
  poison: 0xa0ff50,
  magic: 0xd090ff,
  lightning: 0xfff080,
} as const;

export function damageColor(toPlayer: boolean, crit: boolean, type: string): number {
  if (toPlayer) return DAMAGE_COLORS.toPlayer;
  if (crit) return DAMAGE_COLORS.crit;
  return (DAMAGE_COLORS as Record<string, number>)[type] ?? DAMAGE_COLORS.toEnemy;
}

export class WorldOverlay {
  /** Add to the stage above the composited world. */
  readonly root = new Container();
  private world = new Container();
  private floaters: Floater[] = [];
  private freeTexts: PixelText[] = [];
  private tags = new Map<number, { text: PixelText; seen: number; bar: Graphics }>();
  private frame = 0;
  private scale = 4;
  /** Text scale relative to native pixels (0.5 = half-size glyph pixels). */
  private textScale = 0.5;

  constructor() {
    this.root.addChild(this.world);
  }

  /** Called every frame with the current integer scale and precise camera (native px). */
  setCamera(scale: number, camX: number, camY: number): void {
    if (scale !== this.scale) {
      this.scale = scale;
      this.textScale = Math.max(1, Math.floor(scale / 2)) / scale;
    }
    this.world.scale.set(scale);
    this.world.position.set(-Math.round(camX * scale), -Math.round(camY * scale));
  }

  /** Snap a world coordinate so text pixels land on whole screen pixels. */
  private snap(v: number): number {
    const q = this.scale * this.textScale;
    return Math.round(v * this.scale / q) * q / this.scale;
  }

  private takeText(): PixelText {
    const t = this.freeTexts.pop() ?? new PixelText('', { shadow: true });
    t.visible = true;
    t.alpha = 1;
    return t;
  }

  /** Spawn a floating number at world (x,y). */
  damage(x: number, y: number, amount: number, color: number, big = false): void {
    if (this.floaters.length > 60) this.retire(0);
    const text = this.takeText();
    text.text = String(amount);
    text.color = color;
    this.world.addChild(text);
    this.floaters.push({ text, x, y: y - 2, vx: (Math.random() - 0.5) * 8, t: 0, life: big ? 1.0 : 0.8, big });
  }

  heal(x: number, y: number, amount: number): void {
    this.damage(x, y, amount, DAMAGE_COLORS.heal);
    const f = this.floaters[this.floaters.length - 1]!;
    f.text.text = `+${amount}`;
  }

  private retire(i: number): void {
    const f = this.floaters[i]!;
    f.text.visible = false;
    f.text.removeFromParent();
    this.freeTexts.push(f.text);
    this.floaters.splice(i, 1);
  }

  /** Begin a frame of name tags. */
  beginTags(): void {
    this.frame++;
  }

  /** Name tag above a player at world (x = centre, y = top of sprite). `revive` 0..1 shows a bar. */
  tag(id: number, name: string, x: number, y: number, color: number, alpha: number, revive = -1): void {
    let t = this.tags.get(id);
    if (!t) {
      const text = this.takeText();
      const bar = new Graphics();
      this.world.addChild(text, bar);
      t = { text, seen: 0, bar };
      this.tags.set(id, t);
    }
    t.seen = this.frame;
    const tx = t.text;
    tx.text = name;
    tx.color = color;
    tx.alpha = alpha;
    tx.scale.set(this.textScale);
    const w = tx.textWidth * this.textScale;
    const h = 7 * this.textScale;
    tx.position.set(this.snap(x - w / 2), this.snap(y - h - 2));
    tx.visible = true;
    const bar = t.bar;
    bar.clear();
    if (revive >= 0) {
      const bw = 10;
      const bx = Math.round(x - bw / 2);
      const by = Math.round(y - h - 5);
      bar.rect(bx - 1, by - 1, bw + 2, 3).fill({ color: 0x101010, alpha: 0.85 });
      bar.rect(bx, by, Math.round(bw * Math.min(1, revive)), 1).fill(0x70ff70);
    }
  }

  /** Hide tags not refreshed this frame. */
  endTags(): void {
    for (const [id, t] of this.tags) {
      if (t.seen === this.frame) continue;
      t.text.removeFromParent();
      t.bar.destroy();
      this.freeTexts.push(t.text);
      this.tags.delete(id);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i]!;
      f.t += dt;
      if (f.t >= f.life) {
        this.retire(i);
        i--;
        continue;
      }
      const k = f.t / f.life;
      const rise = (1 - (1 - k) * (1 - k)) * 12;
      const pop = f.big ? 1.5 : 1;
      const sc = this.textScale * (k < 0.1 ? pop * (1.3 - k * 3) : pop);
      const tx = f.text;
      tx.scale.set(Math.max(this.textScale, Math.round(sc * this.scale) / this.scale));
      const w = tx.textWidth * tx.scale.x;
      tx.position.set(this.snap(f.x + f.vx * k - w / 2), this.snap(f.y - rise - 7 * tx.scale.y));
      tx.alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    }
  }

  clear(): void {
    while (this.floaters.length) this.retire(0);
    this.beginTags();
    this.endTags();
  }
}
