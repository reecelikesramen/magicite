import { ITEMS } from './items';
import type { RecipeDef } from './types';

/**
 * Two-item recipes (GDD §7). Unordered pairs; `a === b` means "two of the same" (two stacks, or one
 * stack of ≥ 2). Material/ammo results (and items tagged `batch`) craft in batches: min(A,B) × count
 * (a stack with itself: floor(n/2) × count). Everything else crafts one at a time.
 *
 * Idioms (keep consistent):
 *  - wood+wood=plank · wood+stone=stick · stick+stick=shaft · stone+stone=cut_stone
 *  - fiber+fiber=string · string+string=fabric · hide+hide=leather · <thing>+string = charm/necklace
 *  - <M>+<M>=<M>_blade · <M>+plank=<M>_axe_head · <M>+stone=<M>_pick_head · <blade>+<blade>=great blade
 *  - <head>+stick=<tool> (sword, axe, pickaxe, greatsword) · <blade>+shaft=spear · <edge>+leather=dagger
 *  - <bow>+<next metal>=better bow · <wand>+gold_bar=staff · <staff>+grimoire=tome
 *  - <bar or gem>+leather_cap/leather_tunic = metal helm/chestplate (forge) · stick+<metal>=arrows ×5
 *  - food at a campfire, smelting and metal armour at a town forge.
 */
const NAMES = new Map(ITEMS.map((i) => [i.id, i.name]));
const nameOf = (id: string): string => NAMES.get(id) ?? id;

function r(a: string, b: string, result: string, count = 1, opts: { station?: 'campfire' | 'forge'; hint?: string } = {}): RecipeDef {
  const where = opts.station === 'campfire' ? ' (at a campfire)' : opts.station === 'forge' ? ' (at a town forge)' : '';
  return { a, b, result, count, hint: opts.hint ?? `${nameOf(a)} + ${nameOf(b)}${where}`, ...(opts.station ? { station: opts.station } : {}) };
}
const forge = { station: 'forge' as const };
const camp = { station: 'campfire' as const };

/** <M> blade / axe head / pick head / great blade / sword / axe / pick / greatsword / spear / dagger. */
function metalLine(m: string, prefix: string, opts: { tools: boolean; spear: boolean; dagger: boolean }): RecipeDef[] {
  const out: RecipeDef[] = [
    r(m, m, `${prefix}_blade`),
    r(`${prefix}_blade`, `${prefix}_blade`, `${prefix}_great_blade`),
    r(`${prefix}_blade`, 'stick', `${prefix}_sword`),
    r(`${prefix}_great_blade`, 'stick', `${prefix}_greatsword`),
  ];
  if (opts.tools) {
    out.push(
      r(m, 'plank', `${prefix}_axe_head`),
      r(m, 'stone', `${prefix}_pick_head`),
      r(`${prefix}_axe_head`, 'stick', `${prefix}_axe`),
      r(`${prefix}_pick_head`, 'stick', `${prefix}_pickaxe`),
    );
  }
  if (opts.spear) out.push(r(`${prefix}_blade`, 'shaft', `${prefix}_spear`));
  if (opts.dagger) out.push(r(m, 'leather', `${prefix}_dagger`));
  return out;
}

export const RECIPES: RecipeDef[] = [
  // --- Basics ------------------------------------------------------------------------------------
  r('wood', 'wood', 'plank', 1, { hint: 'Wood + Wood. The first thing every delver learns.' }),
  r('wood', 'stone', 'stick', 2, { hint: 'Whittle wood with a stone.' }),
  r('stick', 'stick', 'shaft', 1, { hint: 'Two sticks, end to end.' }),
  r('stone', 'stone', 'cut_stone'),
  r('fiber', 'fiber', 'string', 1, { hint: 'Twist two fibers together.' }),
  r('string', 'string', 'fabric'),
  r('silk', 'silk', 'fabric'),
  r('hide', 'hide', 'leather', 1, { hint: 'Tan two hides together.' }),
  r('fiber', 'stone', 'flour', 1, { hint: 'Grind grass seed under a stone.' }),
  r('coal', 'flint', 'blackpowder', 2),
  r('bog_moss', 'slime_gel', 'bogscale'),
  r('frost_crystal', 'fabric', 'frostweave'),
  r('ember_core', 'magma_scale', 'emberplate', 1, forge),
  r('fabric', 'diamond', 'grimoire'),

  // --- Magic gems --------------------------------------------------------------------------------
  r('firefly', 'firefly', 'fire_gem', 1, { hint: 'Two fireflies burn brighter than one.' }),
  r('glow_moth', 'glow_moth', 'frost_gem'),
  r('stag_beetle', 'stag_beetle', 'storm_gem'),
  r('amethyst_shard', 'amethyst_shard', 'arcane_gem'),

  // --- Smelting (town forge) ---------------------------------------------------------------------
  r('iron_ore', 'iron_ore', 'iron_bar', 1, { ...forge, hint: 'Smelt two iron ores at a town forge.' }),
  r('iron_ore', 'coal', 'iron_bar', 1, { ...forge, hint: 'Ore + Coal smelts more efficiently.' }),
  r('gold_ore', 'gold_ore', 'gold_bar', 1, forge),
  r('gold_ore', 'coal', 'gold_bar', 1, forge),

  // --- Wood & stone tools and weapons -------------------------------------------------------------
  r('plank', 'plank', 'wooden_blade'),
  r('plank', 'wood', 'wooden_axe_head'),
  r('plank', 'stick', 'wooden_pick_head'),
  r('wooden_blade', 'stick', 'wooden_sword', 1, { hint: 'Head + Stick = tool. A blade is a head too.' }),
  r('wooden_axe_head', 'stick', 'wooden_axe'),
  r('wooden_pick_head', 'stick', 'wooden_pickaxe'),
  r('cut_stone', 'cut_stone', 'stone_blade'),
  r('cut_stone', 'plank', 'stone_axe_head'),
  r('cut_stone', 'stone', 'stone_pick_head'),
  r('stone_blade', 'stone_blade', 'stone_great_blade'),
  r('stone_blade', 'stick', 'stone_sword'),
  r('stone_great_blade', 'stick', 'stone_greatsword'),
  r('stone_axe_head', 'stick', 'stone_axe'),
  r('stone_pick_head', 'stick', 'stone_pickaxe'),
  r('flint', 'shaft', 'flint_spear'),
  r('flint', 'fiber', 'flint_dagger'),
  r('bone', 'fiber', 'bone_dagger'),
  r('bone', 'bone', 'bone_club'),
  r('shaft', 'string', 'bug_net', 1, { hint: 'A string mesh on a long shaft.' }),

  // --- Metal lines --------------------------------------------------------------------------------
  ...metalLine('iron_bar', 'iron', { tools: true, spear: true, dagger: true }),
  ...metalLine('gold_bar', 'gold', { tools: true, spear: true, dagger: true }),
  ...metalLine('diamond', 'diamond', { tools: true, spear: true, dagger: true }),
  ...metalLine('voidshard', 'voidshard', { tools: false, spear: true, dagger: false }),

  // --- Trophy legendaries --------------------------------------------------------------------------
  r('gloomjaw_fang', 'iron_sword', 'acidfang'),
  r('bogmother_heart', 'iron_spear', 'mirelance'),
  r('broodqueen_eye', 'iron_bow', 'widowbow'),
  r('frost_heart', 'frost_staff', 'rimecaller'),
  r('shardbound_core', 'gold_greatsword', 'shardbound_edge'),
  r('wyrm_heart', 'fire_tome', 'wyrmfire_tome'),

  // --- Ranged & ammo ---------------------------------------------------------------------------------
  r('stick', 'string', 'wooden_bow', 1, { hint: 'Bend a stick, string it.' }),
  r('wooden_bow', 'iron_bar', 'iron_bow', 1, { hint: 'Reinforce a bow with the next metal.' }),
  r('iron_bow', 'gold_bar', 'gold_bow'),
  r('gold_bow', 'diamond', 'diamond_bow'),
  r('iron_bow', 'plank', 'iron_crossbow', 1, { hint: 'Mount an iron bow on a plank stock.' }),
  r('iron_crossbow', 'gold_bar', 'gold_crossbow'),
  r('gold_crossbow', 'diamond', 'diamond_crossbow'),
  r('hide', 'string', 'sling'),
  r('stick', 'flint', 'arrow', 5, { hint: 'Stick + Flint makes a bundle of arrows.' }),
  r('stick', 'feather', 'arrow', 3),
  r('arrow', 'coal', 'fire_arrow'),
  r('arrow', 'frost_crystal', 'frost_arrow'),
  r('stick', 'iron_bar', 'iron_arrow', 5),
  r('stick', 'gold_bar', 'gold_arrow', 5),
  r('stick', 'diamond', 'diamond_arrow', 5),
  r('shaft', 'iron_bar', 'bolt', 4),
  r('shaft', 'gold_bar', 'gold_bolt', 4),
  r('shaft', 'diamond', 'diamond_bolt', 4),

  // --- Magic -------------------------------------------------------------------------------------------
  r('stick', 'glowcap', 'spark_wand', 1, { hint: 'A glowing mushroom on a stick. Why not?' }),
  r('fire_gem', 'stick', 'fire_wand', 1, { hint: 'Gem + Stick = wand.' }),
  r('frost_gem', 'stick', 'frost_wand'),
  r('storm_gem', 'stick', 'storm_wand'),
  r('arcane_gem', 'stick', 'arcane_wand'),
  r('fire_wand', 'gold_bar', 'fire_staff', 1, { hint: 'Wand + Gold Bar = staff.' }),
  r('frost_wand', 'gold_bar', 'frost_staff'),
  r('storm_wand', 'gold_bar', 'storm_staff'),
  r('arcane_wand', 'gold_bar', 'arcane_staff'),
  r('fire_staff', 'grimoire', 'fire_tome', 1, { hint: 'Staff + Grimoire = tome.' }),
  r('frost_staff', 'grimoire', 'frost_tome'),
  r('storm_staff', 'grimoire', 'storm_tome'),
  r('arcane_staff', 'grimoire', 'arcane_tome'),
  r('arcane_staff', 'voidshard', 'void_staff'),

  // --- Thrown --------------------------------------------------------------------------------------------
  r('blackpowder', 'string', 'bomb', 1, { hint: 'Blast powder with a string fuse.' }),
  r('bomb', 'slime_gel', 'sticky_bomb'),
  r('bomb', 'bomb', 'mega_bomb'),
  r('iron_bar', 'feather', 'throwing_knife', 4),
  r('throwing_knife', 'venom_sac', 'venom_knife'),

  // --- Armour & shields -----------------------------------------------------------------------------------
  r('leather', 'string', 'leather_cap'),
  r('leather', 'leather', 'leather_tunic'),
  r('fabric', 'string', 'cloth_hood'),
  r('fabric', 'fabric', 'cloth_robe'),
  r('iron_bar', 'leather_cap', 'iron_helm', 1, { ...forge, hint: 'Rivet metal onto leather at a forge.' }),
  r('iron_bar', 'leather_tunic', 'iron_chestplate', 1, forge),
  r('gold_bar', 'leather_cap', 'gold_helm', 1, forge),
  r('gold_bar', 'leather_tunic', 'gold_chestplate', 1, forge),
  r('diamond', 'leather_cap', 'diamond_helm', 1, forge),
  r('diamond', 'leather_tunic', 'diamond_chestplate', 1, forge),
  r('voidshard', 'leather_cap', 'voidshard_helm', 1, forge),
  r('voidshard', 'leather_tunic', 'voidshard_plate', 1, forge),
  r('bogscale', 'leather_cap', 'bogscale_hood'),
  r('bogscale', 'leather_tunic', 'bogscale_vest'),
  r('frostweave', 'cloth_hood', 'frostweave_hood'),
  r('frostweave', 'cloth_robe', 'frostweave_robe'),
  r('emberplate', 'iron_helm', 'emberplate_helm', 1, forge),
  r('emberplate', 'iron_chestplate', 'emberplate_armor', 1, forge),
  r('arcane_gem', 'gold_helm', 'amethyst_circlet', 1, forge),
  r('arcane_gem', 'gold_chestplate', 'amethyst_mail', 1, forge),
  r('plank', 'leather', 'buckler'),
  r('buckler', 'iron_bar', 'iron_shield', 1, forge),
  r('iron_shield', 'gold_bar', 'gold_shield', 1, forge),
  r('gold_shield', 'diamond', 'diamond_shield', 1, forge),

  // --- Accessories -----------------------------------------------------------------------------------------
  r('fang', 'string', 'fang_necklace', 1, { hint: 'Hang a trophy on a string.' }),
  r('beetle_shell', 'string', 'shell_amulet'),
  r('bog_moss', 'string', 'bog_amulet'),
  r('frost_crystal', 'string', 'frost_amulet'),
  r('ember_core', 'string', 'ember_amulet'),
  r('gold_bar', 'fire_gem', 'ring_of_might', 1, { hint: 'Set something special in gold.' }),
  r('gold_bar', 'frost_gem', 'ring_of_focus'),
  r('gold_bar', 'feather', 'ring_of_aim'),
  r('gold_bar', 'beetle_shell', 'ring_of_vigor'),
  r('gold_bar', 'bat_wing', 'ring_of_haste'),
  r('gold_bar', 'storm_gem', 'ring_of_precision'),
  r('gold_bar', 'diamond', 'ring_of_fortune'),
  r('ring_of_might', 'ember_core', 'ring_of_fury'),
  r('ring_of_fortune', 'voidshard', 'ring_of_balance'),
  r('feather', 'string', 'feather_charm'),
  r('firefly', 'string', 'glow_charm'),
  r('bat_wing', 'string', 'wing_charm'),
  r('wisp_essence', 'string', 'wisp_charm'),
  r('gold_ore', 'string', 'lucky_charm'),

  // --- Cooking (campfire) ------------------------------------------------------------------------------------
  r('raw_meat', 'raw_meat', 'cooked_meat', 2, { ...camp, hint: 'Cook raw meat at a campfire.' }),
  r('raw_meat', 'wood', 'cooked_meat', 1, camp),
  r('flour', 'flour', 'bread', 1, camp),
  r('cooked_meat', 'herb', 'hearty_stew', 1, camp),
  r('bread', 'berry', 'berry_pie', 1, camp),
  r('egg', 'herb', 'omelette', 1, camp),

  // --- Brewing ---------------------------------------------------------------------------------------------------
  r('herb', 'slime_gel', 'healing_salve'),
  r('herb', 'herb', 'health_potion', 1, { hint: 'Steep two herbs.' }),
  r('health_potion', 'health_potion', 'greater_health_potion'),
  r('glowcap', 'glowcap', 'mana_potion'),
  r('mana_potion', 'mana_potion', 'greater_mana_potion'),
  r('herb', 'glowcap', 'mystery_potion', 1, { hint: 'Herb + Glowcap. What could go wrong?' }),
  r('berry', 'glowcap', 'stamina_tonic'),
  r('herb', 'venom_sac', 'antidote'),
  r('greater_health_potion', 'greater_mana_potion', 'phoenix_draught'),
  r('greater_health_potion', 'diamond', 'elixir_of_vigor'),
  r('greater_health_potion', 'ember_core', 'elixir_of_might'),
  r('stamina_tonic', 'diamond', 'elixir_of_finesse'),
  r('greater_mana_potion', 'arcane_gem', 'elixir_of_wisdom'),
  r('mystery_potion', 'voidshard', 'elixir_of_fortune'),

  // --- Placeables & misc -------------------------------------------------------------------------------------------
  r('stick', 'coal', 'torch', 4, { hint: 'Coal on a stick lights the way.' }),
  r('stick', 'slime_gel', 'torch', 2),
  r('torch', 'iron_bar', 'lantern', 2),
  r('wood', 'flint', 'campfire', 1, { hint: 'Strike flint over wood.' }),
  r('plank', 'fiber', 'platform_kit', 4),
  r('shaft', 'fiber', 'ladder_kit', 3),
  r('iron_bar', 'string', 'repair_kit'),
];
