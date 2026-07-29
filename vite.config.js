import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

// Dev-only: lets the page POST a canvas frame to disk so shots can be reviewed
// outside the browser. Never runs in a production build.
function shotSink() {
  return {
    name: 'shot-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') return res.end('post only');
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const { name, data } = JSON.parse(body);
          const dir = resolve(server.config.root, '.shots');
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, `${name}.png`), Buffer.from(data, 'base64'));
          res.end('ok');
        });
      });
    },
  };
}

// Dev-only: a sink for harvested source content, so a scrape can be dropped to
// disk without round-tripping through the console.
function contentSink() {
  return {
    name: 'content-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__content', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        if (req.method === 'OPTIONS') return res.end();
        if (req.method !== 'POST') return res.end('post only');
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const dir = resolve(server.config.root, '.harvest');
          mkdirSync(dir, { recursive: true });
          const { name, data } = JSON.parse(body);
          writeFileSync(resolve(dir, `${name}.json`), JSON.stringify(data, null, 2));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [shotSink(), contentSink()],
  build: {
    rollupOptions: {
      // Multi-page: each standalone page is its own entry so it ships as real
      // HTML rather than being reachable only through the SPA.
      input: {
        main: resolve(__dirname, 'index.html'),
        faq: resolve(__dirname, 'faq.html'),
        inventory: resolve(__dirname, 'inventory.html'),
        built: resolve(__dirname, 'built.html'),
      },
    },
  },
});
