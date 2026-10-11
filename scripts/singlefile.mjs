// Packs a production build into ONE self-contained HTML file (JS, CSS and fonts inlined) that runs
// when opened straight from disk (file://), for quick local testing. It is not the upload format:
// CrazyGames gets the ZIP from scripts/package.mjs.
// Usage: node scripts/singlefile.mjs [distDir] [out]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const out = process.argv[3] ?? 'release/wobble-haul-browser-test.html';
let html = readFileSync(join(dist, 'index.html'), 'utf8');

const FONT_TYPES = { '.woff2': 'font/woff2', '.woff': 'font/woff' };

html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, href) => {
  const cssPath = join(dist, href);
  let css = readFileSync(cssPath, 'utf8');
  css = css.replace(/url\(([^)]+)\)/g, (m, raw) => {
    const ref = raw.replace(/["']/g, '');
    if (ref.startsWith('data:')) return m;
    const ext = Object.keys(FONT_TYPES).find((e) => ref.endsWith(e));
    const file = join(dirname(cssPath), ref);
    if (!ext || !existsSync(file)) return m;
    return `url(data:${FONT_TYPES[ext]};base64,${readFileSync(file).toString('base64')})`;
  });
  return `<style>${css}</style>`;
});

html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const js = readFileSync(join(dist, src), 'utf8');
  if (/<\/script|<!--/i.test(js)) throw new Error('bundle contains a sequence that cannot be inlined safely');
  return `<script type="module">${js}</script>`;
});

if (/(src|href)="\.\/assets\//.test(html)) throw new Error('an asset reference was not inlined');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
