import type { RaceDef } from './types';

export const RACES: RaceDef[] = [
  {
    id: 'human', name: 'Human', description: 'Balanced and adaptable.', sprite: 'player_human', unlockedByDefault: true,
    base: { maxHp: 5, maxMana: 3, maxHunger: 8, maxStamina: 5, atk: 1, dex: 1, mag: 1 },
    startItems: [{ item: 'axe', count: 1 }, { item: 'meat', count: 2 }],
  },
];
