import { OPTIONS, SWATCHES, COLORWAYS } from './catalog.js';

// The configurator panel.
//
// Two kinds of change, deliberately separated: anything that alters geometry
// rebuilds the model, anything that only alters color writes straight to the
// existing materials. Recoloring a 300-mesh building by rebuilding it would be
// visibly janky on a slider drag.

const SLIDERS = [
  ['width', 'Width'],
  ['depth', 'Depth'],
  ['wallHeight', 'Wall height'],
  ['windows', 'Windows'],
  ['porch', 'Porch'],
];

const fmt = (key, v) => {
  const o = OPTIONS[key];
  const n = key === 'wallHeight' ? (v % 1 ? v.toFixed(1) : v) : v;
  return `${n}${o.unit}`;
};

export function mountConfigurator(root, state, { onGeometry, onColor }) {
  root.innerHTML = '';
  const refs = {};

  const group = (label) => {
    const g = document.createElement('div');
    g.className = 'cfg-group';
    const h = document.createElement('span');
    h.className = 'cfg-label';
    h.textContent = label;
    g.appendChild(h);
    root.appendChild(g);
    return g;
  };

  // --- sliders --------------------------------------------------------------
  for (const [key, label] of SLIDERS) {
    const o = OPTIONS[key];
    const g = group(label);
    const row = document.createElement('div');
    row.className = 'cfg-row';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = o.min;
    input.max = o.max;
    input.step = o.step;
    input.value = state[key];
    input.setAttribute('aria-label', label);

    const out = document.createElement('output');
    out.textContent = fmt(key, state[key]);

    input.addEventListener('input', () => {
      state[key] = parseFloat(input.value);
      // Porch can't be deeper than the building it's cut out of.
      if (state.porch > state.depth - 6) {
        state.porch = Math.max(0, state.depth - 6);
        refs.porch.input.value = state.porch;
        refs.porch.out.textContent = fmt('porch', state.porch);
      }
      out.textContent = fmt(key, state[key]);
      onGeometry();
    });

    row.append(input, out);
    g.appendChild(row);
    refs[key] = { input, out };
  }

  // --- choices --------------------------------------------------------------
  for (const [key, label] of [
    ['roof', 'Roofline'],
    ['door', 'Doors'],
  ]) {
    const g = group(label);
    const row = document.createElement('div');
    row.className = 'cfg-choices';
    const buttons = [];
    for (const opt of OPTIONS[key]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cfg-choice';
      b.textContent = opt.label;
      b.setAttribute('aria-pressed', String(state[key] === opt.value));
      b.addEventListener('click', () => {
        state[key] = opt.value;
        buttons.forEach((x) =>
          x.setAttribute('aria-pressed', String(x.dataset.value === opt.value))
        );
        onGeometry();
      });
      b.dataset.value = opt.value;
      buttons.push(b);
      row.appendChild(b);
    }
    g.appendChild(row);
    refs[key] = { buttons };
  }

  // --- named colorways ------------------------------------------------------
  {
    const g = group('Colorway');
    const row = document.createElement('div');
    row.className = 'cfg-ways';
    const chips = [];
    for (const way of COLORWAYS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cfg-way';
      b.dataset.id = way.id;
      b.title = way.name;
      b.innerHTML = `
        <span class="way-swatches">
          ${['siding', 'roof', 'door']
            .map((k) => `<i style="background:${way.colors[k]}"></i>`)
            .join('')}
        </span>
        <span class="way-name">${way.name}</span>`;
      b.addEventListener('click', () => {
        Object.assign(state.colors, way.colors);
        chips.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.id === way.id)));
        // Repaint every family at once, then refresh the individual swatches.
        for (const key of ['siding', 'trim', 'roof', 'door']) onColor(key, way.colors[key]);
        syncSwatches(state);
      });
      chips.push(b);
      row.appendChild(b);
    }
    g.appendChild(row);
    refs.ways = { chips };
  }

  // --- colors ---------------------------------------------------------------
  for (const [key, label] of [
    ['siding', 'Siding'],
    ['trim', 'Trim'],
    ['roof', 'Roof'],
    ['door', 'Door'],
  ]) {
    const g = group(label);
    const row = document.createElement('div');
    row.className = 'cfg-swatches';
    const chips = [];
    for (const hex of SWATCHES[key]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cfg-swatch';
      b.style.background = hex;
      b.dataset.hex = hex;
      b.title = `${label} ${hex}`;
      b.setAttribute('aria-label', `${label} ${hex}`);
      b.setAttribute('aria-pressed', String(state.colors[key] === hex));
      b.addEventListener('click', () => {
        state.colors[key] = hex;
        chips.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.hex === hex)));
        onColor(key, hex);
      });
      chips.push(b);
      row.appendChild(b);
    }
    g.appendChild(row);
    refs[`${key}Color`] = { chips };
  }

  /** Push the working colors back onto the swatch and colorway controls. */
  function syncSwatches(next) {
    for (const key of ['siding', 'trim', 'roof', 'door']) {
      refs[`${key}Color`].chips.forEach((c) =>
        c.setAttribute('aria-pressed', String(c.dataset.hex === next.colors[key]))
      );
    }
    const match = COLORWAYS.find((w) =>
      ['siding', 'trim', 'roof', 'door'].every((k) => w.colors[k] === next.colors[k])
    );
    refs.ways.chips.forEach((c) =>
      c.setAttribute('aria-pressed', String(!!match && c.dataset.id === match.id))
    );
  }

  /** Re-sync every control after the model is switched from the tab bar. */
  function sync(next) {
    for (const [key] of SLIDERS) {
      if (!refs[key]) continue;
      refs[key].input.value = next[key];
      refs[key].out.textContent = fmt(key, next[key]);
    }
    for (const key of ['roof', 'door']) {
      refs[key].buttons.forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.value === next[key]))
      );
    }
    syncSwatches(next);
  }

  syncSwatches(state);
  return { sync };
}
