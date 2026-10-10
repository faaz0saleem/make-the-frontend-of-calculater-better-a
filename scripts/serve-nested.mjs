// Serves a production build under a nested path inside an iframe host page, like a game portal.
// Usage: node scripts/serve-nested.mjs [distDir] [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4180);
const BASE = '/games/wobble-haul/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.json': 'application/json' };
const host = (q) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Portal host (test)</title>
<style>html,body{margin:0;height:100%;background:#111;overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>
<body><iframe id="game-frame" src="${BASE}index.html${q}" allow="autoplay; fullscreen; gamepad" title="game"></iframe></body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  if (url.pathname === '/' || url.pathname === '/host.html') {
    const q = url.searchParams.get('q') ?? '?qa=1&platform=standalone';
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(host(q));
  }
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404);
    return res.end('not found');
  }
  const rel = normalize(url.pathname.slice(BASE.length) || 'index.html').replace(/^(\.\.[/\\])+/, '');
  const file = join(dist, rel);
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('dir');
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(port, () => console.log(`serving ${dist} at http://localhost:${port}${BASE} (host page at /)`));
