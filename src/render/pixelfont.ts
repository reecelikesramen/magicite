import { Container, Rectangle, Sprite, Texture } from 'pixi.js';

/**
 * Code-defined 7px-tall proportional pixel font (mixed case, like the original HUD).
 * Each glyph is rows of '#' (ink) / '.' (blank); width = row length. 1px letter spacing.
 * Usable both from canvas code (`drawTextToCanvas`) and as Pixi display objects (`PixelText`).
 */
export const GLYPH_H = 7;
export const LETTER_SPACING = 1;

// prettier-ignore
const G: Record<string, string> = {
  ' ': '...|...|...|...|...|...|...',
  'A': '.###.|#...#|#...#|#####|#...#|#...#|#...#', 'B': '####.|#...#|#...#|####.|#...#|#...#|####.',
  'C': '.###.|#...#|#....|#....|#....|#...#|.###.', 'D': '####.|#...#|#...#|#...#|#...#|#...#|####.',
  'E': '#####|#....|#....|####.|#....|#....|#####', 'F': '#####|#....|#....|####.|#....|#....|#....',
  'G': '.###.|#...#|#....|#.###|#...#|#...#|.####', 'H': '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  'I': '###|.#.|.#.|.#.|.#.|.#.|###', 'J': '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
  'K': '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', 'L': '#....|#....|#....|#....|#....|#....|#####',
  'M': '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', 'N': '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  'O': '.###.|#...#|#...#|#...#|#...#|#...#|.###.', 'P': '####.|#...#|#...#|####.|#....|#....|#....',
  'Q': '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', 'R': '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  'S': '.####|#....|#....|.###.|....#|....#|####.', 'T': '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  'U': '#...#|#...#|#...#|#...#|#...#|#...#|.###.', 'V': '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  'W': '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', 'X': '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  'Y': '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', 'Z': '#####|....#|...#.|..#..|.#...|#....|#####',
  'a': '.....|.....|.###.|....#|.####|#...#|.####', 'b': '#....|#....|####.|#...#|#...#|#...#|####.',
  'c': '....|....|.###|#...|#...|#...|.###', 'd': '....#|....#|.####|#...#|#...#|#...#|.####',
  'e': '.....|.....|.###.|#...#|#####|#....|.###.', 'f': '..##|.#..|####|.#..|.#..|.#..|.#..',
  'g': '.....|.####|#...#|#...#|.####|....#|.###.', 'h': '#....|#....|####.|#...#|#...#|#...#|#...#',
  'i': '.#.|...|##.|.#.|.#.|.#.|###', 'j': '..#|...|.##|..#|..#|#.#|.#.',
  'k': '#...|#...|#..#|#.#.|##..|#.#.|#..#', 'l': '##.|.#.|.#.|.#.|.#.|.#.|###',
  'm': '.....|.....|##.#.|#.#.#|#.#.#|#.#.#|#...#', 'n': '.....|.....|####.|#...#|#...#|#...#|#...#',
  'o': '.....|.....|.###.|#...#|#...#|#...#|.###.', 'p': '.....|####.|#...#|#...#|####.|#....|#....',
  'q': '.....|.####|#...#|#...#|.####|....#|....#', 'r': '....|....|#.##|##..|#...|#...|#...',
  's': '.....|.....|.####|#....|.###.|....#|####.', 't': '.#..|.#..|###.|.#..|.#..|.#..|..##',
  'u': '.....|.....|#...#|#...#|#...#|#...#|.####', 'v': '.....|.....|#...#|#...#|#...#|.#.#.|..#..',
  'w': '.....|.....|#...#|#.#.#|#.#.#|#.#.#|.#.#.', 'x': '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
  'y': '.....|#...#|#...#|#...#|.####|....#|.###.', 'z': '.....|.....|#####|...#.|..#..|.#...|#####',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', '1': '.#.|##.|.#.|.#.|.#.|.#.|###',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####', '3': '####.|....#|....#|.###.|....#|....#|####.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '.###.|#....|#....|####.|#...#|#...#|.###.', '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.', '9': '.###.|#...#|#...#|.####|....#|....#|.###.',
  '!': '#|#|#|#|#|.|#', '"': '#.#|#.#|...|...|...|...|...', '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.',
  '$': '..#..|.####|#.#..|.###.|..#.#|####.|..#..', '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##',
  '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#', "'": '#|#|.|.|.|.|.', '(': '.#|#.|#.|#.|#.|#.|.#',
  ')': '#.|.#|.#|.#|.#|.#|#.', '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....', '+': '...|...|.#.|###|.#.|...|...',
  ',': '..|..|..|..|..|.#|#.', '-': '...|...|...|###|...|...|...', '.': '.|.|.|.|.|.|#', '/': '....#|...#.|...#.|..#..|.#...|.#...|#....',
  ':': '.|.|#|.|.|#|.', ';': '..|..|.#|..|..|.#|#.', '<': '...|..#|.#.|#..|.#.|..#|...', '=': '...|...|###|...|###|...|...',
  '>': '...|#..|.#.|..#|.#.|#..|...', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', '@': '.###.|#...#|#.###|#.#.#|#.###|#....|.###.',
  '[': '##|#.|#.|#.|#.|#.|##', ']': '##|.#|.#|.#|.#|.#|##', '_': '.....|.....|.....|.....|.....|.....|#####',
  '\\': '#....|.#...|.#...|..#..|...#.|...#.|....#', '^': '.#.|#.#|...|...|...|...|...', '|': '#|#|#|#|#|#|#',
  '~': '.....|.....|.#...|#.#.#|...#.|.....|.....', '{': '..#|.#.|.#.|#..|.#.|.#.|..#', '}': '#..|.#.|.#.|..#|.#.|.#.|#..',
  '`': '#.|.#|..|..|..|..|..', '×': '...|...|#.#|.#.|#.#|...|...',
};

interface Glyph {
  w: number;
  rows: string[];
}

const GLYPHS = new Map<string, Glyph>();
for (const [ch, def] of Object.entries(G)) {
  const rows = def.split('|');
  if (rows.length !== GLYPH_H) throw new Error(`glyph ${ch} has ${rows.length} rows`);
  GLYPHS.set(ch, { w: rows[0]!.length, rows });
}
const FALLBACK = GLYPHS.get('?')!;

function glyph(ch: string): Glyph {
  return GLYPHS.get(ch) ?? GLYPHS.get(ch.toUpperCase()) ?? FALLBACK;
}

/** Width in px of a single line of text. */
export function measureText(text: string): number {
  let w = 0;
  for (const ch of text) w += glyph(ch).w + LETTER_SPACING;
  return Math.max(0, w - LETTER_SPACING);
}

/** Draw text into a 2D canvas at native scale (for procedurally generated textures/UI). */
export function drawTextToCanvas(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, shadow?: string): void {
  if (shadow) drawTextToCanvas(ctx, text, x + 1, y + 1, shadow);
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of text) {
    const g = glyph(ch);
    for (let r = 0; r < GLYPH_H; r++) {
      const row = g.rows[r]!;
      for (let c = 0; c < g.w; c++) if (row[c] === '#') ctx.fillRect(cx + c, y + r, 1, 1);
    }
    cx += g.w + LETTER_SPACING;
  }
}

let atlas: Map<string, Texture> | null = null;

/** Lazily builds one white-glyph atlas texture and a sub-texture per character. */
function glyphTextures(): Map<string, Texture> {
  if (atlas) return atlas;
  const chars = [...GLYPHS.keys()];
  const cell = 6;
  const cols = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols * (cell + 1);
  canvas.height = Math.ceil(chars.length / cols) * (GLYPH_H + 1);
  const ctx = canvas.getContext('2d')!;
  const base = Texture.from(canvas);
  atlas = new Map();
  chars.forEach((ch, i) => {
    const gx = (i % cols) * (cell + 1);
    const gy = Math.floor(i / cols) * (GLYPH_H + 1);
    drawTextToCanvas(ctx, ch, gx, gy, '#ffffff');
    atlas!.set(ch, new Texture({ source: base.source, frame: new Rectangle(gx, gy, Math.max(1, glyph(ch).w), GLYPH_H) }));
  });
  base.source.update();
  return atlas;
}

export interface PixelTextOptions {
  color?: number;
  /** Draw a 1px dark drop shadow (HUD style). */
  shadow?: boolean;
  shadowColor?: number;
  align?: 'left' | 'center' | 'right';
  /** Line height in px for multi-line text. */
  lineHeight?: number;
}

/** A Pixi display object rendering pixel-font text at native scale (put it in a scaled container). */
export class PixelText extends Container {
  private _text = '';
  private opts: Required<PixelTextOptions>;
  textWidth = 0;
  textHeight = 0;

  constructor(text = '', opts: PixelTextOptions = {}) {
    super();
    this.opts = { color: 0xffffff, shadow: true, shadowColor: 0x000000, align: 'left', lineHeight: GLYPH_H + 2, ...opts };
    this.text = text;
  }

  get text(): string {
    return this._text;
  }

  set text(v: string) {
    if (v === this._text && this.children.length) return;
    this._text = v;
    this.rebuild();
  }

  set color(c: number) {
    if (c === this.opts.color) return;
    this.opts.color = c;
    this.rebuild();
  }

  private rebuild(): void {
    for (const c of this.removeChildren()) c.destroy();
    const tex = glyphTextures();
    const lines = this._text.split('\n');
    this.textWidth = Math.max(0, ...lines.map(measureText));
    this.textHeight = lines.length * this.opts.lineHeight - (this.opts.lineHeight - GLYPH_H);
    const layers: [number, number, number][] = this.opts.shadow ? [[1, 1, this.opts.shadowColor], [0, 0, this.opts.color]] : [[0, 0, this.opts.color]];
    for (const [ox, oy, color] of layers) {
      lines.forEach((line, li) => {
        const lw = measureText(line);
        let x = this.opts.align === 'center' ? Math.round((this.textWidth - lw) / 2) : this.opts.align === 'right' ? this.textWidth - lw : 0;
        for (const ch of line) {
          const g = glyph(ch);
          const t = tex.get(GLYPHS.has(ch) ? ch : GLYPHS.has(ch.toUpperCase()) ? ch.toUpperCase() : '?');
          if (t && ch !== ' ') {
            const s = new Sprite(t);
            s.tint = color;
            s.position.set(x + ox, li * this.opts.lineHeight + oy);
            this.addChild(s);
          }
          x += g.w + LETTER_SPACING;
        }
      });
    }
  }
}
