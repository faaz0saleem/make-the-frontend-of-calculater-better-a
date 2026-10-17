import type { RunMode } from '../sim/run';
import { btn, fmt, h, icon } from './dom';
import { ICONS } from './icons';

export interface HudState {
  coins: number;
  items: number;
  capacity: number;
  value: number;
  progress: number | null;
  distance: number | null;
  atRisk: number | null;
  mult: number | null;
  stability: number;
  lean: number; // -1..1 visual lean of the stack icon
  wind: number; // signed
  tokens: number;
}

/**
 * Driving HUD. Built once per run; `update` touches only the text/styles that changed,
 * so there is no per-frame DOM rebuilding.
 */
export class Hud {
  readonly root: HTMLDivElement;
  private coinsEl: HTMLSpanElement;
  private cargoEl: HTMLElement;
  private worthEl: HTMLSpanElement;
  private slotsEl: HTMLDivElement;
  private cargoPill: HTMLDivElement;
  private shedWrap: HTMLDivElement;
  private riskPill: HTMLDivElement;
  private riskEl: HTMLSpanElement;
  private multPill: HTMLDivElement;
  private multEl: HTMLSpanElement;
  private progFill: HTMLElement | null = null;
  private progTruck: HTMLElement | null = null;
  private distEl: HTMLDivElement | null = null;
  private stab: HTMLDivElement;
  private stabFill: HTMLElement;
  private stabIcon: HTMLElement;
  private windEl: HTMLDivElement;
  private toasts: HTMLDivElement;
  private tipEl: HTMLDivElement | null = null;
  private last: Partial<Record<string, string | number>> = {};

  constructor(parent: HTMLElement, mode: RunMode, private cb: { onPause: () => void; onShed: () => void }, touch: boolean) {
    this.coinsEl = h('span', { 'data-testid': 'hud-coins' }, '0');
    this.riskEl = h('span', null, '0');
    this.multEl = h('span', null, '×1');
    const coinPill = h('div', { class: 'hud-pill', title: 'Road coins collected this run' }, icon('coin'), this.coinsEl);
    // Cargo at a glance: "CARGO 3/8" over a row of truck slots, then what the load is worth.
    this.cargoEl = h('b', { class: 'cp-num', 'data-testid': 'hud-cargo' }, '0/0');
    this.slotsEl = h('div', { class: 'cp-slots' });
    this.worthEl = h('span', { 'data-testid': 'hud-worth' }, '0');
    const banking = mode === 'endless' || mode === 'daily';
    this.cargoPill = h('div', { class: 'hud-pill cargo-pill empty', title: 'Cargo on your truck (used / free slots) and what it pays on delivery' },
      icon('stack'),
      h('div', { class: 'cp-col' }, h('div', { class: 'cp-top' }, h('span', { class: 'cp-cap' }, 'CARGO'), this.cargoEl), this.slotsEl),
      // Long Haul / Daily show the load's value as AT RISK (with the depot bonus) instead.
      banking ? null : h('div', { class: 'cp-col cp-worth' }, h('span', { class: 'cp-cap' }, 'WORTH'), h('div', { class: 'cp-top' }, icon('coin'), this.worthEl)));
    this.riskPill = h('div', { class: 'hud-pill risk', title: 'Unbanked cargo value: lost if you crash' }, h('span', { class: 'cp-cap' }, 'AT RISK'), icon('coin'), this.riskEl);
    this.multPill = h('div', { class: 'hud-pill mult', title: 'Delivery multiplier: grows each depot you pass with cargo' }, h('span', { class: 'cp-cap' }, 'BONUS'), this.multEl);
    const tl = h('div', { class: 'tl' }, coinPill, this.cargoPill);
    if (banking) tl.append(this.riskPill, this.multPill);
    const tc = h('div', { class: 'tc' });
    if (mode === 'endless') {
      this.distEl = h('div', { class: 'hud-dist', 'data-testid': 'hud-dist' }, '0 m');
      tc.append(this.distEl);
    } else {
      const fill = h('i');
      this.progFill = fill;
      this.progTruck = h('span', { class: 'prog-truck', html: ICONS.truck });
      tc.append(h('div', { class: 'progress-wrap', title: 'Route progress to the depot' },
        h('div', { class: 'progress' }, fill), this.progTruck, h('span', { class: 'flag', html: ICONS.flag })));
      if (mode === 'daily') {
        this.distEl = h('div', { class: 'hud-dist' }, '0 m');
        tc.append(this.distEl);
      }
    }
    this.windEl = h('div', { class: 'wind-ind', style: 'display:none' }, icon('wind'), h('span', null, 'WIND'));
    tc.append(this.windEl);
    const pauseBtn = btn({ cls: 'icon ghost', icon: 'pause', title: 'Pause (P)', onClick: () => this.cb.onPause(), testid: 'btn-pause' });
    const tr = h('div', { class: 'tr' }, pauseBtn);
    this.stabFill = h('i');
    this.stabIcon = h('div', { class: 'stab-icon' });
    this.stabIcon.innerHTML = ICONS.stack;
    this.stab = h('div', { class: 'stab', title: 'Load stability' }, h('div', { class: 'stab-label' }, 'STABLE'), h('div', { class: 'stab-bar' }, this.stabFill, h('div', { class: 'ticks' })), this.stabIcon);
    let lastPointer = -1e9;
    // Keyboard activation goes through click; pointers fire on press so it works mid-swerve.
    const shedB = btn({ cls: '', icon: 'shed', label: 'SHED', title: 'Shed the top item (Space)', onClick: () => { if (performance.now() - lastPointer > 700) this.cb.onShed(); }, testid: 'btn-shed' });
    shedB.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      lastPointer = performance.now();
      this.cb.onShed();
    });
    const shedWrap = h('div', { class: 'shed-btn empty' }, shedB, touch ? null : h('div', { class: 'hint' }, h('span', { class: 'keycap' }, 'SPACE')));
    this.shedWrap = shedWrap;
    this.toasts = h('div', { class: 'toast-area' });
    this.root = h('div', { class: 'hud', 'data-testid': 'hud' }, tl, tc, tr, this.stab, shedWrap, this.toasts);
    parent.append(this.root);
  }

  private set(key: string, v: string | number, apply: () => void): void {
    if (this.last[key] === v) return;
    this.last[key] = v;
    apply();
  }

  update(s: HudState): void {
    this.set('coins', s.coins, () => (this.coinsEl.textContent = fmt(s.coins)));
    const cargo = `${s.items}/${s.capacity}`;
    this.set('cargo', cargo, () => {
      this.cargoEl.textContent = cargo;
      const slots = this.slotsEl;
      while (slots.childElementCount < s.capacity) slots.append(h('i'));
      while (slots.childElementCount > s.capacity) slots.lastElementChild?.remove();
      for (let i = 0; i < slots.childElementCount; i++) slots.children[i].className = i < s.items ? 'on' : '';
      const full = s.items >= s.capacity && s.capacity > 0;
      this.cargoPill.classList.toggle('empty', s.items === 0);
      this.cargoPill.classList.toggle('full', full);
      this.shedWrap.classList.toggle('empty', s.items === 0);
    });
    this.set('worth', s.value, () => (this.worthEl.textContent = fmt(s.value)));
    if (s.atRisk !== null) this.set('risk', s.atRisk, () => (this.riskEl.textContent = fmt(s.atRisk ?? 0)));
    if (s.mult !== null) this.set('mult', s.mult, () => (this.multEl.textContent = `×${(s.mult ?? 1).toFixed(2).replace(/0$/, '').replace(/\.$/, '')}`));
    if (this.progFill && s.progress !== null) {
      const p = Math.round(s.progress * 1000) / 10;
      this.set('prog', p, () => {
        this.progFill!.style.width = `${p}%`;
        this.progTruck!.style.left = `${p}%`;
      });
    }
    if (this.distEl && s.distance !== null) {
      const d = `${fmt(s.distance)} m`;
      this.set('dist', d, () => (this.distEl!.textContent = d));
    }
    const st = Math.round(s.stability * 100);
    this.set('stab', st, () => {
      this.stabFill.style.height = `${Math.max(4, st)}%`;
      const cls = st < 28 ? 'stab danger' : st < 55 ? 'stab warn' : 'stab';
      if (this.stab.className !== cls) this.stab.className = cls;
      const label = this.stab.firstElementChild as HTMLElement;
      const txt = st < 28 ? 'DANGER!' : st < 55 ? 'WOBBLY' : 'STABLE';
      if (label.textContent !== txt) label.textContent = txt;
    });
    const lean = Math.round(s.lean * 30);
    this.set('lean', lean, () => {
      const svg = this.stabIcon.firstElementChild as SVGElement | null;
      if (svg) svg.style.transform = `rotate(${lean}deg)`;
    });
    const w = Math.round(s.wind * 10);
    this.set('wind', w, () => {
      const show = Math.abs(s.wind) > 0.3;
      this.windEl.style.display = show ? '' : 'none';
      if (show) (this.windEl.lastElementChild as HTMLElement).textContent = s.wind > 0 ? 'WIND →' : '← WIND';
    });
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' | 'big' = 'info'): void {
    const el = h('div', { class: `toast ${kind === 'big' ? 'big good' : kind}` }, text);
    const n = this.toasts.childElementCount;
    el.style.top = `${n * 34}px`;
    this.toasts.append(el);
    setTimeout(() => el.remove(), 1300);
    while (this.toasts.childElementCount > 4) this.toasts.firstElementChild?.remove();
  }

  tip(html: string | null): void {
    if (!html) {
      this.tipEl?.remove();
      this.tipEl = null;
      return;
    }
    if (!this.tipEl) {
      this.tipEl = h('div', { class: 'tip pop-in', 'data-testid': 'tip' });
      this.root.append(this.tipEl);
    }
    this.tipEl.innerHTML = html;
  }

  destroy(): void {
    this.root.remove();
  }
}
