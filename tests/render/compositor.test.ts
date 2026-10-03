import { describe, expect, it } from 'vitest';
import { COMPOSITE_WGSL, LIGHT_RANGE } from '../../src/render/compositor';

/** `@group(g) @binding(b) var… name` declarations, as Pixi's WGSL reflection reads them. */
function bindings(src: string): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const m of src.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<[^>]+>)?\s+(\w+)/g)) out[m[3]!] = [Number(m[1]), Number(m[2])];
  return out;
}

describe('composite shader (WebGPU)', () => {
  it("follows Pixi's mesh bind-group conventions and names every resource the Compositor passes", () => {
    const b = bindings(COMPOSITE_WGSL);
    // Pixi auto-assigns group 0 'globalUniforms' and group 1 'localUniforms' for mesh shaders.
    expect(b.globalUniforms).toEqual([0, 0]);
    expect(b.localUniforms).toEqual([1, 0]);
    const names = ['compositeUniforms'];
    for (const t of ['uTerrain', 'uEntity', 'uLight', 'uEmissive', 'uBloom']) names.push(t, `${t}Sampler`);
    for (const n of names) expect(b[n], n).toBeDefined();
    // No two resources share a slot.
    const slots = Object.values(b).map(([g, i]) => `${g}:${i}`);
    expect(new Set(slots).size).toBe(slots.length);
    expect(COMPOSITE_WGSL).toContain('fn mainVertex(');
    expect(COMPOSITE_WGSL).toContain('fn mainFragment(');
    expect(COMPOSITE_WGSL).toContain(`* ${LIGHT_RANGE.toFixed(1)}`);
  });
});
