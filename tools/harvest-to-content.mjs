// Turns a raw scrape of chateaushedsoutdoorstructures.com into the content
// module the site reads.
//
//   node tools/harvest-to-content.mjs
//
// Input:  .harvest/chateau-site.json  (see README — "Re-harvesting")
// Output: content/source/*.txt        verbatim record, one file per page
//         src/content.js              what the site actually imports
//
// Re-runnable: when the live site changes, re-scrape and re-run this. Nothing
// downstream is hand-edited, so nothing gets lost in a refresh.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(resolve(ROOT, '.harvest/chateau-site.json'), 'utf8'));

// Wix repeats the whole nav on every page before the real content.
const NAV_END = 'Use tab to navigate through the menu items.';
const FOOTER_MARKERS = [
  'Accessibility Statement',
  '©',
  'Chateau Sheds. All Rights Reserved',
  'bottom of page',
];

function stripChrome(text) {
  let t = text;
  const i = t.indexOf(NAV_END);
  if (i >= 0) t = t.slice(i + NAV_END.length);
  for (const m of FOOTER_MARKERS) {
    const j = t.indexOf(m);
    if (j > 200) t = t.slice(0, j);
  }
  return t.trim();
}

/**
 * The SSR markup collapses paragraphs, so split on sentence-ish boundaries
 * where a capital letter follows a full stop with no space, plus explicit
 * newlines. Good enough to get readable blocks back.
 */
function blocks(text) {
  return text
    .replace(/([.!?])(?=[A-Z])/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}

/** Pull question/answer pairs out of the FAQ page. */
function parseFaq(text) {
  const out = [];
  // Questions are short and end in '?'; the answer runs to the next question.
  const parts = text.split(/(?=[A-Z][^?]{8,120}\?)/g);
  for (const p of parts) {
    const m = p.match(/^([A-Z][^?]{8,120}\?)\s*(.*)$/s);
    if (!m) continue;
    const answer = m[2].replace(/\s+/g, ' ').trim();
    if (answer.length < 40) continue;
    out.push({ q: m[1].trim(), a: answer.slice(0, 600) });
  }
  return out;
}

// Images that appear on many pages are site chrome (logo, badges), not content.
const seen = {};
for (const v of Object.values(raw)) for (const i of v.images || []) seen[i] = (seen[i] || 0) + 1;
const isContent = (u) => seen[u] < 10;

/** Wix resizes on the fly — never ship the 2.8 MB originals. */
const sized = (u, w, h) => `${u}/v1/fill/w_${w},h_${h},al_c,q_80/file.jpg`;

const pages = {};
const sourceDir = resolve(ROOT, 'content/source');
rmSync(sourceDir, { recursive: true, force: true });
mkdirSync(sourceDir, { recursive: true });

for (const [key, v] of Object.entries(raw)) {
  if (v.error) continue;
  const text = stripChrome(v.text || '');
  writeFileSync(resolve(sourceDir, `${key}.txt`), text);
  pages[key] = {
    path: v.path,
    blocks: blocks(text),
    images: (v.images || []).filter(isContent),
    video: v.wixVideo || [],
  };
}

// --- galleries -------------------------------------------------------------
// Dedicated image pages are the cleanest source; product pages backfill.
const gallery = {
  sheds: [...new Set([...(pages['shed-images']?.images || []), ...(pages['old-hickory-sheds']?.images || [])])],
  saunas: [...new Set([...(pages['sauna-images']?.images || []), ...(pages['outdoor-saunas']?.images || [])])],
  garages: [...new Set([...(pages['garage-images']?.images || []), ...(pages['garages']?.images || []), ...(pages['double-wide']?.images || [])])],
  animal: [...new Set([...(pages['animal-structures']?.images || []), ...(pages['dog-kennels']?.images || []), ...(pages['chicken-coops']?.images || [])])],
  growing: [...new Set(pages['greenhouses']?.images || [])],
  mixed: [...new Set(pages['gallery']?.images || [])],
};

const videos = {
  sauna: pages['sauna-walkthroughs']?.video || [],
  shed: [...new Set([...(pages['shed-walkthroughs']?.video || []), ...(pages['shed-info-videos']?.video || [])])],
};

const faq = parseFaq(stripChrome(raw.faq?.text || ''));

const banner = `// GENERATED — do not edit by hand.
// Built by tools/harvest-to-content.mjs from a scrape of
// chateaushedsoutdoorstructures.com. Verbatim source lives in content/source/.
//
// This is the client's own copy and their own media, being moved onto their own
// new site. Two things to settle before launch:
//   1. Publishing this text verbatim on a second domain creates duplicate
//      content and can suppress one of the two in search. Rewrite or redirect.
//   2. Images hotlink Wix's CDN. Fine for a sample, not for production —
//      re-host them. Videos are 403 on direct access and can't be embedded at
//      all without re-hosting or moving to YouTube.
`;

const js = `${banner}
/** Every page's prose, nav and footer stripped, split into readable blocks. */
export const PAGES = ${JSON.stringify(pages, null, 2)};

/** Photographs grouped to the categories the site uses. */
export const GALLERY = ${JSON.stringify(gallery, null, 2)};

/** Wix video ids. Direct access returns 403 — see the note above. */
export const VIDEOS = ${JSON.stringify(videos, null, 2)};

/** Question and answer pairs lifted from the FAQ page. */
export const FAQ = ${JSON.stringify(faq, null, 2)};

/** Build a sized Wix CDN URL. Originals run to ~3 MB; always size them. */
export const img = (url, w = 600, h = 450) =>
  \`\${url}/v1/fill/w_\${w},h_\${h},al_c,q_80/file.jpg\`;
`;

writeFileSync(resolve(ROOT, 'src/content.js'), js);

console.log(`pages       ${Object.keys(pages).length}`);
console.log(`source txt  content/source/*.txt`);
console.log(`faq pairs   ${faq.length}`);
for (const [k, v] of Object.entries(gallery)) console.log(`gallery ${k.padEnd(8)} ${v.length}`);
console.log(`videos      sauna ${videos.sauna.length}, shed ${videos.shed.length}`);
console.log(`sample      ${sized(gallery.sheds[0] || '', 600, 450)}`);
