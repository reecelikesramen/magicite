/**
 * Pure timing/queue models for transient UI (toasts, pickup feed, banners). Views read these;
 * keeping them DOM-free makes fade/merge behaviour unit-testable.
 */

export interface Toast {
  text: string;
  color: number;
  /** Seconds alive. */
  age: number;
  /** Seconds before removal. */
  ttl: number;
  /** Merge key (pickups merge by item id). */
  key?: string;
  /** Accumulated amount for merged pickups. */
  count: number;
  /** Optional item icon id. */
  icon?: string;
}

/** Alpha for something with a fade-in, hold and fade-out (all in seconds). */
export function fadeAlpha(age: number, ttl: number, fadeIn = 0.12, fadeOut = 0.5): number {
  if (age < 0 || age >= ttl) return 0;
  if (age < fadeIn) return age / fadeIn;
  const left = ttl - age;
  return left < fadeOut ? left / fadeOut : 1;
}

export class ToastQueue {
  items: Toast[] = [];

  constructor(
    readonly max = 4,
    /** Seconds within which a same-key push merges into the existing toast. */
    readonly mergeWindow = 2,
  ) {}

  push(text: string, color: number, ttl = 3, key?: string, icon?: string): Toast {
    const t: Toast = { text, color, age: 0, ttl, key, count: 1, icon };
    this.items.push(t);
    while (this.items.length > this.max) this.items.shift();
    return t;
  }

  /**
   * Add `count` of something under `key`, merging with a live toast of the same key
   * ("+1 Wood", "+2 Wood" → "+3 Wood"). `format(total)` builds the text.
   */
  pushMerged(key: string, count: number, format: (total: number) => string, color: number, ttl = 2.5, icon?: string): Toast {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const t = this.items[i]!;
      if (t.key === key && t.age < this.mergeWindow) {
        t.count += count;
        t.text = format(t.count);
        t.age = Math.min(t.age, 0.12);
        // Move to the newest position so it stays visible.
        this.items.splice(i, 1);
        this.items.push(t);
        return t;
      }
    }
    const t = this.push(format(count), color, ttl, key, icon);
    t.count = count;
    return t;
  }

  tick(dt: number): void {
    let w = 0;
    for (const t of this.items) {
      t.age += dt;
      if (t.age < t.ttl) this.items[w++] = t;
    }
    this.items.length = w;
  }

  clear(): void {
    this.items.length = 0;
  }
}

/** A one-shot timed overlay (banner, flash). `age` < 0 = inactive. */
export class Timed {
  age = -1;
  constructor(public ttl: number) {}

  start(ttl = this.ttl): void {
    this.ttl = ttl;
    this.age = 0;
  }

  get active(): boolean {
    return this.age >= 0 && this.age < this.ttl;
  }

  tick(dt: number): void {
    if (this.age < 0) return;
    this.age += dt;
    if (this.age >= this.ttl) this.age = -1;
  }

  alpha(fadeIn = 0.15, fadeOut = 0.6): number {
    return this.active ? fadeAlpha(this.age, this.ttl, fadeIn, fadeOut) : 0;
  }
}
