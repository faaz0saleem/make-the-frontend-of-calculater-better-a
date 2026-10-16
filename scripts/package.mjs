// Creates the CrazyGames upload ZIP with index.html at the archive root.
// Usage: node scripts/package.mjs [distDir] [label]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const label = process.argv[3] ?? (process.env.RELEASE_STAGE ?? 'basic');
if (!existsSync(resolve(dist, 'index.html'))) throw new Error(`no index.html in ${dist}; run the build first`);
const bad = readdirSync(dist, { recursive: true }).filter((f) => String(f).endsWith('.map'));
if (bad.length) throw new Error(`source maps found: ${bad.join(', ')}`);
mkdirSync('release', { recursive: true });
const out = resolve('release', `overloaded-${label}.zip`);
rmSync(out, { force: true });
// -X strips extra file attributes; run inside dist so index.html is at the root of the archive
execFileSync('zip', ['-r', '-X', '-9', out, '.', '-x', '*.DS_Store'], { cwd: dist, stdio: 'inherit' });
const listing = execFileSync('unzip', ['-l', out]).toString();
console.log(listing);
if (!/\s index\.html\n/.test(listing)) throw new Error('index.html is not at the ZIP root');
console.log(`wrote ${out}`);
