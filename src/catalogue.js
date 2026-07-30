import { syncLock } from './lightbox.js';
import * as THREE from 'three';
import { createMatrix } from './matrix.js';

// The catalogue: every building standing on the grid, as real geometry.
//
// Scrolling travels down the rows rather than orbiting — on the model page
// rotation is the gesture, here it is travel. Hovering lifts a building and
// labels it on the grid; clicking opens its page.
//
// Its own renderer and canvas, so it never has to negotiate with the main
// scene's frame loop over who owns the drawing surface.

const ROW_PX = 460; // scroll distance per row of buildings

export function mountCatalogue(root, { models, categories, matrix, onPick }) {
  const all = [...models, ...matrix];

  root.innerHTML = `
    <div class="mx3-shell">
      <canvas class="mx3-canvas"></canvas>
      <div class="mx3-label" id="mx3-label" hidden></div>
      <div class="mx3-scroll" id="mx3-scroll"><div class="mx3-spacer"></div></div>
      <div class="mx3-head">
        <div>
          <p class="eyelid">Catalogue</p>
          <h2 id="mx3-title">${all.length} buildings</h2>
        </div>
        <button class="cat-close" type="button" aria-label="Close catalogue">Close</button>
      </div>
      <div class="mx3-filters" id="mx3-filters"></div>
      <p class="mx3-hint">Scroll to travel · tap a building to open it</p>
    </div>`;

  const canvas = root.querySelector('.mx3-canvas');
  const scroller = root.querySelector('#mx3-scroll');
  const spacer = root.querySelector('.mx3-spacer');
  const labelEl = root.querySelector('#mx3-label');
  const filtersEl = root.querySelector('#mx3-filters');
  const titleEl = root.querySelector('#mx3-title');

  let renderer = null;
  let mx = null;
  let raf = 0;
  let last = 0;
  let cat = 'all';

  function boot() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    mx = createMatrix(renderer, all, onPick);
    spacer.style.height = `${mx.rows * ROW_PX}px`;
  }

  function resize() {
    if (!renderer) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    mx.resize(w, h);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // A row per frame keeps opening instant even though the field is 35 real
    // buildings; the first rows are on screen before the last are merged.
    if (mx.buildNext()) {
      titleEl.textContent = `${mx.built} of ${mx.total} buildings`;
      if (mx.built === mx.total) titleEl.textContent = `${mx.total} buildings`;
    }
    const max = scroller.scrollHeight - scroller.clientHeight;
    mx.update(max > 0 ? scroller.scrollTop / max : 0, dt);
    mx.render();
  }

  function renderFilters() {
    filtersEl.innerHTML = '';
    const opts = [{ id: 'all', label: 'Everything' }, ...categories.map((c) => ({ id: c.id, label: c.label }))];
    for (const o of opts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cfg-choice';
      b.textContent = o.label;
      b.setAttribute('aria-pressed', String(o.id === cat));
      b.addEventListener('click', () => {
        cat = o.id;
        // Dim rather than reflow — rebuilding the field to close gaps would
        // throw away merged geometry and make filtering feel expensive.
        for (const c of mx.cells) {
          const on = cat === 'all' || c.model.category === cat;
          c.group.traverse((o2) => {
            if (!o2.isMesh) return;
            o2.material.transparent = !on;
            o2.material.opacity = on ? (o2.material.userData.baseOpacity ?? 1) : 0.12;
          });
        }
        renderFilters();
      });
      filtersEl.appendChild(b);
    }
  }

  // --- hover ----------------------------------------------------------------
  scroller.addEventListener('pointermove', (e) => {
    if (!mx) return;
    const r = canvas.getBoundingClientRect();
    const c = mx.pick(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    mx.setHover(c);
    if (!c) {
      labelEl.hidden = true;
      scroller.style.cursor = '';
      return;
    }
    scroller.style.cursor = 'pointer';
    labelEl.hidden = false;
    const m = c.model;
    labelEl.innerHTML = `<b>${m.tab}</b><span>${m.size} · ${m.width * m.depth} sq ft</span><span>${m.price}*</span>`;
    labelEl.style.transform = `translate(${e.clientX - r.left + 18}px, ${e.clientY - r.top + 14}px)`;
  });

  scroller.addEventListener('pointerleave', () => {
    if (mx) mx.setHover(null);
    labelEl.hidden = true;
  });

  // Selection used to read mx.hovered, which only exists while a pointer is
  // resting on a building. Touch has no hover: pointerleave nulls it before the
  // compatibility click fires, so tapping a building on a phone did nothing at
  // all — and "All models" is the only model browser there, since #hero-browse
  // and the tab strip are both hidden. Pick from the release coordinates
  // instead, and ignore releases that were really a scroll or a drag.
  let downX = 0;
  let downY = 0;
  let downScroll = 0;
  let downId = -1;
  scroller.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
    downScroll = scroller.scrollTop;
    downId = e.pointerId;
  });
  scroller.addEventListener('pointerup', (e) => {
    if (!mx || e.pointerId !== downId) return;
    if (Math.abs(scroller.scrollTop - downScroll) > 4) return; // travelled: a scroll
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10) return; // a drag
    const r = canvas.getBoundingClientRect();
    const hit = mx.pick(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    if (hit) onPick(hit.model);
  });

  const close = () => {
    root.classList.remove('open');
    syncLock();
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const open = () => {
    root.classList.add('open');
    syncLock();
    boot();
    renderFilters();
    requestAnimationFrame(() => {
      resize();
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    });
    root.querySelector('.cat-close').focus();
  };

  root.querySelector('.cat-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('open')) close();
  });
  window.addEventListener('resize', resize);

  return { open, close };
}
