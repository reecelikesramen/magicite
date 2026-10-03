import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { Content } from '../content';
import type { EquipSlot } from '../content/types';
import { PixelText, measureText } from '../render/pixelfont';
import { HOTBAR_SIZE } from '../sim/constants';
import type { PlayerState } from '../sim/types';
import { type DurabilityMemory, type RecipeEntry, fitText, fraction } from './format';
import { ghostIcon, hudIcon, itemIcon } from './icons';
import { type InvState, sameRef, slotAccepts, stackAt } from './interaction';
import { EQUIP_SLOTS, ICON, type InvLayout, type UiTarget, inventoryLayout, targetRect } from './layout';
import { Timed } from './notify';
import { RecipeBook } from './recipebook';
import { UI } from './theme';
import { IconButton, SlotView, frame, panel } from './widgets';

const TIP = 'SHIFT + CLICK TWO ITEMS TO CRAFT';
/** The same line while the gamepad cursor drives the panel (X craft-picks, Y uses/equips). */
export const PAD_TIP = 'A MOVE  X CRAFT PICK  Y USE  B BACK';

/** Horizontal pitch of the two stat columns on the character card. */
const statPitch = (cardW: number): number => Math.floor((cardW - 6) / 2) + 1;

interface CardTexts {
  name: PixelText;
  lv: PixelText;
  labels: PixelText[];
  values: PixelText[];
  food: PixelText;
  foodIcon: Sprite;
}

const STAT_ROWS: [string, keyof PlayerState['stats']][] = [
  ['HP', 'maxHp'],
  ['ATK', 'atk'],
  ['DEX', 'dex'],
  ['MAG', 'mag'],
  ['LCK', 'lck'],
  ['DEF', 'def'],
];

/**
 * Inventory / character screen: hotbar row, equipment columns with ghost silhouettes, the
 * character card, 5×3 backpack, recipe book + sort buttons, craft feedback and the tip line.
 * Pure view: interaction logic lives in interaction.ts and is driven by the Hud.
 */
export class InventoryPanel extends Container {
  L: InvLayout = inventoryLayout(320, 180);
  readonly book = new RecipeBook();
  private bg = new Graphics();
  private cardBg = new Graphics();
  private inv: SlotView[] = [];
  private equip = {} as Record<EquipSlot, SlotView>;
  private card: CardTexts;
  private btnRecipes: IconButton | null = null;
  private btnSort: IconButton | null = null;
  private tip = new PixelText(TIP, { color: UI.textDim });
  private feedback = new PixelText('');
  private feedbackIcon = new Sprite(Texture.EMPTY);
  readonly feedbackTimer = new Timed(2.8);
  private held = new Sprite(Texture.EMPTY);
  private padCursor = new Graphics();
  private slotLayer = new Container();
  private cardKey = '';
  private pulse = 0;

  constructor() {
    super();
    this.card = {
      name: new PixelText('', { color: UI.gold, shadow: false }),
      lv: new PixelText('', { color: UI.textDim, shadow: false }),
      labels: STAT_ROWS.map(([l]) => new PixelText(l, { color: UI.textMuted, shadow: false })),
      values: STAT_ROWS.map(() => new PixelText('', { shadow: false })),
      food: new PixelText('', { shadow: false }),
      foodIcon: new Sprite(hudIcon('drumstick')),
    };
    const c = this.card;
    this.addChild(this.bg, this.cardBg, this.slotLayer, c.name, c.lv, ...c.labels, ...c.values, c.food, c.foodIcon);
    this.addChild(this.tip, this.feedback, this.feedbackIcon, this.book, this.padCursor, this.held);
    this.held.alpha = 0.9;
    this.visible = false;
  }

  layout(viewW: number, viewH: number): void {
    const L = (this.L = inventoryLayout(viewW, viewH));
    const g = this.bg;
    g.clear();
    panel(g, L.panel);
    // Divider lines between the three bands.
    g.rect(L.panel.x + 2, L.card.y - 3, L.panel.w - 4, 1).fill({ color: UI.panelBorder, alpha: 0.6 });
    g.rect(L.panel.x + 2, L.backpack[0]!.y - 3, L.panel.w - 4, 1).fill({ color: UI.panelBorder, alpha: 0.6 });
    const cg = this.cardBg;
    cg.clear();
    cg.rect(L.card.x, L.card.y, L.card.w, L.card.h).fill({ color: 0x1a130e, alpha: 0.9 });
    frame(cg, L.card.x, L.card.y, L.card.w, L.card.h, UI.panelBorder);

    if (!this.inv.length) {
      for (let i = 0; i < L.hotbar.length + L.backpack.length; i++) {
        const s = new SlotView(i < HOTBAR_SIZE ? L.hotbar[i]! : L.backpack[i - HOTBAR_SIZE]!);
        this.inv.push(s);
        this.slotLayer.addChild(s);
      }
      for (const slot of EQUIP_SLOTS) {
        const s = new SlotView(L.equip[slot], ghostIcon(slot));
        this.equip[slot] = s;
        this.slotLayer.addChild(s);
      }
    }
    this.inv.forEach((s, i) => {
      const r = i < HOTBAR_SIZE ? L.hotbar[i]! : L.backpack[i - HOTBAR_SIZE]!;
      s.position.set(r.x, r.y);
    });
    for (const slot of EQUIP_SLOTS) this.equip[slot].position.set(L.equip[slot].x, L.equip[slot].y);

    this.btnRecipes?.destroy();
    this.btnSort?.destroy();
    this.btnRecipes = new IconButton(L.buttons.recipes, UI.buttonRecipe, hudIcon('bulb'));
    this.btnSort = new IconButton(L.buttons.sort, UI.buttonSort, hudIcon('sort'));
    this.addChildAt(this.btnRecipes, this.getChildIndex(this.slotLayer) + 1);
    this.addChildAt(this.btnSort, this.getChildIndex(this.slotLayer) + 1);

    const c = this.card;
    const cx = L.card.x;
    const cy = L.card.y;
    c.name.position.set(cx + 3, cy + 3);
    c.lv.position.set(cx + 3, cy + 12);
    STAT_ROWS.forEach((_, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      c.labels[i]!.position.set(cx + 3 + col * statPitch(L.card.w), cy + 22 + row * 9);
    });
    c.foodIcon.position.set(cx + 3, cy + L.card.h - 9);
    c.food.position.set(cx + 12, cy + L.card.h - 9);
    this.tip.position.set(L.tip.x, L.tip.y);
    this.book.layout(L.book);
    this.cardKey = '';
  }

  showFeedback(text: string, color: number, icon?: string): void {
    this.feedback.text = text;
    this.feedback.color = color;
    this.feedbackIcon.texture = icon ? itemIcon(icon) : Texture.EMPTY;
    this.feedbackIcon.visible = !!icon;
    this.feedbackTimer.start();
  }

  update(
    p: PlayerState,
    s: InvState,
    hover: UiTarget,
    cursor: UiTarget | null,
    mouse: { x: number; y: number },
    dt: number,
    dur: DurabilityMemory,
    recipes: readonly RecipeEntry[],
    bookOpen: boolean,
  ): void {
    const L = this.L;
    this.pulse += dt;
    this.tip.text = cursor ? PAD_TIP : TIP;
    const heldStack = s.held ? stackAt(p, s.held) : null;
    const heldDef = heldStack ? Content.items.get(heldStack.id) : undefined;
    const focus = cursor ?? hover;
    for (let i = 0; i < this.inv.length; i++) {
      const v = this.inv[i]!;
      const st = p.inventory[i] ?? null;
      v.setItem(st, dur.frac(st));
      v.pulse = this.pulse;
      v.setFlags({
        hover: focus.kind === 'inv' && focus.index === i,
        selected: i === p.selected,
        craftPick: s.craftFirst === i,
        held: !!s.held && s.held.kind === 'inv' && s.held.index === i,
      });
    }
    for (const slot of EQUIP_SLOTS) {
      const v = this.equip[slot];
      const st = p.equipment[slot] ?? null;
      v.setItem(st, dur.frac(st));
      const isHover = focus.kind === 'equip' && focus.slot === slot;
      v.setFlags({
        hover: isHover,
        held: sameRef(s.held, { kind: 'equip', slot }),
        invalid: isHover && !!heldStack && !sameRef(s.held, { kind: 'equip', slot }) && !slotAccepts(slot, heldDef),
      });
    }
    this.btnRecipes?.setHover(focus.kind === 'button' && focus.id === 'recipes', bookOpen);
    this.btnSort?.setHover(focus.kind === 'button' && focus.id === 'sort', false);
    this.updateCard(p);

    // Craft feedback line under the panel.
    this.feedbackTimer.tick(dt);
    const fa = this.feedbackTimer.alpha(0.08, 0.6);
    this.feedback.visible = this.feedbackIcon.visible = fa > 0;
    if (fa > 0) {
      const hasIcon = this.feedbackIcon.texture !== Texture.EMPTY;
      this.feedbackIcon.position.set(L.feedback.x, L.feedback.y - 2);
      this.feedback.position.set(L.feedback.x + (hasIcon ? ICON + 3 : 0), L.feedback.y);
      this.feedback.alpha = this.feedbackIcon.alpha = fa;
      this.feedbackIcon.visible = hasIcon;
    }

    this.book.visible = bookOpen;
    if (bookOpen) this.book.update(recipes, hover.kind === 'book' ? hover.row : -1, hover.kind === 'button' ? hover.id : '');

    // Held item follows the mouse (or sits on the gamepad cursor).
    this.held.visible = !!heldStack;
    if (heldStack) {
      this.held.texture = itemIcon(heldStack.id);
      const cr = cursor ? targetRect(L, cursor) : null;
      if (cr) this.held.position.set(cr.x + 6, cr.y - 4);
      else this.held.position.set(Math.round(mouse.x - ICON / 2), Math.round(mouse.y - ICON / 2));
    }
    const g = this.padCursor;
    g.clear();
    const cr = cursor ? targetRect(L, cursor) : null;
    if (cr) {
      const a = 0.65 + 0.35 * Math.abs(Math.sin(this.pulse * 5));
      frame(g, cr.x - 1, cr.y - 1, cr.w + 2, cr.h + 2, 0xffffff, a);
    }
  }

  private updateCard(p: PlayerState): void {
    const race = Content.races.get(p.race)?.name ?? '';
    const key = `${p.name}|${p.level}|${race}|${STAT_ROWS.map(([, k]) => p.stats[k]).join(',')}|${p.hunger}/${p.stats.maxHunger}`;
    if (key === this.cardKey) return;
    this.cardKey = key;
    const c = this.card;
    const L = this.L;
    c.name.text = fitText(p.name.toUpperCase(), L.card.w - 6);
    // "Lv.5 Drifter"; long race names fall back to the race alone, fitted after "Lv.N".
    const lvLine = `Lv.${p.level}${race ? ` ${race}` : ''}`;
    c.lv.text = measureText(lvLine) <= L.card.w - 6 ? lvLine : `Lv.${p.level} ${fitText(race, L.card.w - 6 - measureText(`Lv.${p.level} `))}`;
    STAT_ROWS.forEach(([, k], i) => {
      const v = c.values[i]!;
      v.text = String(p.stats[k]);
      const col = i % 2;
      const row = Math.floor(i / 2);
      const pitch = statPitch(L.card.w);
      v.position.set(L.card.x + 3 + col * pitch + pitch - 4 - v.textWidth, L.card.y + 22 + row * 9);
    });
    c.food.text = fraction(p.hunger, p.stats.maxHunger);
  }
}
