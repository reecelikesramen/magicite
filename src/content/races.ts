import type { RaceDef } from './types';

export const RACES: RaceDef[] = [
  {
    id: 'drifter', name: 'Drifter', description: 'Hardy wanderers of the Undervault.', sprite: 'player_drifter', unlockedByDefault: true,
    mods: { maxHp: 1 },
    startItems: [{ item: 'axe', count: 1 }, { item: 'meat', count: 2 }],
  },
];
