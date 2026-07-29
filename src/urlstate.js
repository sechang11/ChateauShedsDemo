// The configured build, encoded into the querystring.
//
// This is what makes a configuration shareable: a customer can send their build
// to the lot, and the lot can send options back, without either side needing an
// account. Keys are short because the URL ends up in text messages.

const KEYS = {
  m: 'id',
  w: 'width',
  d: 'depth',
  h: 'wallHeight',
  r: 'roof',
  dr: 'door',
  n: 'windows',
  p: 'porch',
};
const COLOR_KEYS = { cs: 'siding', ct: 'trim', cr: 'roof', cd: 'door' };
const NUMERIC = new Set(['width', 'depth', 'wallHeight', 'windows', 'porch']);

export function encode(model) {
  const q = new URLSearchParams();
  for (const [short, key] of Object.entries(KEYS)) {
    if (model[key] !== undefined) q.set(short, String(model[key]));
  }
  for (const [short, key] of Object.entries(COLOR_KEYS)) {
    const hex = model.colors[key];
    if (hex) q.set(short, hex.replace('#', ''));
  }
  return q.toString();
}

/**
 * Read a build out of the URL. Returns null when there's nothing to read, and
 * silently ignores anything malformed -- a mangled link should still open the
 * site, not a broken configurator.
 */
export function decode(search, baseById) {
  const q = new URLSearchParams(search);
  const id = q.get('m');
  if (!id) return null;
  const base = baseById(id);
  if (!base) return null;

  const model = { ...base, colors: { ...base.colors } };
  for (const [short, key] of Object.entries(KEYS)) {
    if (key === 'id' || !q.has(short)) continue;
    const raw = q.get(short);
    if (NUMERIC.has(key)) {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) model[key] = n;
    } else {
      model[key] = raw;
    }
  }
  for (const [short, key] of Object.entries(COLOR_KEYS)) {
    const hex = q.get(short);
    if (hex && /^[0-9a-f]{6}$/i.test(hex)) model.colors[key] = `#${hex}`;
  }
  return { model, baseId: id };
}

/** Keep the address bar current without stacking history entries. */
export function sync(model) {
  const url = `${location.pathname}?${encode(model)}${location.hash}`;
  history.replaceState(null, '', url);
}

export function shareUrl(model) {
  return `${location.origin}${location.pathname}?${encode(model)}`;
}
