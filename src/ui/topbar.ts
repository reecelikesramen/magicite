import { Container, Graphics, Sprite } from 'pixi.js';
import { PixelText, measureText } from '../render/pixelfont';
import { TICK_RATE } from '../sim/constants';
import type { Entity, PlayerState } from '../sim/types';
import type { World } from '../sim/world';
import { type DurabilityMemory, fitText, fraction, skillInfo } from './format';
import { hudIcon, skillGlyph } from './icons';
import { type HudLayout, METER_IDS, type MeterId, SLOT, fillPx, hudLayout, meterBarWidth } from './layout';
import { MINI_H, MiniText } from './minifont';
import { Timed } from './notify';
import { UI } from './theme';
import { Bar, SlotView, frame, solid } from './widgets';

const METER_COLORS: Record<MeterId, number> = { hp: UI.hp, mana: UI.mana, hunger: UI.hunger, stamina: UI.stamina };
const METER_ICONS = { hp: 'heart', mana: 'gem', hunger: 'drumstick', stamina: 'boot' } as const;
const SKILL_KEYS = ['Z', 'X', 'C'];

/** Meter values for a player: [cur, max]. */
export function meterValues(p: PlayerState, e: Entity | undefined, id: MeterId): [number, number] {
  switch (id) {
    case 'hp':
      return [e ? e.hp : 0, e ? e.maxHp : p.stats.maxHp];
    case 'mana':
      return [p.mana, p.stats.maxMana];
    case 'hunger':
      return [p.hunger, p.stats.maxHunger];
    case 'stamina':
      return [p.stamina, p.stats.maxStamina];
  }
}

/** Fraction of a slotted skill's cooldown remaining (0 = ready). `maxSeen` covers unknown defs. */
export function cooldownFrac(cdTicks: number, cooldownSecs: number, maxSeen: number): number {
  if (cdTicks <= 0) return 0;
  const total = Math.max(cooldownSecs * TICK_RATE, maxSeen, cdTicks);
  return Math.min(1, cdTicks / total);
}

class SkillSlotView extends Container {
  private bg = new Graphics();
  private glyph = new Sprite(skillGlyph('unknown'));
  private shade = solid(0x000000, 1, 1, SLOT - 2, 0, 0.62);
  /** Z / X / C, centred under the slot in the regular font (the 3×5 Z reads like a 2). */
  private keyLabel: PixelText;
  private secs = new MiniText('', 0xffffff);
  private id = '\0';
  private maxSeen = 0;

  constructor(key: string) {
    super();
    this.glyph.position.set(2, 2);
    this.keyLabel = new PixelText(key, { color: UI.textDim });
    this.keyLabel.position.set(Math.floor((SLOT - this.keyLabel.textWidth) / 2), SLOT + 1);
    this.addChild(this.bg, this.glyph, this.shade, this.secs, this.keyLabel);
  }

  set(skillId: string | undefined, cdTicks: number): void {
    if (skillId !== this.id) {
      this.id = skillId ?? '';
      this.maxSeen = 0;
      const g = this.bg;
      g.clear();
      const info = skillId ? skillInfo(skillId) : null;
      g.rect(1, 1, SLOT - 2, SLOT - 2).fill({ color: info ? info.color : UI.slot, alpha: info ? 0.55 : UI.slotAlpha * 0.6 });
      frame(g, 0, 0, SLOT, SLOT, UI.slotEdge, 0.9);
      this.glyph.texture = skillGlyph(info?.path ?? 'unknown');
      this.glyph.visible = !!info;
      this.keyLabel.alpha = info ? 1 : 0.45;
    }
    if (!skillId) {
      this.shade.visible = false;
      this.secs.text = '';
      return;
    }
    this.maxSeen = Math.max(this.maxSeen, cdTicks);
    const f = cooldownFrac(cdTicks, skillInfo(skillId).cooldown, this.maxSeen);
    const h = Math.ceil((SLOT - 2) * f);
    this.shade.visible = h > 0;
    // Top-anchored shade = remaining cooldown; the slot "refills" from the bottom.
    this.shade.height = h;
    this.keyLabel.color = cdTicks > 0 ? UI.textMuted : UI.textDim;
    const s = cdTicks > 0 ? Math.ceil(cdTicks / TICK_RATE) : 0;
    this.secs.text = s > 0 ? String(s) : '';
    this.secs.position.set(SLOT - 1 - this.secs.textWidth - 1, SLOT - MINI_H - 1);
  }
}

interface MeterView {
  bar: Bar;
  text: PixelText;
  icon: Sprite;
  key: string;
}

interface PartyRow {
  name: PixelText;
  bar: Bar;
  state: PixelText;
  key: string;
}

/**
 * Always-visible HUD: "Lv.N", XP bar with cur/max, coin + gold, 5-slot hotbar, slotted skills
 * (Z/X/C with cooldowns), four meters top-right, district caption and a co-op party list.
 */
export class TopBar extends Container {
  L: HudLayout = hudLayout(320, 180, measureText('Lv.1'));
  readonly hotbarLayer = new Container();
  private lv = new PixelText('Lv.1');
  private xp = new Bar(UI.xpFill, UI.xpEmpty);
  private xpText = new PixelText('0/0');
  private coin = new Sprite(hudIcon('coin'));
  private gold = new PixelText('x0');
  private hotbar: SlotView[] = [];
  private skills: SkillSlotView[] = SKILL_KEYS.map((k) => new SkillSlotView(k));
  private meters = {} as Record<MeterId, MeterView>;
  private district = new PixelText('', { color: UI.district });
  readonly districtTimer = new Timed(6);
  private party = new Container();
  private partyRows: PartyRow[] = [];
  private lvFlash = 0;
  private lvKey = '';
  private xpKey = '';
  private viewW = 320;
  private viewH = 180;

  constructor() {
    super();
    for (const id of METER_IDS) {
      const m: MeterView = { bar: new Bar(METER_COLORS[id]), text: new PixelText(''), icon: new Sprite(hudIcon(METER_ICONS[id])), key: '' };
      this.meters[id] = m;
      this.addChild(m.bar, m.text, m.icon);
    }
    this.addChild(this.lv, this.xp, this.xpText, this.coin, this.gold, this.hotbarLayer, this.district, this.party);
    for (const s of this.skills) this.addChild(s);
    this.district.visible = false;
  }

  layout(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    this.relayout();
  }

  private relayout(): void {
    const L = (this.L = hudLayout(this.viewW, this.viewH, this.lv.textWidth));
    this.lv.position.set(L.lv.x, L.lv.y);
    this.coin.position.set(L.coin.x, L.coin.y);
    this.gold.position.set(L.gold.x, L.gold.y);
    if (!this.hotbar.length) {
      for (const r of L.hotbar) {
        const s = new SlotView(r);
        this.hotbar.push(s);
        this.hotbarLayer.addChild(s);
      }
    }
    L.hotbar.forEach((r, i) => this.hotbar[i]!.position.set(r.x, r.y));
    L.skillBar.forEach((r, i) => this.skills[i]!.position.set(r.x, r.y));
    for (const id of METER_IDS) {
      const ml = L.meters[id];
      this.meters[id].icon.position.set(ml.icon.x, ml.icon.y);
      this.meters[id].key = '';
    }
    this.party.position.set(L.party.x, L.party.y);
    this.xpKey = '';
  }

  /** Flash the level label (level-up). */
  flashLevel(): void {
    this.lvFlash = 1.2;
  }

  showDistrict(name: string): void {
    this.district.text = name;
    this.districtTimer.start();
  }

  update(world: World, p: PlayerState, e: Entity | undefined, dt: number, dur: DurabilityMemory, inventoryOpen: boolean): void {
    // Level + XP.
    const lvText = `Lv.${p.level}`;
    if (lvText !== this.lvKey) {
      this.lvKey = lvText;
      this.lv.text = lvText;
      this.relayout();
    }
    this.lvFlash = Math.max(0, this.lvFlash - dt);
    this.lv.color = this.lvFlash > 0 && Math.floor(this.lvFlash * 8) % 2 === 0 ? UI.discover : UI.text;
    const L = this.L;
    const xpKey = `${p.xp}/${p.xpToNext}`;
    if (xpKey !== this.xpKey) {
      this.xpKey = xpKey;
      this.xp.set(L.xpBar.x, L.xpBar.y, L.xpBar.w, L.xpBar.h, fillPx(p.xp, p.xpToNext, L.xpBar.w - 2), p.xp);
      this.xpText.text = fraction(p.xp, p.xpToNext);
      this.xpText.position.set(L.xpBar.x + Math.round((L.xpBar.w - this.xpText.textWidth) / 2), L.xpBar.y + 1);
    }
    this.xp.tick(dt);
    this.gold.text = `x${p.gold}`;

    // Hotbar (the inventory panel draws its own while open).
    this.hotbarLayer.visible = !inventoryOpen;
    if (!inventoryOpen) {
      for (let i = 0; i < this.hotbar.length; i++) {
        const st = p.inventory[i] ?? null;
        this.hotbar[i]!.setItem(st, dur.frac(st));
        this.hotbar[i]!.setFlags({ selected: i === p.selected });
      }
    }

    // Slotted skills.
    const anySkill = p.skillSlots.length > 0;
    for (let i = 0; i < this.skills.length; i++) {
      const s = this.skills[i]!;
      s.visible = anySkill;
      if (anySkill) s.set(p.skillSlots[i], p.skillCooldowns[i] ?? 0);
    }

    // Meters.
    for (const id of METER_IDS) {
      const m = this.meters[id];
      const ml = L.meters[id];
      const [cur, max] = meterValues(p, e, id);
      const key = `${Math.floor(cur)}/${Math.floor(max)}|${Math.round(cur * 8)}`;
      if (key !== m.key) {
        m.key = key;
        const w = meterBarWidth(max);
        m.bar.set(ml.barRight - w, ml.barY, w, ml.barH, fillPx(cur, max, w - 2), cur);
        m.text.text = fraction(cur, max);
        m.text.position.set(ml.textRight - m.text.textWidth, ml.textY);
      }
      m.bar.tick(dt);
    }

    // District caption.
    this.districtTimer.tick(dt);
    this.district.visible = this.districtTimer.active && !inventoryOpen;
    if (this.district.visible) {
      this.district.alpha = this.districtTimer.alpha(0.3, 1);
      this.district.position.set(L.district.right - this.district.textWidth, L.district.y);
    }

    this.updateParty(world, p.index, dt);
  }

  private updateParty(world: World, me: number, dt: number): void {
    const others = world.players.filter((q) => q.index !== me);
    this.party.visible = others.length > 0;
    while (this.partyRows.length < others.length) {
      const row: PartyRow = { name: new PixelText('', { color: UI.textDim }), bar: new Bar(UI.hp), state: new PixelText('', { color: UI.bad }), key: '' };
      this.party.addChild(row.name, row.bar, row.state);
      this.partyRows.push(row);
    }
    this.partyRows.forEach((row, i) => {
      const q = others[i];
      const vis = !!q;
      row.name.visible = row.bar.visible = row.state.visible = vis;
      if (!q) return;
      const qe = world.get(q.entityId);
      const hp = qe ? qe.hp : 0;
      const max = qe ? qe.maxHp : q.stats.maxHp;
      const y = i * 9;
      const key = `${q.name}|${hp}/${max}|${q.downed}|${q.out}`;
      if (key !== row.key) {
        row.key = key;
        row.name.text = fitText(q.name, 40);
        row.name.position.set(0, y);
        const w = meterBarWidth(max);
        row.bar.set(43, y + 2, w, 4, fillPx(hp, max, w - 2), hp);
        row.state.text = q.out ? 'OUT' : q.downed ? 'DOWN' : '';
        row.state.position.set(43 + w + 3, y);
      }
      row.bar.tick(dt);
    });
  }
}
