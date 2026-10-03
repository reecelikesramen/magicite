/**
 * Sprite system public API. Other workstreams register generators with `defineSprite` /
 * `defineSpriteFamily` (see registry.ts) and read textures with `getFrames` / `getIcon`.
 * Built-in generators (player, held items, item icons, slime, rock/ore, trees, plants, portal,
 * coin, gem, projectiles) are registered at BUILTIN_PRIORITY so any real art overrides them.
 */
import { registerBestiarySprites } from './builtin/bestiary';
import { registerCreatureSprites } from './builtin/creatures';
import { registerItemSprites } from './builtin/items';
import { registerMiscSprites } from './builtin/misc';
import { registerNatureSprites } from './builtin/nature';
import { registerPlayerSprites } from './builtin/player';

export {
  defineSprite,
  defineSpriteFamily,
  hasSprite,
  resolveSpriteDef,
  BUILTIN_PRIORITY,
  type PixelContext,
  type SpriteDef,
  type SpriteDrawOptions,
  type SpriteMeta,
  type SpriteFamily,
} from './registry';
export { getFrames, getIcon, spriteSet, setFrames, setFlashFrames, flushAtlas, type FrameSet, type PlaceholderSpec } from './atlas';
export { Pen } from './draw';
export { heldKey, heldKindFor, materialFor } from './builtin/items';

let registered = false;

/** Register the render core's built-in generators (idempotent). */
export function registerBuiltinSprites(): void {
  if (registered) return;
  registered = true;
  registerItemSprites();
  registerMiscSprites();
  registerPlayerSprites();
  registerCreatureSprites();
  registerBestiarySprites();
  registerNatureSprites();
}

// Built-ins are available as soon as anything imports this module (e.g. the HUD asking for item icons
// before the Renderer exists). They sit at BUILTIN_PRIORITY, so registration order never matters.
registerBuiltinSprites();
