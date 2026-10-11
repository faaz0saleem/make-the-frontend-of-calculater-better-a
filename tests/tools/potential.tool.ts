import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { LEVELS } from '../../src/data/levels';
import { CARGO } from '../../src/data/cargo';
import { buildLevel } from '../../src/modes/campaign';
test('pot', () => {
  const out: string[] = [];
  for (const lv of LEVELS) {
    const b = buildLevel(lv);
    const vals = b.track.features.filter((f) => f.kind === 'pickup' && f.cargo !== 'gnome').map((f) => CARGO[f.cargo!].value).sort((a, b) => b - a);
    const top8 = vals.slice(0, 8).reduce((a, v) => a + v, 0);
    const coins = b.track.features.filter((f) => f.kind === 'coin').length;
    out.push(`${lv.id} T=${Math.round(top8*0.6/5)*5} pickups=${vals.length} top8=${top8} target=${lv.objectives.target} ratio=${(lv.objectives.target / top8).toFixed(2)} coins=${coins}`);
  }
  mkdirSync('qa/tmp', { recursive: true });
  writeFileSync(process.env.OUT ?? 'qa/tmp/potential.txt', out.join('\n'));
});
