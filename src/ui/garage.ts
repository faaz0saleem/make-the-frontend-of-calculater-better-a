import { ACCESSORIES, PAINTS, paintById, type PaintDef } from '../data/cosmetics';
import { ECONOMY } from '../data/economy';
import { MAX_TIER, UPGRADES, UPGRADE_IDS, describeTier, type UpgradeTrack } from '../data/upgrades';
import { VEHICLES, VEHICLE_IDS, statBars, type VehicleKind } from '../data/vehicles';
import type { Game } from '../game/game';
import type { TxResult } from '../progression/store';
import { GarageStage } from '../render/garageStage';
import { btn, fmt, h, icon } from './dom';
import { ICONS } from './icons';

export interface GarageHandle {
  close(): void;
}

type Tab = 'trucks' | 'paint' | 'extras' | 'upgrades' | 'spares';
let stage: GarageStage | null = null;

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export function openGarage(game: Game, root: HTMLElement, onBack: () => void): GarageHandle {
  const st = game.store;
  stage ??= new GarageStage();
  const s = stage;
  s.setEnvironment(game.renderer.scene.environment as never);
  s.resize(window.innerWidth, window.innerHeight);
  game.renderer.overlayScene = { scene: s.scene, camera: s.camera };
  game.overlayUpdate = (dt) => s.update(dt, st.data.settings.reducedMotion);
  const onResize = () => s.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', onResize);

  let tab: Tab = 'trucks';
  let selTruck: VehicleKind = st.data.garage.equipped;
  let selPaint: string = st.data.garage.paint;
  let selAcc: string | null = null;
  let confirmKey = '';
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;
  let busy = false;
  const adTrialsUsed = new Set<string>();

  const coinPill = h('div', { class: 'coin-pill', 'data-testid': 'coin-balance' });
  const nameEl = h('div', { class: 'garage-name' });
  const tagEl = h('div', { class: 'play-sub', style: 'font-size:.9em' });
  const list = h('div', { class: 'item-list' });
  const detail = h('div', { class: 'col', style: 'margin-top:.4em' });
  const tabs = h('div', { class: 'tabs' });
  const hit = h('div', { class: 'preview-hit', title: 'Drag to rotate' });
  const panel = h('div', { class: 'panel' }, tabs, list, detail);
  const back = btn({ cls: 'icon cream', icon: 'back', title: 'Back', testid: 'btn-garage-back', onClick: () => { game.audio.play('click'); close(); onBack(); } });
  const el = h('div', { class: 'garage fade-in', 'data-testid': 'screen-garage' },
    h('div', { class: 'garage-left' },
      h('div', { class: 'row' }, back, h('div', { class: 'garage-title' }, 'Garage'), h('div', { class: 'grow' }), coinPill),
      hit,
      h('div', { class: 'col', style: 'align-items:center;gap:2px' }, nameEl, tagEl, h('div', { class: 'play-sub', style: 'font-size:.75em;opacity:.8' }, 'Drag to rotate · cosmetics never change handling'))),
    h('div', { class: 'garage-right' }, panel));
  root.prepend(el);

  // drag-to-rotate
  let lastX = 0;
  let dragId: number | null = null;
  hit.addEventListener('pointerdown', (e) => {
    dragId = e.pointerId;
    lastX = e.clientX;
    s.setDragging(true);
    hit.setPointerCapture(e.pointerId);
  });
  hit.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragId) return;
    s.drag(e.clientX - lastX);
    lastX = e.clientX;
  });
  const endDrag = (e: PointerEvent) => {
    if (e.pointerId !== dragId) return;
    dragId = null;
    s.setDragging(false);
  };
  hit.addEventListener('pointerup', endDrag);
  hit.addEventListener('pointercancel', endDrag);

  const previewPaint = (): PaintDef => paintById(tab === 'paint' ? selPaint : st.displayPaint);
  const previewAcc = (): string[] => {
    const eq = [...st.data.garage.equippedAcc];
    if (tab === 'extras' && selAcc && !eq.includes(selAcc)) {
      const slot = ACCESSORIES.find((a) => a.id === selAcc)?.slot;
      return [...eq.filter((x) => ACCESSORIES.find((a) => a.id === x)?.slot !== slot), selAcc];
    }
    return eq;
  };

  function refreshPreview(): void {
    s.show(tab === 'trucks' ? selTruck : st.data.garage.equipped, previewPaint(), previewAcc());
    const v = VEHICLES[tab === 'trucks' ? selTruck : st.data.garage.equipped];
    nameEl.textContent = v.name;
    tagEl.textContent = v.tagline;
  }

  function priceTag(price: number): HTMLElement {
    const t = h('span', { class: 'st' });
    t.innerHTML = `${ICONS.coin}<span>${fmt(price)}</span>`;
    return t;
  }

  function result(r: TxResult): void {
    if (r.ok) {
      game.audio.play('purchase');
      coinPill.classList.remove('bump');
      void coinPill.offsetWidth;
      coinPill.classList.add('bump');
    } else game.audio.play('error');
  }

  /** Two-step purchase: first press arms the button for 3 s, second press buys. */
  function buyButton(key: string, price: number, label: string, doBuy: () => TxResult, testid: string): HTMLButtonElement {
    const afford = st.coins >= price;
    if (!afford) {
      return btn({ cls: 'wide cream', label: `Not enough coins (need ${fmt(price - st.coins)} more)`, disabled: true, onClick: () => {}, testid });
    }
    const armed = confirmKey === key;
    const b = btn({
      cls: `wide big ${armed ? 'confirm' : 'mint'}`, icon: 'coin', label: armed ? `Confirm: spend ${fmt(price)}` : `${label} · ${fmt(price)}`, testid,
      onClick: () => {
        if (busy) return;
        if (confirmKey !== key) {
          confirmKey = key;
          if (confirmTimer) clearTimeout(confirmTimer);
          confirmTimer = setTimeout(() => { confirmKey = ''; render(); }, 3000);
          game.audio.play('click');
          render();
          return;
        }
        busy = true;
        confirmKey = '';
        if (confirmTimer) clearTimeout(confirmTimer);
        const r = doBuy();
        result(r);
        busy = false;
        render();
      },
    });
    return b;
  }

  function renderTabs(): void {
    tabs.replaceChildren();
    const defs: [Tab, string][] = [['trucks', 'Trucks'], ['paint', 'Paint'], ['extras', 'Extras'], ['upgrades', 'Upgrades'], ['spares', 'Spares']];
    for (const [id, label] of defs) {
      const t = h('button', { class: `tab ${tab === id ? 'on' : ''}`, type: 'button', 'data-testid': `gtab-${id}` }, label);
      t.addEventListener('click', () => { game.audio.play('click'); tab = id; confirmKey = ''; render(); });
      tabs.append(t);
    }
  }

  function renderTrucks(): void {
    for (const id of VEHICLE_IDS) {
      const v = VEHICLES[id];
      const owned = st.owns('vehicle', id);
      const eq = st.data.garage.equipped === id;
      const status = eq ? h('span', { class: 'st' }, 'Equipped') : owned ? h('span', { class: 'st' }, 'Owned') : priceTag(v.price);
      const it = h('button', { class: `item ${selTruck === id ? 'sel' : ''}`, type: 'button', 'data-testid': `truck-${id}` }, h('span', { class: 'sw', style: `background:${hex(paintById(st.displayPaint).body)}`, html: ICONS.truck }), h('span', null, h('div', { class: 'nm' }, v.name), h('div', { class: 'ds' }, `${v.strengths} · ${v.weakness}`)), status);
      it.addEventListener('click', () => { game.audio.play('click'); selTruck = id; confirmKey = ''; render(); });
      list.append(it);
    }
    const v = VEHICLES[selTruck];
    const cur = statBars(VEHICLES[st.data.garage.equipped].stats);
    const sel = statBars(v.stats);
    const bars = h('div', { class: 'statbars' });
    sel.forEach((b, i) => {
      const bar = h('div', { class: 'sbar', title: `${b.label}: ${Math.round(b.value * 100)}` }, h('i', { style: `width:${b.value * 100}%;background:${b.value >= cur[i].value ? '#3cc9a7' : '#ffb347'}` }), h('b', { style: `left:calc(${cur[i].value * 100}% - 1px)` }));
      bars.append(h('span', null, b.label), bar);
    });
    detail.append(h('div', { class: 'muted', style: 'font-size:.8em' }, `${v.tagline} Capacity ${v.stats.capacity * v.stats.columns} items${v.stats.columns === 2 ? ' in two columns' : ''}${v.stats.bedWall ? ', walled cargo box' : ''}. Bar marker = your current truck.`), bars);
    const owned = st.owns('vehicle', selTruck);
    if (owned) {
      const eq = st.data.garage.equipped === selTruck;
      detail.append(btn({ cls: `wide big ${eq ? 'cream' : 'sky'}`, label: eq ? 'Equipped' : 'Equip', disabled: eq, testid: 'btn-equip', onClick: () => { result(st.equipVehicle(selTruck)); render(); } }));
    } else {
      detail.append(buyButton(`truck:${selTruck}`, v.price, 'Buy', () => st.buyVehicle(selTruck), 'btn-buy'));
    }
  }

  function renderPaint(): void {
    for (const p of PAINTS) {
      const owned = st.owns('paint', p.id);
      const eq = st.data.garage.paint === p.id;
      const trial = st.data.trial.paint === p.id && st.data.trial.runsLeft > 0;
      const status = eq ? h('span', { class: 'st' }, 'Equipped') : trial ? h('span', { class: 'st' }, `Trial · ${st.data.trial.runsLeft} runs`) : owned ? h('span', { class: 'st' }, 'Owned') : priceTag(p.price);
      const sw = h('span', { class: 'sw', style: `background:linear-gradient(135deg, ${hex(p.body)} 0 55%, ${hex(p.trim)} 55% 78%, ${hex(p.accent)} 78%)` });
      const it = h('button', { class: `item ${selPaint === p.id ? 'sel' : ''}`, type: 'button', 'data-testid': `paint-${p.id}` }, sw, h('span', null, h('div', { class: 'nm' }, p.name), h('div', { class: 'ds' }, p.pattern === 'solid' ? 'Solid' : p.pattern === 'twoTone' ? 'Two-tone' : p.pattern[0].toUpperCase() + p.pattern.slice(1))), status);
      it.addEventListener('click', () => { game.audio.play('click'); selPaint = p.id; confirmKey = ''; render(); });
      list.append(it);
    }
    const p = PAINTS.find((x) => x.id === selPaint)!;
    if (st.owns('paint', p.id)) {
      const eq = st.data.garage.paint === p.id;
      detail.append(btn({ cls: `wide big ${eq ? 'cream' : 'sky'}`, label: eq ? 'Equipped' : 'Equip', disabled: eq, testid: 'btn-equip', onClick: () => { result(st.equipPaint(p.id)); render(); } }));
    } else {
      detail.append(buyButton(`paint:${p.id}`, p.price, 'Buy paint', () => st.buyPaint(p.id), 'btn-buy'));
      // Full Launch only: optional rewarded cosmetic trial (also obtainable by buying with coins above).
      if (game.ads.available && !adTrialsUsed.has(p.id) && !(st.data.trial.paint === p.id)) {
        const t = btn({ cls: 'wide grape', icon: 'ad', label: `Watch ad: try for ${ECONOMY.cosmeticTrialRuns} runs`, testid: 'btn-trial', onClick: async () => {
          adTrialsUsed.add(p.id);
          t.disabled = true;
          game.goState('ad');
          const res = await game.ads.show('rewarded');
          game.goState('garage');
          if (res.granted) st.grantAdReward(res.requestId, { trialPaint: p.id });
          else game.ui.notice('No ad available right now. You can still buy this paint with coins.');
          setTimeout(() => game.refreshSaveNotice(), 3500);
          render();
        } });
        detail.append(t);
      }
    }
  }

  function renderExtras(): void {
    for (const a of ACCESSORIES) {
      const owned = st.owns('accessory', a.id);
      const eq = st.data.garage.equippedAcc.includes(a.id);
      const status = eq ? h('span', { class: 'st' }, 'Equipped') : owned ? h('span', { class: 'st' }, 'Owned') : priceTag(a.price);
      const it = h('button', { class: `item ${selAcc === a.id ? 'sel' : ''}`, type: 'button', 'data-testid': `acc-${a.id}` }, h('span', { class: 'sw', style: 'background:#fff1c2', html: ICONS.star }), h('span', null, h('div', { class: 'nm' }, a.name), h('div', { class: 'ds' }, `${a.desc} (${a.slot})`)), status);
      it.addEventListener('click', () => { game.audio.play('click'); selAcc = a.id; confirmKey = ''; render(); });
      list.append(it);
    }
    if (!selAcc) {
      detail.append(h('p', { class: 'muted' }, 'Pick an extra to preview it on your truck. One per slot.'));
      return;
    }
    const a = ACCESSORIES.find((x) => x.id === selAcc)!;
    if (st.owns('accessory', a.id)) {
      const eq = st.data.garage.equippedAcc.includes(a.id);
      detail.append(btn({ cls: `wide big ${eq ? 'cream' : 'sky'}`, label: eq ? 'Remove' : 'Equip', testid: 'btn-equip', onClick: () => { result(st.toggleAccessory(a.id)); render(); } }));
    } else detail.append(buyButton(`acc:${a.id}`, a.price, 'Buy extra', () => st.buyAccessory(a.id), 'btn-buy'));
  }

  function renderUpgrades(): void {
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id];
      const tier = st.data.upgrades[id];
      const pips = h('div', { class: 'pips' }, ...Array.from({ length: MAX_TIER }, (_, i) => h('span', { class: `pip ${i < tier ? 'on' : ''}` })));
      const card = h('div', { class: 'upg', 'data-testid': `upg-${id}` },
        h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', null, def.name), h('span', { class: 'tag' }, `Tier ${tier}/${MAX_TIER}`)), pips,
        h('div', { class: 'muted', style: 'font-size:.85em' }, tier > 0 ? `Now: ${describeTier(id, tier)}` : 'Now: stock'),
        tier < MAX_TIER ? h('div', { style: 'font-size:.85em;font-weight:600' }, `Next: ${describeTier(id, tier + 1)}`) : h('div', { style: 'font-weight:700' }, 'Maxed out!'));
      if (tier < MAX_TIER) card.append(buyButton(`upg:${id}:${tier}`, def.costs[tier], 'Upgrade', () => st.buyUpgrade(id as UpgradeTrack, tier), `btn-upg-${id}`));
      list.append(card);
    }
    detail.append(h('p', { class: 'muted', style: 'font-size:.8em;margin:0' }, 'Upgrades apply to every truck and add forgiveness; they never replace good steering. Disabled in the Daily Contract.'));
  }

  function renderSpares(): void {
    const n = st.data.tokens;
    list.append(h('div', { class: 'upg' },
      h('div', { class: 'row' }, icon('tire'), h('b', null, `Spare Tires: ${n}/${ECONOMY.spareTireMax}`)),
      h('p', { class: 'muted', style: 'font-size:.9em' }, 'After a crash, use one to keep driving (once per run). Cargo that already fell off stays lost. Not usable in the Daily Contract. Retrying is always free.')));
    if (n >= ECONOMY.spareTireMax) detail.append(btn({ cls: 'wide cream', label: 'Spare tire rack is full', disabled: true, onClick: () => {} }));
    else detail.append(buyButton(`token:${n}`, ECONOMY.spareTirePrice, 'Buy Spare Tire', () => st.buyToken(n), 'btn-buy-token'));
  }

  function render(): void {
    coinPill.innerHTML = `${ICONS.coin}<span>${fmt(st.coins)}</span>`;
    renderTabs();
    list.replaceChildren();
    detail.replaceChildren();
    if (tab === 'trucks') renderTrucks();
    else if (tab === 'paint') renderPaint();
    else if (tab === 'extras') renderExtras();
    else if (tab === 'upgrades') renderUpgrades();
    else renderSpares();
    refreshPreview();
  }

  render();

  function close(): void {
    if (confirmTimer) clearTimeout(confirmTimer);
    window.removeEventListener('resize', onResize);
    game.renderer.overlayScene = null;
    game.overlayUpdate = null;
    el.remove();
  }
  return { close };
}
