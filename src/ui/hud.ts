import { Container, Text } from 'pixi.js';
import type { InputManager } from '../engine/input';
import type { GameEvent } from '../sim/types';
import type { World } from '../sim/world';

/** PLACEHOLDER HUD (scaffold). The UI workstream replaces this with the pixel-font HUD. */
export class Hud {
  readonly root = new Container();
  private text = new Text({ text: '', style: { fill: 0xffffff, fontSize: 14, fontFamily: 'monospace' } });

  constructor() {
    this.root.addChild(this.text);
    this.text.position.set(8, 8);
  }

  /** Called on resize / scale change. The UI draws at native pixel scale like the world. */
  layout(_screenW: number, _screenH: number, scale: number): void {
    this.root.scale.set(Math.max(1, scale / 2));
  }

  handleEvents(_events: readonly GameEvent[], _world: World, _playerIndex: number): void {}

  update(world: World, playerIndex: number, _input: InputManager): void {
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
