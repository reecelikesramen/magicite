import { Container, Rectangle, Sprite, Texture } from 'pixi.js';

/**
 * Tiny 3×5 pixel font for stack counts, cooldown seconds and key labels (the original HUD uses
 * "tiny white digits" in slot corners). Same API shape as PixelText.
 */
export const MINI_H = 5;

// prettier-ignore
const MG: Record<string, string> = {
  '0': '###|#.#|#.#|#.#|###', '1': '.#.|##.|.#.|.#.|###', '2': '###|..#|###|#..|###', '3': '###|..#|.##|..#|###',
  '4': '#.#|#.#|###|..#|..#', '5': '###|#..|###|..#|###', '6': '###|#..|###|#.#|###', '7': '###|..#|..#|.#.|.#.',
  '8': '###|#.#|###|#.#|###', '9': '###|#.#|###|..#|###', 'x': '...|#.#|.#.|#.#|...', '/': '..#|..#|.#.|#..|#..',
  '+': '...|.#.|###|.#.|...', '-': '...|...|###|...|...', 'Z': '###|..#|.#.|#..|###', 'X': '#.#|#.#|.#.|#.#|#.#',
  'C': '.##|#..|#..|#..|.##', 'K': '#.#|#.#|##.|#.#|#.#', 'A': '.#.|#.#|###|#.#|#.#', 'B': '##.|#.#|##.|#.#|##.',
  'Y': '#.#|#.#|.#.|.#.|.#.', 's': '...|.##|##.|..#|##.', ':': '.|#|.|#|.', '.': '.|.|.|.|#', ' ': '..|..|..|..|..',
  '?': '##.|..#|.#.|...|.#.', 'L': '#..|#..|#..|#..|###', 'R': '##.|#.#|##.|#.#|#.#', 'E': '###|#..|##.|#..|###',
};

const ROWS = new Map<string, string[]>();
for (const [ch, def] of Object.entries(MG)) ROWS.set(ch, def.split('|'));

function rowsOf(ch: string): string[] {
  return ROWS.get(ch) ?? ROWS.get(ch.toUpperCase()) ?? ROWS.get('?')!;
}

export function measureMini(text: string): number {
  let w = 0;
  for (const ch of text) w += rowsOf(ch)[0]!.length + 1;
  return Math.max(0, w - 1);
}

/** Compact count label: 1234 → "1K", otherwise the number. */
export function countLabel(n: number): string {
  return n >= 1000 ? `${Math.floor(n / 1000)}K` : String(n);
}

let atlas: Map<string, Texture> | null = null;

function miniTextures(): Map<string, Texture> {
  if (atlas) return atlas;
  const chars = [...ROWS.keys()];
  const canvas = document.createElement('canvas');
  canvas.width = chars.length * 4;
  canvas.height = MINI_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  chars.forEach((ch, i) => {
    const rows = ROWS.get(ch)!;
    for (let y = 0; y < MINI_H; y++) for (let x = 0; x < rows[y]!.length; x++) if (rows[y]![x] === '#') ctx.fillRect(i * 4 + x, y, 1, 1);
  });
  const base = Texture.from(canvas);
  base.source.scaleMode = 'nearest';
  atlas = new Map();
  chars.forEach((ch, i) => atlas!.set(ch, new Texture({ source: base.source, frame: new Rectangle(i * 4, 0, ROWS.get(ch)![0]!.length, MINI_H) })));
  return atlas;
}

export class MiniText extends Container {
  private _text = '';
  private _color: number;
  private shadow: boolean;
  textWidth = 0;

  constructor(text = '', color = 0xffffff, shadow = true) {
    super();
    this._color = color;
    this.shadow = shadow;
    this.text = text;
  }

  get text(): string {
    return this._text;
  }

  set text(v: string) {
    if (v === this._text && (this.children.length || !v)) return;
    this._text = v;
    this.rebuild();
  }

  set color(c: number) {
    if (c === this._color) return;
    this._color = c;
    this.rebuild();
  }

  private rebuild(): void {
    for (const c of this.removeChildren()) c.destroy();
    const tex = miniTextures();
    this.textWidth = measureMini(this._text);
    const layers: [number, number][] = this.shadow ? [[1, 0x000000], [0, this._color]] : [[0, this._color]];
    for (const [o, color] of layers) {
      let x = 0;
      for (const ch of this._text) {
        const rows = rowsOf(ch);
        const t = tex.get(ROWS.has(ch) ? ch : ROWS.has(ch.toUpperCase()) ? ch.toUpperCase() : '?');
        if (t && ch !== ' ') {
          const s = new Sprite(t);
          s.tint = color;
          s.position.set(x + o, o);
          this.addChild(s);
        }
        x += rows[0]!.length + 1;
      }
    }
  }
}
