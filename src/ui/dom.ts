import { ICONS, type IconName } from './icons';

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null> & { class?: string };

/** Tiny hyperscript helper. Event handlers: on<event> keys. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function icon(name: IconName): HTMLSpanElement {
  const s = document.createElement('span');
  s.style.display = 'inline-flex';
  s.innerHTML = ICONS[name];
  return s;
}

export function iconSvg(name: IconName): string {
  return ICONS[name];
}

export interface BtnOpts {
  cls?: string;
  icon?: IconName;
  label?: string;
  title?: string;
  disabled?: boolean;
  onClick: (ev: MouseEvent) => void;
  testid?: string;
}

/** Button with click debounce (prevents accidental double activation). */
export function btn(o: BtnOpts): HTMLButtonElement {
  const b = h('button', { class: `btn ${o.cls ?? ''}`, type: 'button', title: o.title ?? o.label ?? '', 'aria-label': o.title ?? o.label ?? '', 'data-testid': o.testid });
  if (o.icon) b.insertAdjacentHTML('beforeend', ICONS[o.icon]);
  if (o.label) b.append(h('span', null, o.label));
  if (o.disabled) b.disabled = true;
  let last = 0;
  b.addEventListener('click', (ev) => {
    const now = performance.now();
    if (now - last < 280) return;
    last = now;
    ev.stopPropagation();
    o.onClick(ev);
  });
  return b;
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
