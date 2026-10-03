import { describe, expect, it } from 'vitest';
import { CH_BASS, CH_DRUMS, CH_HARMONY, CH_LEAD, compose, composeTrack, STEPS_PER_BAR } from '../../src/audio/music/compose';
import { moodFor, MOODS, resolveTrackId } from '../../src/audio/music/moods';
import { degreeToMidi, MODES, nearestChordTone, scalePitchClasses } from '../../src/audio/music/theory';

const TRACKS = ['forest', 'cave', 'frost', 'swamp', 'volcano', 'crystal', 'town', 'boss', 'title', 'lair', 'invasion', 'victory', 'gameover'];

describe('music theory helpers', () => {
  it('maps scale degrees across octaves', () => {
    const maj = MODES.major;
    expect(degreeToMidi(60, maj, 0)).toBe(60);
    expect(degreeToMidi(60, maj, 2)).toBe(64);
    expect(degreeToMidi(60, maj, 7)).toBe(72);
    expect(degreeToMidi(60, maj, -1)).toBe(59);
    expect(degreeToMidi(60, maj, -7)).toBe(48);
  });

  it('snaps to the nearest chord tone', () => {
    expect(nearestChordTone(1, 0, 7)).toBe(0); // D → C over C major (tie prefers lower)
    expect(nearestChordTone(3, 0, 7)).toBe(2); // F → E
    expect(nearestChordTone(5, 4, 7)).toBe(4); // A → G over G
  });
});

describe('generative composer', () => {
  it('has every required track id', () => {
    for (const id of TRACKS) expect(MOODS[id], id).toBeDefined();
  });

  it('maps biome ids onto tracks', () => {
    expect(resolveTrackId('woods')).toBe('forest');
    expect(resolveTrackId('fen')).toBe('swamp');
    expect(resolveTrackId('hollow')).toBe('cave');
    expect(resolveTrackId('rime')).toBe('frost');
    expect(resolveTrackId('amethyst')).toBe('crystal');
    expect(resolveTrackId('cinder')).toBe('volcano');
    expect(resolveTrackId('lair')).toBe('lair');
  });

  it('is deterministic: same track + seed → identical note list', () => {
    for (const id of TRACKS) {
      const a = compose(moodFor(id), 7);
      const b = compose(moodFor(id), 7);
      expect(b.notes, id).toEqual(a.notes);
      expect(b.chords, id).toEqual(a.chords);
    }
  });

  it('different seeds give different tunes', () => {
    const a = compose(moodFor('forest'), 1);
    const b = compose(moodFor('forest'), 2);
    expect(b.notes).not.toEqual(a.notes);
  });

  it('tracks differ from each other', () => {
    const lead = (id: string): number[] => composeTrack(id).notes.filter((n) => n.ch === CH_LEAD).map((n) => n.note);
    expect(lead('forest')).not.toEqual(lead('cave'));
    expect(composeTrack('boss').bpm).toBeGreaterThan(composeTrack('frost').bpm);
  });

  it('memoises compositions per (track, seed)', () => {
    expect(composeTrack('town', 3)).toBe(composeTrack('town', 3));
    expect(composeTrack('woods', 1)).toBe(composeTrack('forest', 1));
  });

  it('produces well-formed, sorted, in-range events', () => {
    for (const id of TRACKS) {
      const c = composeTrack(id);
      const intro = c.mood.intro === 'sting' ? 1 : c.mood.intro === 'fanfare' ? 2 : 0;
      expect(c.loopStart, id).toBe(intro * STEPS_PER_BAR);
      expect(c.lengthSteps, id).toBe(c.loopStart + c.mood.form.length * c.mood.barsPerSection * STEPS_PER_BAR);
      expect(c.chords.length * STEPS_PER_BAR, id).toBe(c.lengthSteps);
      expect(c.stepDur, id).toBeCloseTo(60 / c.bpm / 4, 9);
      for (let i = 0; i < c.notes.length; i++) {
        const n = c.notes[i]!;
        if (i > 0) expect(n.step, id).toBeGreaterThanOrEqual(c.notes[i - 1]!.step);
        expect(n.step, id).toBeGreaterThanOrEqual(0);
        expect(n.step + n.len, id).toBeLessThanOrEqual(c.lengthSteps);
        expect(n.len, id).toBeGreaterThanOrEqual(1);
        expect(n.vel, id).toBeGreaterThan(0);
        expect(n.vel, id).toBeLessThanOrEqual(1);
        if (n.ch === CH_LEAD) {
          expect(n.note, id).toBeGreaterThanOrEqual(48);
          expect(n.note, id).toBeLessThanOrEqual(100);
        } else if (n.ch === CH_BASS) {
          expect(n.note, id).toBeGreaterThanOrEqual(26);
          expect(n.note, id).toBeLessThanOrEqual(64);
        } else if (n.ch === CH_DRUMS) {
          expect(n.note, id).toBeGreaterThanOrEqual(0);
          expect(n.note, id).toBeLessThanOrEqual(5);
        }
      }
      const first = c.notes[c.loopStartIndex];
      if (first) expect(first.step, id).toBeGreaterThanOrEqual(c.loopStart);
      if (c.loopStartIndex > 0) expect(c.notes[c.loopStartIndex - 1]!.step, id).toBeLessThan(c.loopStart);
    }
  });

  it('keeps lead and harmony inside the mode', () => {
    for (const id of TRACKS) {
      const c = composeTrack(id);
      const pcs = scalePitchClasses(c.mood.root, MODES[c.mood.mode]);
      for (const n of c.notes) {
        if (n.ch !== CH_LEAD && n.ch !== CH_HARMONY) continue;
        expect(pcs.has(((n.note % 12) + 12) % 12), `${id} note ${n.note}`).toBe(true);
      }
    }
  });

  it('every looping track has all four voices; drums respect section rules', () => {
    for (const id of TRACKS) {
      const c = composeTrack(id);
      const chans = new Set(c.notes.map((n) => n.ch));
      expect(chans.has(CH_LEAD), id).toBe(true);
      expect(chans.has(CH_BASS), id).toBe(true);
      if (c.mood.harmony.style !== 'none') expect(chans.has(CH_HARMONY), id).toBe(true);
      expect(chans.has(CH_DRUMS), id).toBe(c.mood.drums.style !== 'none' || c.mood.intro !== 'none');
    }
    // Frost: no drums in the A sections (only B).
    const frost = composeTrack('frost');
    const secSteps = frost.mood.barsPerSection * STEPS_PER_BAR;
    for (const n of frost.notes) {
      if (n.ch !== CH_DRUMS) continue;
      const letter = frost.mood.form[Math.floor((n.step - frost.loopStart) / secSteps)];
      expect(letter).toBe('B');
    }
  });

  it('repeated section letters reuse the melody (themes recur)', () => {
    const c = composeTrack('town');
    const secSteps = c.mood.barsPerSection * STEPS_PER_BAR;
    const leadIn = (sec: number): string =>
      c.notes
        .filter((n) => n.ch === CH_LEAD && n.step >= c.loopStart + sec * secSteps && n.step < c.loopStart + (sec + 1) * secSteps - STEPS_PER_BAR)
        .map((n) => `${n.step - sec * secSteps}:${n.note}`)
        .join(',');
    // AABA: first three bars of section 0 and section 1 (both 'A') match.
    expect(c.mood.form).toBe('AABA');
    expect(leadIn(1)).toBe(leadIn(0));
  });

  it('gives unknown track ids a stable derived mood', () => {
    const a = moodFor('phase2_dunes');
    expect(moodFor('phase2_dunes')).toBe(a);
    expect(a.id).toBe('phase2_dunes');
    expect(composeTrack('phase2_dunes').notes.length).toBeGreaterThan(20);
  });
});
