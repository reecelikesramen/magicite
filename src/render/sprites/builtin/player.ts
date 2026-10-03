import { shade } from '../../color';
import { Pen } from '../draw';
import { BUILTIN_PRIORITY, defineSpriteFamily, type SpriteDef } from '../registry';

/**
 * Chibi player (8×12 body in a 12×14 canvas; head ≈ 45%). Facing right; the renderer mirrors.
 * Keys: `player`, `race_<id>` or any key containing a race id, optionally suffixed `#<index>`
 * to pick the per-player tunic colour (co-op players are told apart by colour and name tag).
 */
interface Look {
  hair: number;
  skin: number;
  eye?: number;
}

const RACES: [RegExp, Look][] = [
  [/highborn|elf/, { hair: 0xe8d070, skin: 0xf8d8b8 }],
  [/cyclorc|orc/, { hair: 0x2a2a1a, skin: 0x6a9a4a, eye: 0xffe040 }],
  [/stoutling|dwarf/, { hair: 0xb0501a, skin: 0xe8b890 }],
  [/templar|knight/, { hair: 0x9a9aa4, skin: 0xf0c8a0 }],
  [/wraithkin|wraith/, { hair: 0x2a2a48, skin: 0xb8c0dc, eye: 0x60ffff }],
  [/mosskin|moss/, { hair: 0x3a6a2a, skin: 0x8ab05a }],
  [/boarfolk|boar/, { hair: 0x5a3a2a, skin: 0xe8a0a0 }],
  [/saurian|lizard/, { hair: 0x2a6a4a, skin: 0x4a9a6a, eye: 0xffe040 }],
  [/ifrit|fire/, { hair: 0xffb030, skin: 0xd05030, eye: 0xfff0a0 }],
];
const DEFAULT_LOOK: Look = { hair: 0x5a3418, skin: 0xf0c8a0 };

/** Tunic colours per player index (P1 red, P2 blue, P3 green, P4 purple). */
export const PLAYER_TUNICS = [0xb03a2a, 0x3a5ab0, 0x3a8a3a, 0x8a3ab0];

const HEAD = ['..hhhh..', '.hHHhhh.', '.hhhhhhh', '.hhsssss', '.hsseses', '..hssss.'];
const HEAD_BACK = ['..hhhh..', '.hhHHhh.', '.hhhhhhh', '.hhhhhhh', '.hhhhhh.', '..hhhh..'];
const BODY = ['..tttt..', '.stTTts.', '..tttt..', '..bbbb..'];
const BODY_SWING = ['..tttt..', '..tTTtss', '.stttt..', '..bbbb..'];
const BODY_UP = ['.sttttS.', '..tTTt..', '..tttt..', '..bbbb..'];
const BODY_OUT = ['s.tttt.s', '..tTTt..', '..tttt..', '..bbbb..'];
const LEGS: Record<string, string[]> = {
  stand: ['..l..l..', '..ff.ff.'],
  wide: ['.l....l.', 'ff....ff'],
  pass: ['...ll...', '...fff..'],
  mid: ['..l..l..', '.ff..ff.'],
  pass2: ['..ll....', '..fff...'],
  tuck: ['.ll..ll.', '........'],
  hang: ['..l..l..', '..f..f..'],
};
const DOWNED = ['........hhh.', '.......hhhhh', 'ffllbtttsSsh', 'ffllbtTtssss'];

function lookFor(key: string): Look {
  for (const [re, l] of RACES) if (re.test(key)) return l;
  return DEFAULT_LOOK;
}

export function playerDef(key: string): SpriteDef {
  const look = lookFor(key.split('#')[0]!);
  const idx = Number(key.split('#')[1] ?? 0) || 0;
  const tunic = PLAYER_TUNICS[idx % PLAYER_TUNICS.length]!;
  const pal: Record<string, number> = {
    h: look.hair,
    H: shade(look.hair, 1.35),
    s: look.skin,
    S: shade(look.skin, 0.8),
    e: look.eye ?? 0x1a1010,
    t: tunic,
    T: shade(tunic, 0.72),
    b: 0x4a2a14,
    l: 0x3a2a24,
    f: 0x22160e,
  };
  return {
    w: 12,
    h: 14,
    anims: { idle: 2, run: 4, jump: 1, fall: 1, climb: 2, swing: 1, downed: 1 },
    origin: { x: 6, y: 14 },
    fps: { idle: 2, run: 10, climb: 6 },
    draw(ctx, anim, frame) {
      const p = new Pen(ctx, 2, 2);
      if (anim === 'downed') {
        p.ox = 0;
        p.grid(DOWNED, pal, 0, 8);
        return;
      }
      let head = HEAD;
      let body = BODY;
      let legs = LEGS.stand!;
      let headDy = 0;
      let dy = 0;
      switch (anim) {
        case 'idle':
          headDy = frame === 1 ? 1 : 0;
          break;
        case 'run':
          legs = [LEGS.wide!, LEGS.pass!, LEGS.mid!, LEGS.pass2!][frame % 4]!;
          dy = frame % 2 === 1 ? -1 : 0;
          break;
        case 'jump':
          body = BODY_UP;
          legs = LEGS.tuck!;
          break;
        case 'fall':
          body = BODY_OUT;
          legs = LEGS.hang!;
          break;
        case 'climb':
          head = HEAD_BACK;
          body = frame === 0 ? ['s.tttt..', '..tTTts.', '..tttt..', '..bbbb..'] : ['..tttt.s', '.stTTt..', '..tttt..', '..bbbb..'];
          legs = frame === 0 ? ['..l..l..', '..f..ff.'] : ['..l..l..', '.ff..f..'];
          break;
        case 'swing':
          body = BODY_SWING;
          legs = LEGS.mid!;
          break;
      }
      p.grid(legs, pal, 0, 10 + dy);
      p.grid(body, pal, 0, 6 + dy);
      p.grid(head, pal, 0, headDy + dy);
    },
  };
}

export function registerPlayerSprites(): void {
  defineSpriteFamily(
    'player',
    (key) => {
      const base = key.split('#')[0]!;
      if (base === 'player' || base.startsWith('race_') || base.startsWith('player_')) return playerDef(key);
      return null;
    },
    BUILTIN_PRIORITY,
  );
}
