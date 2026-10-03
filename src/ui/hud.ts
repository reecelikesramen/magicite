import { Container } from 'pixi.js';
import type { InputManager } from '../engine/input';
import { rectContains } from '../engine/math';
import type { GameEvent, PlayerState } from '../sim/types';
import type { World } from '../sim/world';
import {
  DurabilityMemory,
  type RecipeEntry,
  type TipLine,
  craftFeedback,
  eventToast,
  itemName,
  itemTooltip,
  levelBanner,
  pickupText,
  recipeEntries,
  recipeLine,
  runSummary,
} from './format';
import { type ClickResult, type InvState, clearSelection, invClick, newInvState, padPress, sanitize, stackAt } from './interaction';
import { InventoryPanel } from './inventory';
import { type Rect, type UiTarget, hitTestButtons, hitTestInventory, navNeighbor, navTargets, targetRect } from './layout';
import { GamepadNav, UiKeys } from './nav';
import { ToastQueue } from './notify';
import { Banner, DownedOverlay, Flash, PickupFeed, RunOverScreen, ToastView } from './overlays';
import { SkillPanel, chooseSkillCommand, moveFocus, skillPanelVisible, skillTooltip } from './skillpanel';
import { UI } from './theme';
import { Tooltip } from './tooltip';
import { TopBar } from './topbar';

const OUTSIDE: UiTarget = { kind: 'outside' };

interface TipSpec {
  lines: TipLine[];
  x: number;
  y: number;
  border?: number;
  /** Right-aligned under (x, y) instead of following the cursor. */
  below?: boolean;
}

/**
 * The in-run UI: HUD (level/XP/gold, hotbar, skills, meters), inventory + crafting screen with
 * recipe book, "Select Skill Path" panel, toasts, pickup feed, level/district banners, level-up
 * flash, downed/revive overlay and the run-over summary. Drawn at native pixel scale.
 *
 * The UI never mutates the sim: every action becomes a PlayerCommand via `input.command()`.
 * Public surface used by Game: root, layout(), handleEvents(), update().
 */
export class Hud {
  readonly root = new Container();
  /** Invoked when the player presses R (or Start) on the run-over screen. Wired by the game. */
  onRestart: (() => void) | null = null;
  inventoryOpen = false;
  bookOpen = false;

  private scale = 4;
  private viewW = 320;
  private viewH = 180;
  private readonly top = new TopBar();
  private readonly inv = new InventoryPanel();
  private readonly skills = new SkillPanel();
  private readonly tooltip = new Tooltip();
  private readonly toasts = new ToastQueue(4);
  private readonly toastView = new ToastView();
  private readonly pickups = new ToastQueue(5, 2);
  private readonly pickupView = new PickupFeed();
  private readonly banner = new Banner(3.4, 0.24);
  private readonly levelUp = new Banner(1.8, 0.44);
  private readonly flash = new Flash();
  private readonly downed = new DownedOverlay();
  private readonly runOver = new RunOverScreen();
  private readonly state: InvState = newInvState();
  private readonly dur = new DurabilityMemory();
  private readonly keys = new UiKeys();
  private readonly pad = new GamepadNav();
  private readonly navList = navTargets();
  /** Rects parallel to navList for the current layout (rebuilt on resize). */
  private navRects: Rect[] = [];
  private padMode = false;
  private cursorIdx = 0;
  private skillFocus = -1;
  private skillKeyboard = false;
  private pendingSkill = '';
  private pendingSkillT = 0;
  private recipes: RecipeEntry[] = [];
  private recipesKey = -1;
  private lastWorld: World | null = null;
  private lastGold = -1;
  private lastMouse = { x: -1, y: -1 };
  private lastTime = 0;
  private t = 0;

  constructor() {
    this.root.addChild(
      this.flash,
      this.top,
      this.banner,
      this.levelUp,
      this.toastView,
      this.pickupView,
      this.downed,
      this.inv,
      this.skills,
      this.tooltip,
      this.runOver,
    );
  }

  /** Called on resize / scale change. The UI draws at native pixel scale like the world. */
  layout(screenW: number, screenH: number, scale: number): void {
    this.scale = Math.max(1, Math.floor(scale));
    this.viewW = Math.floor(screenW / this.scale);
    this.viewH = Math.floor(screenH / this.scale);
    this.root.scale.set(this.scale);
    this.top.layout(this.viewW, this.viewH);
    this.inv.layout(this.viewW, this.viewH);
    this.navRects = this.navList.map((t) => targetRect(this.inv.L, t)!);
    this.skills.layout(this.top.L.skillPanel.right, this.top.L.skillPanel.y);
  }

  handleEvents(events: readonly GameEvent[], world: World, playerIndex: number): void {
    const me = playerIndex;
    const nameOf = (i: number) => world.players[i]?.name ?? 'Someone';
    for (const ev of events) {
      const toast = eventToast(ev, me, nameOf, this.inventoryOpen);
      if (toast) this.toasts.push(toast.text, toast.color, toast.ttl);
      switch (ev.type) {
        case 'levelEnter': {
          const b = levelBanner(ev);
          this.banner.show(b.kicker, b.title, b.sub, ev.isBoss ? UI.bad : ev.isTown ? UI.good : UI.text, ev.isBoss ? UI.bad : UI.textDim);
          this.top.showDistrict(ev.name);
          clearSelection(this.state);
          break;
        }
        case 'pickup':
          // Gold is shown from wallet deltas in update() (covers pickups, selling, rewards alike).
          if (ev.player === me && ev.item !== 'gold') this.pickups.pushMerged(ev.item, ev.count, (n) => pickupText(n, ev.item), UI.text, 2.5, ev.item);
          break;
        case 'craft': {
          if (ev.player !== me) break;
          const fb = craftFeedback(ev);
          this.inv.showFeedback(fb.text, fb.color, ev.result ?? undefined);
          if (ev.discovered) this.flash.fire(UI.discover, 0.12, 0.3);
          break;
        }
        case 'levelUp':
          if (ev.player !== me) break;
          this.levelUp.show('', 'LEVEL UP!', `Lv.${ev.level}`, UI.discover, UI.text);
          this.flash.fire(UI.flash, 0.3, 0.45);
          this.top.flashLevel();
          break;
        case 'downed':
          if (ev.player === me) this.flash.fire(UI.bad, 0.35, 0.5);
          break;
        case 'runOver':
          this.showRunOver(world, me, ev.victory);
          break;
        default:
          break;
      }
    }
  }

  update(world: World, playerIndex: number, input: InputManager): void {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const dt = this.lastTime ? Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000)) : 1 / 60;
    this.lastTime = now;
    this.t += dt;
    if (world !== this.lastWorld) this.resetForWorld(world, playerIndex);
    const p = world.players[playerIndex];
    const e = world.playerEntity(playerIndex);
    if (!p) {
      input.pointerCaptured = false;
      input.uiFocus = false;
      this.keys.endFrame();
      return;
    }
    this.pad.poll(dt);
    const mx = Math.floor(input.mouseX / this.scale);
    const my = Math.floor(input.mouseY / this.scale);
    const mouseMoved = mx !== this.lastMouse.x || my !== this.lastMouse.y;
    this.lastMouse.x = mx;
    this.lastMouse.y = my;
    let captured = false;
    let tip: TipSpec | null = null;

    // Gold popups ("+5 Gold") from wallet changes (gold pickups don't emit 'pickup').
    if (this.lastGold >= 0 && p.gold > this.lastGold) {
      this.pickups.pushMerged('gold', p.gold - this.lastGold, (n) => `+${n} Gold`, UI.gold, 2.5, 'gold');
    }
    this.lastGold = p.gold;

    if (world.run.over && !this.runOver.shown) this.showRunOver(world, playerIndex, world.run.victory);

    // --- Run over: modal --------------------------------------------------------------------
    if (this.runOver.shown) {
      this.setInventory(false);
      if (this.keys.pressed('KeyR') || this.pad.pressed('start')) this.onRestart?.();
      captured = true;
    } else {
      // --- Inventory toggle -----------------------------------------------------------------
      if (input.pressed('inventory') || this.pad.pressed('back')) this.setInventory(!this.inventoryOpen);
      else if (this.inventoryOpen && input.pressed('pause')) {
        if (this.bookOpen) this.bookOpen = false;
        else this.setInventory(false);
      }
    }

    // --- Inventory interaction ------------------------------------------------------------------
    let hover: UiTarget = OUTSIDE;
    let cursor: UiTarget | null = null;
    if (this.inventoryOpen) {
      sanitize(this.state, p);
      if (this.pad.anyPressed()) this.padMode = true;
      else if (mouseMoved || input.mousePressed(0) || input.mousePressed(2)) this.padMode = false;
      hover = this.padMode ? OUTSIDE : hitTestInventory(this.inv.L, mx, my, this.bookOpen);
      // The skill-path panel floats outside the inventory: clicks there must not count as
      // "outside" (which would drop the held item) — the skill section handles them.
      const overSkills = !this.padMode && hover.kind === 'outside' && skillPanelVisible(p) && !this.bookOpen && rectContains(this.skills.L.panel, mx, my);
      if (this.padMode) {
        cursor = this.updatePadCursor(p, input);
      } else if (!overSkills) {
        const shift = input.held('craftMod') || this.keys.clickShift;
        if (input.mousePressed(0)) this.apply(invClick(this.state, p, hover, 'primary', shift), input);
        if (input.mousePressed(2)) this.apply(invClick(this.state, p, hover, 'secondary', shift), input);
      }
      captured ||= hover.kind !== 'outside' || !!this.state.held;
      tip = this.inventoryTip(p, cursor ?? hover, cursor !== null, mx, my);
    }

    // --- Skill path selection -------------------------------------------------------------------
    const skillVisible = skillPanelVisible(p) && !this.bookOpen && !this.runOver.shown;
    let skillHover = -1;
    if (skillVisible) {
      const L = this.skills.L;
      skillHover = this.padMode && this.inventoryOpen ? -1 : hitTestButtons(L.buttons, mx, my);
      if (rectContains(L.panel, mx, my)) captured = true;
      const offerKey = `${p.skillPicks}|${p.skillOffer.join(',')}`;
      if (this.pendingSkillT > 0) {
        this.pendingSkillT -= dt;
        if (offerKey !== this.pendingSkill) this.pendingSkillT = 0;
      }
      const choose = (i: number) => {
        if (this.pendingSkillT > 0) return;
        const c = chooseSkillCommand(p, i);
        if (!c) return;
        input.command(c);
        this.pendingSkill = offerKey;
        this.pendingSkillT = 1;
        this.skillKeyboard = false;
        this.skillFocus = -1;
      };
      if (input.mousePressed(0) && skillHover >= 0) choose(skillHover);
      const n = p.skillOffer.length;
      if (!this.inventoryOpen) {
        // Gamepad: d-pad ← ↑ → highlights offer 1/2/3, A confirms. Keyboard: Enter focuses/confirms.
        const padDir = this.pad.pressed('left') ? 0 : this.pad.pressed('up') ? 1 : this.pad.pressed('right') ? 2 : -1;
        if (padDir >= 0 && padDir < n) {
          this.skillKeyboard = true;
          this.skillFocus = padDir;
        }
        if (this.keys.pressed('Enter', 'NumpadEnter') || (this.skillKeyboard && this.pad.pressed('a'))) {
          if (!this.skillKeyboard) {
            this.skillKeyboard = true;
            this.skillFocus = Math.max(0, this.skillFocus);
          } else choose(Math.max(0, this.skillFocus));
        }
        if (this.skillKeyboard) {
          if (this.keys.pressed('ArrowLeft', 'KeyA')) this.skillFocus = moveFocus(this.skillFocus, -1, n);
          if (this.keys.pressed('ArrowRight', 'KeyD')) this.skillFocus = moveFocus(this.skillFocus, 1, n);
          if (this.keys.pressed('Escape') || this.pad.pressed('b')) this.skillKeyboard = false;
        }
      }
      const shown = skillHover >= 0 ? skillHover : this.skillKeyboard ? this.skillFocus : -1;
      const sid = p.skillOffer[shown];
      if (sid !== undefined && !tip) {
        // Anchored under the panel so it never covers the buttons or the caption.
        tip = { lines: skillTooltip(sid, p.skills[sid] ?? 0), x: L.panel.x + L.panel.w, y: L.panel.y + L.panel.h + 2, border: UI.gold, below: true };
      }
    } else {
      this.skillKeyboard = false;
      this.skillFocus = -1;
    }
    this.skills.update(p, skillHover, this.skillKeyboard ? this.skillFocus : -1, this.skillKeyboard, this.t, skillVisible);

    // --- Views ------------------------------------------------------------------------------------
    this.top.update(world, p, e, dt, this.dur, this.inventoryOpen);
    if (this.inventoryOpen) {
      if (p.knownRecipes.length !== this.recipesKey) {
        this.recipesKey = p.knownRecipes.length;
        this.recipes = recipeEntries(p.knownRecipes);
      }
      this.inv.update(p, this.state, hover, cursor, { x: mx, y: my }, dt, this.dur, this.recipes, this.bookOpen);
    } else {
      this.inv.feedbackTimer.tick(dt);
    }
    if (tip && tip.lines.length) this.tooltip.show(tip.lines, tip.x, tip.y, this.viewW, this.viewH, tip.border, tip.below ? 'below' : 'cursor');
    else this.tooltip.hide();

    this.toasts.tick(dt);
    this.pickups.tick(dt);
    const L = this.top.L;
    this.toastView.update(this.toasts, Math.floor(this.viewW / 2), this.inventoryOpen ? L.toastBottom - 10 : L.toastBottom);
    this.pickupView.update(this.pickups, L.pickups.right, L.pickups.bottom);
    this.banner.update(dt, this.viewW, this.viewH);
    this.levelUp.update(dt, this.viewW, this.viewH);
    // Being downed supersedes celebratory banners.
    if (p.downed || p.out) this.levelUp.hide();
    this.flash.update(dt, this.viewW, this.viewH);
    const noticeTop = L.party.y + Math.max(0, world.players.length - 1) * 9 + 4;
    this.downed.update(world, playerIndex, dt, this.t, this.viewW, this.viewH, noticeTop);
    this.runOver.update(this.t, this.viewW, this.viewH);

    input.pointerCaptured = captured;
    input.uiFocus = (this.inventoryOpen && this.padMode) || this.skillKeyboard || this.runOver.shown;
    this.keys.endFrame();
  }

  /** Open/close the inventory (clears picks; closing also closes the recipe book). */
  setInventory(open: boolean): void {
    if (open === this.inventoryOpen) return;
    this.inventoryOpen = open;
    this.inv.visible = open;
    clearSelection(this.state);
    if (!open) {
      this.bookOpen = false;
      this.padMode = false;
    }
  }

  private resetForWorld(world: World, me: number): void {
    this.lastWorld = world;
    this.runOver.hide();
    this.setInventory(false);
    clearSelection(this.state);
    this.toasts.clear();
    this.pickups.clear();
    this.recipesKey = -1;
    this.lastGold = world.players[me]?.gold ?? -1;
  }

  private showRunOver(world: World, me: number, victory: boolean): void {
    const p = world.players[me];
    if (!p) return;
    this.runOver.show(victory, p.name, runSummary(p.runStats, { level: p.level, district: world.level.info.district }));
  }

  private apply(r: ClickResult & { close?: boolean }, input: InputManager): void {
    for (const c of r.commands) input.command(c);
    if (r.feedback) this.inv.showFeedback(r.feedback.text, r.feedback.tone === 'bad' ? UI.bad : UI.textDim);
    switch (r.ui) {
      case 'toggleBook':
        this.bookOpen = !this.bookOpen;
        break;
      case 'closeBook':
        this.bookOpen = false;
        break;
      case 'pagePrev':
        this.inv.book.page = Math.max(0, this.inv.book.page - 1);
        break;
      case 'pageNext':
        this.inv.book.page++;
        break;
      default:
        break;
    }
    if (r.close) this.setInventory(false);
  }

  private updatePadCursor(p: PlayerState, input: InputManager): UiTarget {
    if (this.navRects.length !== this.navList.length) this.navRects = this.navList.map((t) => targetRect(this.inv.L, t)!);
    const rects = this.navRects;
    const pad = this.pad;
    // Shoulder buttons page the recipe book.
    if (this.bookOpen && pad.pressed('lb')) this.apply({ commands: [], ui: 'pagePrev' }, input);
    if (this.bookOpen && pad.pressed('rb')) this.apply({ commands: [], ui: 'pageNext' }, input);
    if (pad.pressed('up')) this.cursorIdx = navNeighbor(rects, this.cursorIdx, 0, -1);
    if (pad.pressed('down')) this.cursorIdx = navNeighbor(rects, this.cursorIdx, 0, 1);
    if (pad.pressed('left')) this.cursorIdx = navNeighbor(rects, this.cursorIdx, -1, 0);
    if (pad.pressed('right')) this.cursorIdx = navNeighbor(rects, this.cursorIdx, 1, 0);
    const target = this.navList[this.cursorIdx]!;
    if (pad.pressed('a')) this.apply(padPress(this.state, p, target, 'a'), input);
    if (pad.pressed('x')) this.apply(padPress(this.state, p, target, 'x'), input);
    if (pad.pressed('y')) this.apply(padPress(this.state, p, target, 'y'), input);
    if (pad.pressed('b')) this.apply(padPress(this.state, p, target, 'b'), input);
    return target;
  }

  private inventoryTip(p: PlayerState, t: UiTarget, fromPad: boolean, mx: number, my: number): TipSpec | null {
    const anchor = (): { x: number; y: number } => {
      const r = targetRect(this.inv.L, t);
      return fromPad && r ? { x: r.x + r.w, y: r.y + r.h } : { x: mx, y: my };
    };
    if ((t.kind === 'inv' || t.kind === 'equip') && !this.state.held) {
      const ref = t.kind === 'inv' ? ({ kind: 'inv', index: t.index } as const) : ({ kind: 'equip', slot: t.slot } as const);
      const st = stackAt(p, ref);
      if (!st) return null;
      const lines = itemTooltip(st.id, st, { seenMaxDurability: this.dur.seenMax(st.id) });
      if (this.state.craftFirst >= 0 && t.kind === 'inv') {
        const first = p.inventory[this.state.craftFirst];
        if (first) lines.push({ text: `Shift+click: ${itemName(first.id)} + ${itemName(st.id)}`, color: UI.craftPick });
      }
      return { lines, ...anchor() };
    }
    if (t.kind === 'button') {
      // The open book sits where the button tooltip would go; its own title says enough.
      const text = t.id === 'recipes' ? (this.bookOpen ? '' : 'Recipe book') : t.id === 'sort' ? 'Sort backpack' : '';
      return text ? { lines: [{ text, color: UI.text }], ...anchor() } : null;
    }
    if (t.kind === 'book') {
      const e = this.inv.book.entryAt(this.recipes, t.row);
      if (!e) return null;
      // The row already reads "A + B = C"; the tooltip describes what C is.
      const lines: TipLine[] = e.result === '?' ? [{ text: recipeLine(e), color: UI.text }] : itemTooltip(e.result, null, { noHint: true });
      if (e.station) lines.push({ text: e.station === 'campfire' ? 'Needs a campfire nearby' : 'Needs a forge (town)', color: UI.warn });
      return { lines, x: mx, y: my };
    }
    return null;
  }
}
