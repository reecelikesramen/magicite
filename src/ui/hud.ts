import { Container, Text } from 'pixi.js';
import type { World } from '../sim/world';

/** PLACEHOLDER HUD (scaffold). The UI workstream replaces this with the pixel-font HUD. */
export class Hud {
  readonly root = new Container();
  private text = new Text({ text: '', style: { fill: 0xffffff, fontSize: 14, fontFamily: 'monospace' } });

  constructor() {
    this.root.addChild(this.text);
    this.text.position.set(8, 8);
  }

  update(world: World, playerIndex: number): void {
    const p = world.players[playerIndex];
    const e = world.playerEntity(playerIndex);
    if (!p || !e) return;
    const inv = p.inventory
      .slice(0, 5)
      .map((s, i) => `${i === p.selected ? '>' : ' '}${s ? `${s.id}x${s.count}` : '-'}`)
      .join(' ');
    this.text.text = `${world.level.info.name}\nLv.${p.level} XP ${p.xp}/${p.xpToNext}  Gold ${p.gold}\nHP ${e.hp}/${e.maxHp}  MP ${p.mana}/${p.stats.maxMana}  Food ${p.hunger}/${p.stats.maxHunger}\n${inv}`;
  }
}
