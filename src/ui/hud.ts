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
  private cargoEl: HTMLSpanElement;
  private riskPill: HTMLDivElement;
  private riskEl: HTMLSpanElement;
  private multPill: HTMLDivElement;
  private multEl: HTMLSpanElement;
  private progFill: HTMLElement | null = null;
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
    this.cargoEl = h('span', { 'data-testid': 'hud-cargo' }, '0');
    this.riskEl = h('span', null, '0');
    this.multEl = h('span', null, '×1');
    const coinPill = h('div', { class: 'hud-pill' }, icon('coin'), this.coinsEl);
    const cargoPill = h('div', { class: 'hud-pill', title: 'Cargo on board and its value' }, icon('stack'), this.cargoEl);
    this.riskPill = h('div', { class: 'hud-pill risk', title: 'Unbanked cargo value: lost if you crash' }, h('span', null, 'AT RISK'), icon('coin'), this.riskEl);
    this.multPill = h('div', { class: 'hud-pill mult', title: 'Delivery multiplier: grows each depot you pass with cargo' }, this.multEl);
    const tl = h('div', { class: 'tl' }, coinPill, cargoPill);
    if (mode === 'endless' || mode === 'daily') tl.append(this.riskPill, this.multPill);
    const tc = h('div', { class: 'tc' });
    if (mode === 'endless') {
      this.distEl = h('div', { class: 'hud-dist', 'data-testid': 'hud-dist' }, '0 m');
      tc.append(this.distEl);
    } else {
      const fill = h('i');
      this.progFill = fill;
      tc.append(h('div', { class: 'progress', title: 'Route progress' }, fill, h('span', { class: 'flag' }, '🏁')));
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
    const shedWrap = h('div', { class: 'shed-btn' }, shedB, touch ? null : h('div', { class: 'hint' }, h('span', { class: 'keycap' }, 'SPACE')));
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
    const cargo = `${s.items}/${s.capacity} · ${fmt(s.value)}`;
    this.set('cargo', cargo, () => (this.cargoEl.textContent = cargo));
    if (s.atRisk !== null) this.set('risk', s.atRisk, () => (this.riskEl.textContent = fmt(s.atRisk ?? 0)));
    if (s.mult !== null) this.set('mult', s.mult, () => (this.multEl.textContent = `×${(s.mult ?? 1).toFixed(2).replace(/0$/, '').replace(/\.$/, '')}`));
    if (this.progFill && s.progress !== null) {
      const p = Math.round(s.progress * 1000) / 10;
      this.set('prog', p, () => (this.progFill!.style.width = `${p}%`));
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
