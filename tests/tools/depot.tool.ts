import { test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CARGO } from '../../src/data/cargo';
import { session, trackOf } from '../unit/helpers';
test('depot', () => {
  const track = trackOf(['start', 'depot_fork', 'cargo_line']);
  const run = session(track);
  run.truck.addCargo(CARGO.crate, []);
  const out: string[] = [];
  const dep = track.features.find((f) => f.kind === 'depot')!;
  out.push(JSON.stringify(dep));
  for (let i = 0; i < 120 * 10; i++) {
    run.step(1 / 120, { steer: run.truck.x < 4.8 ? 1 : 0, shed: false });
    if (i % 60 === 0) out.push(`t=${(i / 120).toFixed(1)} s=${run.truck.s.toFixed(1)} x=${run.truck.x.toFixed(2)} W=${track.halfWidthAt(run.truck.s).toFixed(2)} state=${run.state} banked=${run.stats.banked} col=${dep.collected}`);
  }
  mkdirSync('qa/tmp', { recursive: true });
  writeFileSync(process.env.OUT ?? 'qa/tmp/depot.txt', out.join('\n'));
});
