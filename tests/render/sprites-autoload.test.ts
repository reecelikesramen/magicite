import { describe, expect, it } from 'vitest';
// Only the public entry point, no explicit registerBuiltinSprites() (fresh module state per test file).
import { resolveSpriteDef } from '../../src/render/sprites';

describe('sprite entry point', () => {
  it('has the built-in generators registered on import (UI icons may be requested before the Renderer exists)', () => {
    expect(resolveSpriteDef('gold_coin')).not.toBeNull();
    expect(resolveSpriteDef('player_drifter#0')).not.toBeNull();
    expect(resolveSpriteDef('held:axe:iron')).not.toBeNull();
  });
});
