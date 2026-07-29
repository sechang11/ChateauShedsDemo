// Static server for the built site.
//
// This exists instead of `vite preview` for two reasons, both of which broke
// the Railway deploy:
//
//  * vite is a devDependency, and Railway builds with NODE_ENV=production, so
//    `npm ci` omits it. `vite preview` at boot would fail the same way the
//    build did — "vite: not found" — even after the build itself was fixed.
//  * vite preview is documented as a local preview of a production build, not
//    a production server, and since 5.4.12 it rejects any Host header it was
//    not configured for. That is a sharp edge pointed at every new deploy URL.
//
// Node's http module needs nothing installed, so the runtime image can drop
// every dependency and still serve. There is no SPA fallback on purpose: this
// is a multi-page site and a missing file should 404, not silently render the
// homepage under the wrong URL.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Resolve a request path to a file inside ROOT, or null if it escapes.
 * Vite fingerprints everything under /assets, so those can be cached hard;
 * the HTML entry points must not be, or a redeploy is invisible to anyone who
 * has already visited.
 */
function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded.includes('\0')) return null;
  const rel = normalize(decoded).replace(/^([/\\])+/, '');
  const full = resolve(ROOT, rel);
  // normalize() collapses ../ but a crafted path can still land outside ROOT.
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  return full;
}

async function findFile(full) {
  try {
    const s = await stat(full);
    if (s.isDirectory()) {
      const index = join(full, 'index.html');
      const is = await stat(index);
      return is.isFile() ? index : null;
    }
    return s.isFile() ? full : null;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  const full = resolvePath(req.url || '/');
  if (!full) {
    res.writeHead(400, { 'content-type': 'text/plain' }).end('Bad request');
    return;
  }

  const file = await findFile(full);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }

  const ext = extname(file).toLowerCase();
  const headers = {
    'content-type': TYPES[ext] || 'application/octet-stream',
    // The demo carries the real company's name and addresses; keep the
    // header in step with robots.txt and the per-page meta tag.
    'x-robots-tag': 'noindex, nofollow',
    'cache-control': file.startsWith(join(ROOT, 'assets') + sep)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  };

  if (req.method === 'HEAD') {
    res.writeHead(200, headers).end();
    return;
  }

  res.writeHead(200, headers);
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`Chateau Sheds demo on http://${HOST}:${PORT} (serving ${ROOT})`);
});
