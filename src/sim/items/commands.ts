import { Content, recipeKey } from '../../content';
import type { PlayerState } from '../types';
import type { World } from '../world';
import { addItem } from './inventory';

/** Two-item crafting ("Combine any two items to create a new one! Wood + Wood = Plank"). */
export function craft(world: World, p: PlayerState, a: number, b: number): void {
  const sa = p.inventory[a];
  const sb = p.inventory[b];
  if (!sa || !sb) return;
  if (a === b && sa.count < 2) return;
  const recipe = Content.recipes.get(recipeKey(sa.id, sb.id));
  if (!recipe) {
    world.emit({ type: 'craft', player: p.index, a: sa.id, b: sb.id, result: null, count: 0, discovered: false });
    world.emit({ type: 'sfx', id: 'craft_fail', x: 0, y: 0 });
    return;
  }
  sa.count--;
  sb.count--;
  if (sa.count <= 0) p.inventory[a] = null;
  if (sb.count <= 0) p.inventory[b] = null;
  const key = recipeKey(sa.id, sb.id);
  const discovered = !p.knownRecipes.includes(key);
  if (discovered) {
    p.knownRecipes.push(key);
    p.runStats.recipesDiscovered++;
  }
  p.runStats.itemsCrafted++;
  addItem(p, recipe.result, recipe.count);
  world.emit({ type: 'craft', player: p.index, a: sa.id, b: sb.id, result: recipe.result, count: recipe.count, discovered });
  world.emit({ type: 'sfx', id: 'craft', x: 0, y: 0 });
}

/** PLACEHOLDER (scaffold): processes inventory commands. The items workstream completes this. */
export function commandSystem(world: World): void {
  for (const p of world.players) {
    const input = world.inputs[p.index]!;
    for (const c of input.commands) {
      if (c.type === 'craft') craft(world, p, c.a, c.b);
      else if (c.type === 'swap' && c.from.kind === 'inv' && c.to.kind === 'inv') {
        const t = p.inventory[c.to.index] ?? null;
        p.inventory[c.to.index] = p.inventory[c.from.index] ?? null;
        p.inventory[c.from.index] = t;
      }
    }
  }
}
