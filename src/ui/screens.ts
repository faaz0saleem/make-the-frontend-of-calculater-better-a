import type { AppState } from '../core/fsm';
import { fmtDuration, msUntilUtcMidnight } from '../core/time';
import { ACHIEVEMENTS } from '../data/achievements';
import { CARGO, CARGO_IDS, isFragile } from '../data/cargo';
import { ECONOMY } from '../data/economy';
import { LEVELS, LEVEL_BY_ID, WORLD_NAMES, careLabel, routeLabel, type LevelDef } from '../data/levels';
import { VEHICLES } from '../data/vehicles';
import type { DailySpec } from '../modes/daily';
import type { Game, UiBridge } from '../game/game';
import type { Reward, RunSummary } from '../progression/rewards';
import type { WorldId } from '../sim/types';
import { btn, fmt, h, icon } from './dom';
import { ICONS } from './icons';
import { openGarage, type GarageHandle } from './garage';

const MEDAL_NAMES = ['Delivery', 'Route', 'Care'];

export class UiRoot implements UiBridge {
  readonly root: HTMLElement;
  private screen: HTMLElement | null = null;
  private noticeEl: HTMLElement | null = null;
  private devEl: HTMLElement | null = null;
  private garage: GarageHandle | null = null;
  private current: AppState | 'title' | null = null;
  private lastData: unknown;
  /** Where settings should return to. */
  private settingsReturn: AppState | 'title' = 'menu';
  private levelWorld: WorldId = 1;

  constructor(root: HTMLElement, private game: Game) {
    this.root = root;
  }

  hideScreens(): void {
    this.screen?.remove();
    this.screen = null;
    this.garage?.close();
    this.garage = null;
    this.current = null;
  }

  notice(text: string | null): void {
    if (!text) {
      this.noticeEl?.remove();
      this.noticeEl = null;
      return;
    }
    if (!this.noticeEl) {
      this.noticeEl = h('div', { class: 'notice', role: 'status', 'data-testid': 'notice' });
      this.root.append(this.noticeEl);
    }
    this.noticeEl.textContent = text;
  }

  devOverlay(text: string): void {
    if (!__DEV_TOOLS__) return; // compiled out of production builds
    if (!this.devEl) {
      this.devEl = h('div', { class: 'dev-overlay', 'data-testid': 'dev-overlay' });
      this.root.append(this.devEl);
    }
    this.devEl.textContent = text;
  }

  private mount(el: HTMLElement): void {
    this.screen?.remove();
    this.garage?.close();
    this.garage = null;
    this.screen = el;
    this.root.prepend(el);
    // focus first primary button for keyboard users
    const first = el.querySelector<HTMLButtonElement>('[data-autofocus]');
    first?.focus({ preventScroll: true });
  }

  private click(): void {
    this.game.audio.play('click');
  }

  show(name: AppState | 'title', data?: unknown): void {
    this.current = name;
    this.lastData = data;
    switch (name) {
      case 'title': return this.mount(this.title());
      case 'menu': return this.mount(this.hub());
      case 'levelSelect': return this.mount(this.levelSelect((data as WorldId) ?? this.levelWorld));
      case 'briefing': return this.mount(typeof data === 'string' ? this.briefing(LEVEL_BY_ID[data]) : this.dailyBriefing());
      case 'paused': return this.mount(this.paused());
      case 'crashed': return this.mount(this.crashed(data as ReturnType<Game['crashOptions']>));
      case 'results': return this.mount(this.results(data as { reward: Reward; summary: RunSummary }));
      case 'album': return this.mount(this.album());
      case 'settings': return this.mount(this.settings());
      case 'garage': {
        this.screen?.remove();
        this.screen = null;
        this.garage?.close();
        this.garage = openGarage(this.game, this.root, (data as { back?: () => void })?.back ?? (() => this.game.toMenu()));
        return;
      }
      default:
        return;
    }
  }

  refresh(): void {
    if (this.current && this.current !== 'garage') this.show(this.current, this.lastData);
  }

  // ------------------------------------------------------------------ title (first launch)
  private title(): HTMLElement {
    const start = btn({
      cls: 'huge mint', icon: 'play', label: 'Tap to drive', testid: 'btn-start',
      onClick: () => {
        this.game.audio.unlock();
        this.game.startRun({ mode: 'campaign', levelId: 'h1' });
      },
    });
    start.setAttribute('data-autofocus', '');
    return h('div', { class: 'layer screen-dim light fade-in', 'data-testid': 'screen-title' },
      h('div', { class: 'title-wrap' },
        h('div', { class: 'logo' }, 'WOBBLE', h('b', null, 'HAUL'), h('small', null, 'TALL-STACK DELIVERY')),
        h('div', { class: 'col', style: 'align-items:center' }, start, h('div', { class: 'start-hint' }, 'First delivery · about 40 seconds'))));
  }

  // ------------------------------------------------------------------ hub
  private coinPill(): HTMLElement {
    return h('div', { class: 'coin-pill', 'data-testid': 'coin-balance', title: 'Coins' }, icon('coin'), fmt(this.game.store.coins));
  }

  private hub(): HTMLElement {
    const g = this.game;
    const st = g.store;
    const next = LEVEL_BY_ID[st.nextLevelId()];
    const allDone = LEVELS.every((l) => st.data.campaign.levels[l.id]?.done);
    const play = btn({ cls: 'huge', icon: 'play', label: allDone ? 'Play' : 'Play', testid: 'btn-play', onClick: () => { this.click(); this.show('briefing', next.id); g.goState('briefing'); } });
    play.setAttribute('data-autofocus', '');
    const sub = h('div', { class: 'play-sub' }, allDone ? 'Replay any delivery for medals' : `Next: ${WORLD_NAMES[next.world]} ${next.num - (next.world - 1) * 10} · ${next.name}`);
    const daily = g.dailyToday();
    const claimed = st.data.daily.lastClaimKey >= daily.key;
    const best = st.data.daily.best[daily.key];
    const medals = st.medalCount();
    const mode = (cls: string, ic: keyof typeof ICONS, title: string, subText: string, onClick: () => void, badge?: HTMLElement, testid?: string) => {
      const b = h('button', { class: `mode-card ${cls}`, type: 'button', 'data-testid': testid }, h('div', { class: 'mc-title', html: `${ICONS[ic]}<span>${title}</span>` }), h('div', { class: 'mc-sub' }, subText), badge ?? null);
      b.addEventListener('click', () => { this.click(); onClick(); });
      return b;
    };
    const row = h('div', { class: 'mode-row' },
      mode('campaign', 'map', 'Delivery Tour', `30 deliveries · ${medals}/90 medals`, () => { g.goState('levelSelect'); this.show('levelSelect', next.world); }, undefined, 'mode-campaign'),
      mode('endless', 'road', 'Long Haul', st.data.endless.bestDistance > 0 ? `Best ${fmt(st.data.endless.bestDistance)} m · score ${fmt(st.data.endless.bestScore)}` : 'Endless road · bank cargo at depots', () => { this.click(); g.startRun({ mode: 'endless' }); }, undefined, 'mode-endless'),
      mode('daily', 'daily', 'Daily Contract', `${daily.spec.modifierName} · ${VEHICLES[daily.spec.vehicle].name}${best ? ` · best ${fmt(best)}` : ''}`, () => { g.goState('briefing'); this.show('briefing', null); }, claimed ? h('span', { class: 'tag mint mc-badge' }, 'Bonus claimed') : h('span', { class: 'tag sun mc-badge' }, `+${ECONOMY.dailyCompletionBonus} bonus`), 'mode-daily'),
    );
    const bottom = h('div', { class: 'hub-bottom' },
      btn({ cls: 'cream', icon: 'garage', label: 'Garage', testid: 'btn-garage', onClick: () => { this.click(); g.goState('garage'); this.show('garage', { back: () => g.toMenu() }); } }),
      btn({ cls: 'cream', icon: 'album', label: 'Album', testid: 'btn-album', onClick: () => { this.click(); g.goState('album'); this.show('album'); } }),
      btn({ cls: 'cream', icon: 'goals', label: 'Goals', testid: 'btn-goals', onClick: () => { this.click(); g.goState('album'); this.mount(this.goals()); } }),
    );
    const top = h('div', { class: 'hub-top' },
      h('div', { class: 'hub-logo' }, 'WOBBLE ', h('b', null, 'HAUL')),
      h('div', { class: 'row' }, this.coinPill(), btn({ cls: 'icon ghost', icon: 'gear', title: 'Settings', testid: 'btn-settings', onClick: () => { this.click(); this.settingsReturn = 'menu'; g.goState('settings'); this.show('settings'); } })));
    return h('div', { class: 'layer screen-dim light fade-in', 'data-testid': 'screen-menu' }, top,
      h('div', { class: 'hub-main' }, h('div', { class: 'play-card' }, play), sub, row, bottom));
  }

  // ------------------------------------------------------------------ level select
  private levelSelect(world: WorldId): HTMLElement {
    const g = this.game;
    const st = g.store;
    this.levelWorld = world;
    const tabs = h('div', { class: 'tabs' });
    for (const w of [1, 2, 3] as WorldId[]) {
      const unlocked = st.worldUnlocked(w);
      const t = h('button', { class: `tab ${w === world ? 'on' : ''} ${unlocked ? '' : 'locked'}`, type: 'button', 'data-testid': `tab-world-${w}` }, unlocked ? null : h('span', { class: 'tab-ico', html: ICONS.lock }), WORLD_NAMES[w]);
      t.addEventListener('click', () => { this.click(); this.show('levelSelect', w); });
      tabs.append(t);
    }
    const grid = h('div', { class: 'level-grid' });
    const nextId = st.nextLevelId();
    for (const lv of LEVELS.filter((l) => l.world === world)) {
      const rec = st.data.campaign.levels[lv.id];
      const unlocked = st.levelUnlocked(lv.id);
      const idx = lv.num - (lv.world - 1) * 10;
      const medals = h('div', { class: 'medals' }, ...[0, 1, 2].map((i) => h('i', { class: `medal m${i} ${rec?.medals[i] ? 'on' : ''}` })));
      const b = h('button', { class: `lvl ${unlocked ? '' : 'locked'} ${lv.id === nextId && unlocked ? 'next' : ''} ${idx === 10 ? 'finale' : ''}`, type: 'button', 'data-testid': `lvl-${lv.id}`, 'aria-label': `${lv.name}${unlocked ? '' : ' (locked)'}` },
        unlocked ? h('div', { class: 'num' }, String(idx)) : icon('lock'), h('div', { class: 'nm' }, lv.name), medals);
      b.addEventListener('click', () => {
        if (!unlocked) {
          g.audio.play('error');
          return;
        }
        this.click();
        g.goState('briefing');
        this.show('briefing', lv.id);
      });
      grid.append(b);
    }
    const lock = st.worldUnlocked(world) ? null : h('p', { class: 'muted' }, `Finish ${WORLD_NAMES[(world - 1) as WorldId]} delivery 10 to unlock.`);
    return h('div', { class: 'layer center screen-dim fade-in', 'data-testid': 'screen-levels' },
      h('div', { class: 'sheet panel pop-in' },
        h('div', { class: 'sheet-head' }, btn({ cls: 'icon cream', icon: 'back', title: 'Back', onClick: () => { this.click(); g.toMenu(); } }), h('h2', null, 'Delivery Tour'), this.coinPill()),
        tabs, h('div', { class: 'sheet-body', style: 'margin-top:10px' }, lock, grid)));
  }

  // ------------------------------------------------------------------ briefing
  private reqRow(i: number, label: string, got: boolean): HTMLElement {
    const m = h('div', { class: `medal big m${i} ${got ? 'on' : ''}` });
    m.innerHTML = got ? ICONS.check : '';
    return h('div', { class: 'req' }, m, h('div', { class: 'lbl' }, h('b', null, `${MEDAL_NAMES[i]}: `), label), h('div', { class: 'st' }, got ? 'Earned' : ''));
  }

  private briefing(lv: LevelDef): HTMLElement {
    const g = this.game;
    const rec = g.store.data.campaign.levels[lv.id];
    const idx = lv.num - (lv.world - 1) * 10;
    const eq = VEHICLES[g.store.data.garage.equipped];
    const start = btn({ cls: 'big mint', icon: 'play', label: 'Drive!', testid: 'btn-drive', onClick: () => { this.click(); g.startRun({ mode: 'campaign', levelId: lv.id }); } });
    start.setAttribute('data-autofocus', '');
    const mods = [lv.wind ? h('span', { class: 'tag', html: `${ICONS.wind}<span>Windy</span>` }) : null, lv.wet ? h('span', { class: 'tag', html: `${ICONS.drop}<span>Wet roads</span>` }) : null];
    return h('div', { class: 'layer center screen-dim fade-in', 'data-testid': 'screen-briefing' },
      h('div', { class: 'sheet brief panel pop-in' },
        h('div', { class: 'row' }, h('span', { class: 'tag sun world-tag' }, `${WORLD_NAMES[lv.world]} · ${idx}/10`), ...mods),
        h('h2', null, lv.name),
        h('p', { style: 'margin:.2em 0 .6em' }, lv.intro),
        h('div', { class: 'sheet-body', style: 'padding:0' },
          this.reqRow(0, `Deliver cargo worth ${fmt(lv.objectives.target)}+`, !!rec?.medals[0]),
          this.reqRow(1, routeLabel(lv.objectives.route), !!rec?.medals[1]),
          this.reqRow(2, careLabel(lv.objectives.care), !!rec?.medals[2]),
          h('p', { class: 'muted', style: 'font-size:.85em' }, rec?.done ? `Best delivery: ${fmt(rec.bestValue)} · plays: ${rec.plays}` : 'Medals are optional. Reaching the depot completes the delivery.'),
          h('p', { class: 'muted', style: 'font-size:.85em' }, `Truck: ${eq.name} · Spare tires: ${g.store.data.tokens}`)),
        h('div', { class: 'row end', style: 'margin-top:.6em' },
          btn({ cls: 'cream', icon: 'back', label: 'Back', onClick: () => { this.click(); g.goState('levelSelect'); this.show('levelSelect', lv.world); } }),
          btn({ cls: 'cream', icon: 'garage', label: 'Garage', onClick: () => { this.click(); g.goState('garage'); this.show('garage', { back: () => { g.goState('briefing'); this.show('briefing', lv.id); } }); } }),
          start)));
  }

  private dailyBriefing(): HTMLElement {
    const g = this.game;
    const { spec, key } = g.dailyToday();
    const st = g.store;
    const claimable = st.dailyClaimable(key);
    const best = st.data.daily.best[key];
    const resets = fmtDuration(msUntilUtcMidnight(Date.now()));
    const start = btn({ cls: 'big mint', icon: 'play', label: 'Start contract', testid: 'btn-daily-start', onClick: () => { this.click(); g.startRun({ mode: 'daily', daily: spec as DailySpec }); } });
    start.setAttribute('data-autofocus', '');
    return h('div', { class: 'layer center screen-dim fade-in', 'data-testid': 'screen-daily' },
      h('div', { class: 'sheet brief panel pop-in' },
        h('div', { class: 'row' }, h('span', { class: 'tag sun' }, `Daily Contract · ${key} (UTC)`), h('span', { class: 'tag' }, `Resets in ${resets} at 00:00 UTC`)),
        h('h2', null, spec.modifierName),
        h('p', null, spec.modifierDesc),
        h('div', { class: 'req' }, icon('truck'), h('div', { class: 'lbl' }, h('b', null, 'Loaner truck: '), `${VEHICLES[spec.vehicle].name} (no upgrades, no continues)`)),
        h('div', { class: 'req' }, icon('map'), h('div', { class: 'lbl' }, h('b', null, 'Route: '), `${WORLD_NAMES[spec.world]} · ${fmt(spec.distance)} m with depots`)),
        h('div', { class: 'req' }, icon('coin'), h('div', { class: 'lbl' }, h('b', null, 'Completion bonus: '), claimable ? `+${ECONOMY.dailyCompletionBonus} coins (once per day)` : 'Already claimed today. Replays still improve your best.')),
        h('p', { class: 'muted', style: 'font-size:.85em' }, `Everyone gets the same route, truck and conditions today. Unlimited retries. ${best ? `Your best today: ${fmt(best)}.` : ''} This is a personal challenge; scores stay on this device/account.`),
        h('div', { class: 'row end' }, btn({ cls: 'cream', icon: 'back', label: 'Back', onClick: () => { this.click(); g.toMenu(); } }), start)));
  }

  // ------------------------------------------------------------------ pause
  private paused(): HTMLElement {
    const g = this.game;
    const resume = btn({ cls: 'big mint', icon: 'play', label: 'Resume', testid: 'btn-resume', onClick: () => { this.click(); g.resume(); } });
    resume.setAttribute('data-autofocus', '');
    const req = g.req;
    const lv = req?.levelId ? LEVEL_BY_ID[req.levelId] : null;
    return h('div', { class: 'layer center screen-dim fade-in', 'data-testid': 'screen-pause' },
      h('div', { class: 'sheet brief panel pop-in' },
        h('h2', null, 'Paused'),
        lv ? h('div', null, this.reqRow(0, `Deliver cargo worth ${fmt(lv.objectives.target)}+`, false), this.reqRow(1, routeLabel(lv.objectives.route), false), this.reqRow(2, careLabel(lv.objectives.care), false)) : h('p', null, req?.mode === 'daily' ? 'Daily Contract: no continues today.' : 'Bank cargo at depots to keep it safe.'),
        h('div', { class: 'row center', style: 'margin-top:.6em' },
          resume,
          btn({ cls: 'cream', icon: 'retry', label: 'Restart', testid: 'btn-restart', onClick: () => { this.click(); g.restartRun(); } }),
          btn({ cls: 'cream', icon: 'gear', label: 'Settings', onClick: () => { this.click(); this.settingsReturn = 'paused'; g.goState('settings'); this.show('settings'); } }),
          btn({ cls: 'cream', icon: 'home', label: 'Quit', testid: 'btn-quit', onClick: () => { this.click(); g.quitToMenu(); } })),
        h('p', { class: 'muted', style: 'font-size:.8em;text-align:center' }, 'Quitting keeps road coins you collected; cargo on board is lost.')));
  }

  // ------------------------------------------------------------------ crash
  private crashed(o: ReturnType<Game['crashOptions']>): HTMLElement {
    const g = this.game;
    const reasonText: Record<string, string> = {
      barrier: 'You hit a solid barrier head-on.', rollover: 'The load got too tall and tipped the truck.', fell: 'The truck went over the edge.', lowbridge: 'The beam was lower than your cab.',
    };
    const results = btn({ cls: 'big', icon: 'next', label: 'See results', testid: 'btn-see-results', onClick: () => { this.click(); g.settleAndShowResults('crashed'); } });
    results.setAttribute('data-autofocus', '');
    const actions = h('div', { class: 'row center' });
    if (o.canToken) {
      actions.append(btn({ cls: 'big mint', icon: 'tire', label: `Use Spare Tire (${o.tokens} left)`, testid: 'btn-use-token', onClick: () => { this.click(); g.useTokenContinue(); } }));
    }
    actions.append(results);
    let adRow: HTMLElement | null = null;
    if (o.offerAd) {
      const watch = btn({ cls: 'big grape', icon: 'ad', label: 'Watch ad: free Spare Tire', testid: 'btn-ad-continue', onClick: async () => {
        watch.disabled = true;
        const ok = await g.adContinue();
        if (!ok) {
          watch.disabled = true;
          watch.querySelector('span')!.textContent = 'Ad not available right now';
        }
      } });
      const no = btn({ cls: 'big cream', label: 'No thanks', testid: 'btn-ad-decline', onClick: () => { this.click(); g.settleAndShowResults('crashed'); } });
      adRow = h('div', null, h('p', { class: 'muted', style: 'text-align:center;margin:.4em 0' }, 'Optional: watch an ad to continue this run (cargo already lost stays lost). You can also buy Spare Tires with coins in the Garage.'), h('div', { class: 'ad-offer' }, watch, no));
    }
    return h('div', { class: 'layer center screen-dim fade-in', 'data-testid': 'screen-crash' },
      h('div', { class: 'sheet brief', style: 'background:none;border:0' },
        h('div', { class: 'crash-title' }, o.reason === 'rollover' ? 'Tipped over!' : o.reason === 'fell' ? 'Off the edge!' : 'Crashed!'),
        h('div', { class: 'panel pop-in', style: 'margin-top:1em' },
          h('p', { style: 'margin-top:0' }, reasonText[o.reason] ?? ''),
          o.mode === 'daily' ? h('p', { class: 'muted' }, 'Daily Contract runs have no continues. Retries are free and unlimited.') : null,
          !o.canToken && o.mode !== 'daily' && o.tokens === 0 ? h('p', { class: 'muted', style: 'font-size:.85em' }, 'Tip: Spare Tires (bought with coins in the Garage) let you continue once per run.') : null,
          actions, adRow)));
  }

  // ------------------------------------------------------------------ results
  private results(d: { reward: Reward; summary: RunSummary }): HTMLElement {
    const g = this.game;
    const { reward, summary } = d;
    const finished = summary.outcome === 'finished';
    const lv = summary.levelId ? LEVEL_BY_ID[summary.levelId] : null;
    const title = finished ? (summary.mode === 'daily' ? 'Contract complete!' : 'Delivered!') : summary.mode === 'endless' ? 'Run over' : summary.outcome === 'quit' ? 'Run ended' : 'Crashed';
    const lines = h('div', { class: 'lines', 'data-testid': 'result-lines' });
    reward.lines.forEach((l, i) => {
      const amt = h('span', { class: 'amt' }, l.amount >= 0 ? `+${fmt(l.amount)}` : `−${fmt(-l.amount)}`);
      const row = h('div', { class: `line k-${l.kind}` }, h('span', null, l.label), amt);
      row.style.animation = `popIn .25s ${0.08 * i}s both`;
      lines.append(row);
    });
    if (reward.lines.length === 0) lines.append(h('div', { class: 'line' }, h('span', null, 'No coins this time'), h('span', { class: 'amt' }, '0')));
    const totalAmt = h('span', { 'data-testid': 'result-total' }, '0');
    this.countUp(totalAmt, reward.total);
    const medals = lv && reward.medals ? h('div', { class: 'medal-row' }, ...[0, 1, 2].map((i) => {
      const got = [reward.medals!.delivery, reward.medals!.route, reward.medals!.care][i];
      const prev = g.store.data.campaign.levels[lv.id]?.medals[i];
      const req = i === 0 ? `${fmt(reward.medals!.deliveredValue)} / ${fmt(lv.objectives.target)}` : i === 1 ? routeLabel(lv.objectives.route) : careLabel(lv.objectives.care);
      const m = h('div', { class: `medal big m${i} ${got || prev ? 'on' : ''}` });
      m.innerHTML = got || prev ? ICONS.check : '';
      return h('div', { class: `medal-card ${got || prev ? 'got' : ''} ${reward.newMedals[i] ? 'new' : ''}` }, m, h('div', null, MEDAL_NAMES[i]), h('div', { class: 'muted', style: 'font-weight:500' }, req));
    })) : null;
    const scoreRow = summary.mode !== 'campaign' && summary.mode !== 'tutorial' ? h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', null, `Score ${fmt(reward.score)}`), h('span', { class: 'muted' }, `${fmt(summary.distance)} m`)) : null;
    const nextLv = lv ? LEVELS[lv.num] : null;
    const canNext = !!(lv && finished && nextLv && g.store.levelUnlocked(nextLv.id));
    const tutorialDone = lv?.id === 'h1' && g.store.data.tutorialDone;
    const btns = h('div', { class: 'row center', style: 'margin-top:.7em' });
    const retry = btn({ cls: tutorialDone && finished ? 'cream' : 'mint big', icon: 'retry', label: summary.mode === 'endless' ? 'Drive again' : 'Retry', testid: 'btn-retry', onClick: async () => {
      this.click();
      await g.maybeMidgame();
      g.restartRun();
    } });
    const next = btn({ cls: 'big mint', icon: 'next', label: tutorialDone ? 'Continue' : 'Next delivery', testid: 'btn-next', onClick: async () => {
      this.click();
      if (tutorialDone) {
        g.toMenu();
        return;
      }
      await g.maybeMidgame();
      g.goState('briefing');
      this.show('briefing', nextLv!.id);
    } });
    if (canNext || tutorialDone) btns.append(next);
    btns.append(retry);
    if (!tutorialDone) {
      btns.append(btn({ cls: 'cream', icon: 'garage', label: 'Garage', testid: 'btn-res-garage', onClick: () => { this.click(); g.goState('garage'); this.show('garage', { back: () => { g.goState('results'); this.show('results', d); } }); } }));
      btns.append(btn({ cls: 'cream', icon: 'home', label: 'Menu', testid: 'btn-res-menu', onClick: () => { this.click(); g.toMenu(); } }));
    }
    (btns.firstElementChild as HTMLElement | null)?.setAttribute('data-autofocus', '');
    const loss = reward.lines.find((l) => l.kind === 'loss');
    const sub = finished
      ? summary.mode === 'endless' || summary.mode === 'daily' ? `Banked ${fmt(summary.stats.banked)} coins of cargo.` : `${summary.stats.delivered.length} items delivered${summary.stats.spilled ? `, ${summary.stats.spilled} lost on the way` : ''}.`
      : loss ? `${loss.label}: ${fmt(-loss.amount)}. Coins already collected are kept.` : 'Coins already collected are kept.';
    return h('div', { class: 'layer center screen-dim fade-in', 'data-testid': 'screen-results' },
      h('div', { class: 'sheet results panel pop-in' },
        h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', null, title), reward.newBest ? h('span', { class: 'badge-best', 'data-testid': 'new-best' }, 'New best!') : null),
        h('p', { class: 'sub muted' }, sub),
        medals, scoreRow, lines,
        h('div', { class: 'total' }, h('span', null, 'Total'), h('span', { class: 'amt' }, icon('coin'), totalAmt)),
        h('div', { class: 'muted', style: 'font-size:.8em;text-align:right' }, `Balance: ${fmt(g.store.coins)}`),
        btns));
  }

  private countUp(el: HTMLElement, total: number): void {
    if (this.game.store.data.settings.reducedMotion || total <= 0) {
      el.textContent = fmt(total);
      return;
    }
    const t0 = performance.now();
    const dur = Math.min(1400, 400 + total * 2);
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      el.textContent = fmt(total * (1 - Math.pow(1 - t, 3)));
      if (t < 1 && el.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------ album
  private album(): HTMLElement {
    const g = this.game;
    const st = g.store;
    const grid = h('div', { class: 'album-grid' });
    for (const id of CARGO_IDS) {
      const c = CARGO[id];
      const known = st.data.album.includes(id);
      const img = h('img', { src: g.thumbs.cargo(id, !known), alt: known ? c.name : 'Undiscovered cargo', width: 64, height: 64, style: 'width:64px;height:64px' });
      const meta = known ? `${c.mass} kg · worth ${c.value} · ${isFragile(c) ? 'fragile' : c.fragility > 0.25 ? 'delicate' : 'sturdy'} · delivered ${st.data.delivered[id] ?? 0}` : c.rare ? 'A rare find…' : `Found in ${WORLD_NAMES[c.world as WorldId] ?? 'every world'}`;
      grid.append(h('div', { class: `card ${known ? '' : 'unknown'}`, 'data-testid': `album-${id}` }, img, h('div', { class: 't' }, known ? c.name : '???'), known ? h('div', { class: 'd' }, c.desc) : null, h('div', { class: 'meta' }, meta)));
    }
    return h('div', { class: 'layer center screen-dim fade-in', 'data-testid': 'screen-album' },
      h('div', { class: 'sheet panel pop-in' },
        h('div', { class: 'sheet-head' }, btn({ cls: 'icon cream', icon: 'back', title: 'Back', onClick: () => { this.click(); g.toMenu(); } }), h('h2', null, `Cargo Album · ${st.data.album.length}/${CARGO_IDS.length}`)),
        h('div', { class: 'sheet-body' }, grid)));
  }

  // ------------------------------------------------------------------ goals
  goals(): HTMLElement {
    const g = this.game;
    const st = g.store;
    const contracts = st.data.contracts.active.map((c) => {
      const pct = Math.min(100, Math.round((c.progress / c.n) * 100));
      return h('div', { class: 'goal', 'data-testid': 'contract' }, icon('goals'), h('div', { class: 'grow' }, h('b', null, st.contractLabel(c)), h('div', { class: 'gbar' }, h('i', { style: `width:${pct}%` })), h('div', { class: 'muted', style: 'font-size:.8em' }, `${Math.min(c.progress, c.n)}/${c.n}`)), h('span', { class: 'tag sun' }, `+${c.reward}`));
    });
    const ach = ACHIEVEMENTS.map((a) => {
      const done = st.data.achievements.includes(a.id);
      return h('div', { class: `goal ${done ? 'done' : ''}` }, icon(done ? 'trophy' : 'lock'), h('div', { class: 'grow' }, h('b', null, a.name), h('div', { class: 'muted', style: 'font-size:.85em' }, a.desc)), h('span', { class: `tag ${done ? 'mint' : ''}` }, done ? 'Done' : `+${a.reward}`));
    });
    const s = st.data.stats;
    return h('div', { class: 'layer center screen-dim fade-in', 'data-testid': 'screen-goals' },
      h('div', { class: 'sheet panel pop-in' },
        h('div', { class: 'sheet-head' }, btn({ cls: 'icon cream', icon: 'back', title: 'Back', onClick: () => { this.click(); g.toMenu(); } }), h('h2', null, 'Goals'), this.coinPill()),
        h('div', { class: 'sheet-body' },
          h('h3', null, 'Contracts'), h('p', { class: 'muted', style: 'margin-top:0;font-size:.85em' }, 'Optional side jobs. They never expire; a new one appears when you finish one.'), ...contracts,
          h('h3', null, `Achievements · ${st.data.achievements.length}/${ACHIEVEMENTS.length}`), ...ach,
          h('h3', null, 'Your stats'),
          h('p', { class: 'muted' }, `Runs ${fmt(s.runs)} · Distance ${fmt(s.distance)} m · Items delivered ${fmt(s.deliveredItems)} · Saves ${fmt(s.recoveries)} · Near misses ${fmt(s.nearMisses)} · Long Haul best ${fmt(st.data.endless.bestDistance)} m`))));
  }

  // ------------------------------------------------------------------ settings
  private settings(): HTMLElement {
    const g = this.game;
    const st = g.store;
    const s = st.data.settings;
    const slider = (label: string, key: 'master' | 'music' | 'sfx' | 'shake' | 'resScale' | 'sensitivity', min: number, max: number, step: number, fmtv: (v: number) => string) => {
      const out = h('span', { style: 'min-width:3.2em;text-align:right;font-weight:700' }, fmtv(s[key]));
      const input = h('input', { type: 'range', min, max, step, value: s[key], 'aria-label': label, 'data-testid': `set-${key}` }) as HTMLInputElement;
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = fmtv(v);
        st.updateSettings({ [key]: v });
        g.applySettings();
      });
      return h('div', { class: 'set-row' }, h('label', null, label), input, out);
    };
    const toggle = (label: string, key: 'muted' | 'reducedMotion') => {
      const t = h('button', { class: `toggle ${s[key] ? 'on' : ''}`, type: 'button', role: 'switch', 'aria-checked': String(s[key]), 'aria-label': label, 'data-testid': `set-${key}` });
      t.addEventListener('click', () => {
        const v = !st.data.settings[key];
        st.updateSettings({ [key]: v });
        g.applySettings();
        t.classList.toggle('on', v);
        t.setAttribute('aria-checked', String(v));
        this.click();
      });
      return h('div', { class: 'set-row' }, h('label', null, label), t);
    };
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Graphics quality' });
    for (const q of ['auto', 'low', 'medium', 'high'] as const) {
      const b = h('button', { class: s.quality === q ? 'on' : '', type: 'button', 'data-testid': `set-quality-${q}` }, q[0].toUpperCase() + q.slice(1));
      b.addEventListener('click', () => {
        st.updateSettings({ quality: q });
        g.applySettings();
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        this.click();
      });
      seg.append(b);
    }
    const back = () => {
      this.click();
      void st.flush();
      const ret = this.settingsReturn;
      if (ret === 'paused') {
        g.goState('paused');
        this.show('paused');
      } else g.toMenu();
    };
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const platformMuted = g.audio.hasMute('platform');
    return h('div', { class: 'layer center screen-dim fade-in', 'data-testid': 'screen-settings' },
      h('div', { class: 'sheet brief panel pop-in' },
        h('div', { class: 'sheet-head' }, btn({ cls: 'icon cream', icon: 'back', title: 'Back', testid: 'btn-settings-back', onClick: back }), h('h2', null, 'Settings')),
        h('div', { class: 'sheet-body' },
          platformMuted ? h('p', { class: 'tag tomato' }, 'Sound is muted by the platform') : null,
          toggle('Mute all sound', 'muted'),
          slider('Master volume', 'master', 0, 1, 0.05, pct),
          slider('Music', 'music', 0, 1, 0.05, pct),
          slider('Effects', 'sfx', 0, 1, 0.05, pct),
          h('div', { class: 'set-row' }, h('label', null, 'Graphics'), seg),
          slider('Resolution scale', 'resScale', 0.5, 1, 0.05, pct),
          slider('Camera shake', 'shake', 0, 1, 0.05, pct),
          toggle('Reduced motion', 'reducedMotion'),
          slider('Drag steering sensitivity', 'sensitivity', 0.5, 2, 0.05, (v) => `${v.toFixed(2)}×`),
          h('h3', null, 'Controls'),
          h('p', { class: 'muted', style: 'font-size:.9em' }, g.touch
            ? 'Drag left/right anywhere to steer. Tap SHED to drop the top item. Pause with the button at the top right.'
            : 'Steer: A / D or ← →, or drag with the mouse. Shed top item: Space (or the SHED button). Pause: P or the pause button.'),
          h('p', { class: 'muted', style: 'font-size:.8em' }, `Version ${__BUILD_TIME__.slice(0, 10)} · ${g.platform.stage === 'full' ? 'Full' : 'Basic'} build · No personal data collected.`))));
  }
}
