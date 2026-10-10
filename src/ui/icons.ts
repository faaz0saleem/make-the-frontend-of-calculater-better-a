/** Original vector icons (inline SVG, currentColor where sensible). */
const svg = (body: string, vb = '0 0 48 48') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const S = 'stroke="#24304a" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"';

export const ICONS = {
  coin: svg(`<circle cx="24" cy="24" r="19" fill="#ffc93c" ${S}/><circle cx="24" cy="24" r="12" fill="#ffe08a" stroke="#c9901a" stroke-width="3"/><path d="M24 16v16M19.5 19.5h7a3 3 0 0 1 0 6h-5a3 3 0 0 0 0 6h7.5" fill="none" stroke="#c9901a" stroke-width="3" stroke-linecap="round"/>`),
  box: svg(`<path d="M8 16l16-8 16 8v18l-16 8-16-8z" fill="#d9a86c" ${S}/><path d="M8 16l16 8 16-8M24 24v18" fill="none" ${S}/><path d="M16 12l16 8" stroke="#fff6e6" stroke-width="3.5"/>`),
  stack: svg(`<rect x="14" y="30" width="20" height="11" rx="3" fill="#ff8a65" ${S}/><rect x="16" y="19" width="16" height="11" rx="3" fill="#3cc9a7" ${S}/><rect x="18" y="8" width="12" height="11" rx="3" fill="#ffc93c" ${S}/>`),
  pause: svg(`<rect x="12" y="10" width="9" height="28" rx="3" fill="#24304a"/><rect x="27" y="10" width="9" height="28" rx="3" fill="#24304a"/>`),
  play: svg(`<path d="M15 9l24 15-24 15z" fill="#24304a" ${S}/>`),
  gear: svg(`<path d="M24 6l4 4 5-1 2 5 5 2-1 5 4 4-4 4 1 5-5 2-2 5-5-1-4 4-4-4-5 1-2-5-5-2 1-5-4-4 4-4-1-5 5-2 2-5 5 1z" fill="#fff6e6" ${S}/><circle cx="24" cy="24" r="6" fill="#ffc93c" ${S}/>`),
  garage: svg(`<path d="M6 20L24 8l18 12v20H6z" fill="#ff5a4e" ${S}/><rect x="13" y="24" width="22" height="16" rx="2" fill="#fff6e6" ${S}/><path d="M13 30h22M13 35h22" ${S}/>`),
  trophy: svg(`<path d="M15 8h18v9a9 9 0 0 1-18 0z" fill="#ffc93c" ${S}/><path d="M15 12H9a6 6 0 0 0 6 7M33 12h6a6 6 0 0 1-6 7" fill="none" ${S}/><path d="M24 26v7M17 40h14l-2-7H19z" fill="#ffc93c" ${S}/>`),
  medal: svg(`<path d="M16 6l8 12 8-12" fill="none" ${S}/><circle cx="24" cy="29" r="12" fill="currentColor" ${S}/><path d="M24 23l2 4 4 .5-3 3 .8 4-3.8-2-3.8 2 .8-4-3-3 4-.5z" fill="#fff6e6"/>`),
  album: svg(`<rect x="9" y="7" width="30" height="34" rx="4" fill="#6cb4ee" ${S}/><rect x="15" y="14" width="18" height="12" rx="2" fill="#fff6e6" ${S}/><path d="M15 32h18" ${S}/>`),
  goals: svg(`<circle cx="24" cy="24" r="17" fill="#fff6e6" ${S}/><circle cx="24" cy="24" r="10" fill="#ff5a4e" ${S}/><circle cx="24" cy="24" r="3.5" fill="#24304a"/>`),
  daily: svg(`<rect x="7" y="10" width="34" height="30" rx="5" fill="#fff6e6" ${S}/><path d="M7 19h34" ${S}/><path d="M15 6v8M33 6v8" ${S}/><path d="M17 29l5 5 9-10" fill="none" stroke="#2fb67a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),
  road: svg(`<path d="M17 42L21 6h6l4 36z" fill="#5d6573" ${S}/><path d="M24 10v6M24 22v6M24 34v6" stroke="#ffc93c" stroke-width="3" stroke-linecap="round"/>`),
  map: svg(`<path d="M6 12l12-5 12 5 12-5v29l-12 5-12-5-12 5z" fill="#ffd166" ${S}/><path d="M18 7v29M30 12v29" ${S}/><circle cx="35" cy="21" r="3" fill="#ff5a4e"/>`),
  retry: svg(`<path d="M37 18a15 15 0 1 0 2 10" fill="none" ${S}/><path d="M38 8v11H27" fill="none" ${S}/>`),
  next: svg(`<path d="M10 24h26M26 13l11 11-11 11" fill="none" ${S}/>`),
  back: svg(`<path d="M38 24H12M22 13L11 24l11 11" fill="none" ${S}/>`),
  home: svg(`<path d="M8 22L24 9l16 13v18H8z" fill="#fff6e6" ${S}/><rect x="20" y="28" width="8" height="12" fill="#ffc93c" ${S}/>`),
  lock: svg(`<rect x="11" y="21" width="26" height="20" rx="4" fill="#ffc93c" ${S}/><path d="M16 21v-5a8 8 0 0 1 16 0v5" fill="none" ${S}/>`),
  check: svg(`<path d="M10 25l9 9 19-20" fill="none" stroke="#2fb67a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`),
  soundOn: svg(`<path d="M8 18h8l10-8v28l-10-8H8z" fill="#fff6e6" ${S}/><path d="M32 17a10 10 0 0 1 0 14M36 12a17 17 0 0 1 0 24" fill="none" ${S}/>`),
  soundOff: svg(`<path d="M8 18h8l10-8v28l-10-8H8z" fill="#fff6e6" ${S}/><path d="M32 18l10 12M42 18L32 30" ${S}/>`),
  warn: svg(`<path d="M24 6l19 34H5z" fill="#ffc93c" ${S}/><path d="M24 18v10" ${S}/><circle cx="24" cy="34" r="2.5" fill="#24304a"/>`),
  wind: svg(`<path d="M6 18h22a5 5 0 1 0-5-5M6 26h30a5 5 0 1 1-5 5M6 34h14" fill="none" ${S}/>`),
  tire: svg(`<circle cx="24" cy="24" r="17" fill="#3a3f4a" ${S}/><circle cx="24" cy="24" r="8" fill="#d9dde4" ${S}/>`),
  shed: svg(`<rect x="15" y="25" width="18" height="14" rx="3" fill="#fff6e6" ${S}/><rect x="21" y="6" width="14" height="12" rx="3" fill="#ffc93c" ${S} transform="rotate(18 28 12)"/><path d="M12 20c-3-4-2-9 2-11" fill="none" ${S}/><path d="M9 11l5-2 1 5" fill="none" ${S}/>`),
  close: svg(`<path d="M13 13l22 22M35 13L13 35" ${S}/>`),
  ad: svg(`<rect x="6" y="11" width="36" height="26" rx="5" fill="#8a5cf0" ${S}/><path d="M20 18l10 6-10 6z" fill="#fff6e6"/>`),
  star: svg(`<path d="M24 5l5.6 12 13 1.4-9.7 8.8 2.8 12.8L24 33.5 12.3 40l2.8-12.8L5.4 18.4l13-1.4z" fill="#ffc93c" ${S}/>`),
  paint: svg(`<path d="M10 30c-4-14 10-24 22-20 9 3 8 12 1 12-4 0-5 4-2 6 4 3-1 8-8 8-6 0-11-2-13-6z" fill="#fff6e6" ${S}/><circle cx="18" cy="22" r="3" fill="#ff5a4e"/><circle cx="25" cy="17" r="3" fill="#3cc9a7"/><circle cx="16" cy="30" r="3" fill="#6cb4ee"/>`),
  wrench: svg(`<path d="M30 8a9 9 0 0 0-9 12L8 33a4 4 0 0 0 6 6l13-13a9 9 0 0 0 12-9l-6 3-5-5z" fill="#d9dde4" ${S}/>`),
  truck: svg(`<rect x="5" y="17" width="23" height="15" rx="3" fill="#ff5a4e" ${S}/><path d="M28 21h7l7 6v5H28z" fill="#ff5a4e" ${S}/><circle cx="14" cy="35" r="4.5" fill="#24304a"/><circle cx="35" cy="35" r="4.5" fill="#24304a"/>`),
};

export type IconName = keyof typeof ICONS;

