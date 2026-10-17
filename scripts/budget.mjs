// Bundle budget check against CrazyGames limits (see CRAZYGAMES_COMPLIANCE.md).
// Usage: node scripts/budget.mjs [distDir]
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = process.argv[2] ?? 'dist';
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else files.push({ path: relative(dir, p), bytes: s.size, gz: gzipSync(readFileSync(p)).length });
  }
};
walk(dir);
const total = files.reduce((a, f) => a + f.bytes, 0);
// Initial download: everything the page loads before gameplay (index.html, all JS/CSS + the woff2
// fonts the CSS references). The .woff fallbacks are only fetched by browsers without woff2 support,
// and licenses/ holds notice texts the page never requests.
const initial = files.filter((f) => !f.path.endsWith('.woff') && !f.path.startsWith('licenses/')).reduce((a, f) => a + f.bytes, 0);
const MB = 1024 * 1024;
const limits = { totalBytes: 250 * MB, files: 1500, initialBytes: 50 * MB, mobileInitialBytes: 20 * MB };
const sourceMaps = files.filter((f) => f.path.endsWith('.map'));
const report = {
  dir, fileCount: files.length, totalBytes: total, initialBytes: initial,
  totalMB: +(total / MB).toFixed(3), initialMB: +(initial / MB).toFixed(3),
  gzipTotalMB: +(files.reduce((a, f) => a + f.gz, 0) / MB).toFixed(3),
  checks: {
    total_le_250MB: total <= limits.totalBytes,
    files_le_1500: files.length <= limits.files,
    initial_le_50MB: initial <= limits.initialBytes,
    mobile_initial_le_20MB: initial <= limits.mobileInitialBytes,
    // Without the SDK the whole bundle counts as the initial download.
    total_le_20MB_without_sdk: total <= limits.mobileInitialBytes,
    no_source_maps: sourceMaps.length === 0,
    index_at_root: files.some((f) => f.path === 'index.html'),
  },
  files: files.sort((a, b) => b.bytes - a.bytes),
};
const html = readFileSync(join(dir, 'index.html'), 'utf8');
report.checks.relative_asset_paths = !/(src|href)="\/(?!\/)/.test(html);
// Development tools must be compiled out of the shipped JS (strings unique to the dev platform/overlay).
const js = files.filter((f) => f.path.endsWith('.js')).map((f) => readFileSync(join(dir, f.path), 'utf8')).join('\n');
report.checks.no_dev_platform = !/DUPLICATE gameplayStart|dev platform \(simulated\)/.test(js);
report.checks.no_dev_overlay = !js.includes('dev-overlay');
// Third-party notices ship inside the bundle.
report.checks.licenses_present = ['licenses/Fredoka-OFL-1.1.txt', 'licenses/three.js-MIT.txt'].every((l) => files.some((f) => f.path === l));
console.log(JSON.stringify({ ...report, files: report.files.slice(0, 12) }, null, 2));
writeFileSync('qa/budget.json', JSON.stringify(report, null, 2));
const failed = Object.entries(report.checks).filter(([, v]) => !v);
if (failed.length) {
  console.error('BUDGET FAILED:', failed.map(([k]) => k).join(', '));
  process.exit(1);
}
