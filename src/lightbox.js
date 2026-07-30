import { img } from './content.js';

// Full-screen photo viewer.
//
// These are photographs of buildings someone actually bought and had delivered.
// They're the trust layer on a page that is otherwise all generated geometry,
// so they get to be big.

let el = null;
let list = [];
let index = 0;
let lastFocus = null;

function build() {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'lb';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Photograph viewer');
  el.innerHTML = `
    <button class="lb-close" type="button" aria-label="Close">Close</button>
    <button class="lb-nav lb-prev" type="button" aria-label="Previous photograph">‹</button>
    <figure class="lb-stage">
      <img alt="" />
      <figcaption><span class="lb-count"></span><span class="lb-cap"></span></figcaption>
    </figure>
    <button class="lb-nav lb-next" type="button" aria-label="Next photograph">›</button>`;
  document.body.appendChild(el);

  el.querySelector('.lb-close').addEventListener('click', close);
  el.querySelector('.lb-prev').addEventListener('click', () => step(-1));
  el.querySelector('.lb-next').addEventListener('click', () => step(1));
  el.addEventListener('click', (e) => {
    // Clicking the backdrop closes; clicking the photo or a control doesn't.
    if (e.target === el || e.target.classList.contains('lb-stage')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (!el.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  return el;
}

function show() {
  const item = list[index];
  const image = el.querySelector('img');
  const small = img(item.url, 520, 390);
  const large = img(item.url, 1400, 1050);
  // Open on the thumbnail the grid has already decoded, then upgrade in place.
  // Waiting on a 1400px fetch before showing anything is what made opening a
  // photograph feel sluggish — the pixels were on screen already.
  image.src = small;
  image.dataset.want = large;
  el.classList.remove('loading');
  const full = new Image();
  full.onload = () => {
    // Guard against a fast click-through: only upgrade if still the same photo.
    if (image.dataset.want === large) image.src = large;
  };
  full.src = large;
  image.alt = item.caption || 'Chateau Sheds building';
  el.querySelector('.lb-count').textContent = `${index + 1} / ${list.length}`;
  el.querySelector('.lb-cap').textContent = item.caption || '';
  const single = list.length < 2;
  el.querySelector('.lb-prev').hidden = single;
  el.querySelector('.lb-next').hidden = single;
}

function step(d) {
  if (list.length < 2) return;
  index = (index + d + list.length) % list.length;
  show();
}

export function openLightbox(items, start = 0) {
  build();
  list = items;
  index = Math.max(0, Math.min(start, items.length - 1));
  lastFocus = document.activeElement;
  show();
  el.classList.add('open');
  syncLock();
  el.querySelector('.lb-close').focus();
}

export function close() {
  if (!el) return;
  el.classList.remove('open');
  syncLock();
  // Don't leave a full-size image decoded behind the page.
  el.querySelector('img').src = '';
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

/**
 * Make a container's photos clickable. Re-callable — the delegated handler is
 * bound to the container, not to individual figures, so restocking the strip
 * doesn't need a rebind.
 */
export function bindStrip(container, getItems) {
  if (container.dataset.lbBound) return;
  container.dataset.lbBound = '1';
  // Matches both markups. The gallery moved from `.shot` tiles to `.plate`
  // tiles and this selector wasn't updated, which silently stopped every
  // photograph on the page from opening — the click just did nothing.
  // :not(.belt-video) because the conveyor interleaves link tiles that carry
  // .plate too — counting them shifted every photo after the first video by one,
  // and tiles in the doubled second half indexed past the end of the strip.
  const SEL = '.shot, .plate:not(.belt-video)';
  container.addEventListener('click', (e) => {
    const fig = e.target.closest(SEL);
    if (!fig || !container.contains(fig)) return;
    // Trust the index the builder stamped on the tile; fall back to DOM order
    // for strips whose figures are 1:1 with their items (the story sheets).
    const figures = [...container.querySelectorAll(SEL)];
    const n = Number(fig.dataset.i);
    openLightbox(getItems(), Number.isFinite(n) ? n : figures.indexOf(fig));
  });
}

/**
 * body.locked has four independent owners — this lightbox, the photo archive,
 * the catalogue and the build-story sheet. Each used to add and remove the
 * class outright, so closing the lightbox over a still-open archive unlocked
 * the page underneath it and the idle orbit quietly scrolled away behind the
 * overlay. Derive it from what is actually open instead.
 *
 * '.lb.open' rather than '.lb': the lightbox element is created once and never
 * removed, so a bare '.lb' would lock the page forever.
 */
export function syncLock() {
  const open = document.querySelector('.cat-overlay.open, .lb.open') !== null;
  document.body.classList.toggle('locked', open);
}
