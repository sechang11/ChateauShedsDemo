import { createScene } from './scene.js';
import { buildShed, disposeShed, setCutaway } from './shed.js';
import {
  buildDimensions,
  disposeDimensions,
  layoutLabels,
  setDimensionOpacity,
} from './annotations.js';
import { mountConfigurator } from './configurator.js';
import { mountCatalogue } from './catalogue.js';
import { createEnvironment, applySeason, seasonAt, skyGradient, MODES } from './environment.js';
import { attachControls, ZOOM_MIN, ZOOM_MAX } from './controls.js';
import { createAmbient } from './ambient.js';
import { openLightbox, bindStrip } from './lightbox.js';
import { decode, sync as syncUrl, shareUrl } from './urlstate.js';
import { CATEGORIES, MODELS, MATRIX, byId, inCategory } from './catalog.js';
import { GALLERY, FAQ, img } from './content.js';

// Reduced-motion, but read live rather than latched at load, and split in two.
// The thing that setting exists to prevent is unexpected PAGE movement, so the
// self-scrolling orbit stays off. Snow falling inside a canvas is not that, and
// killing it outright meant anyone with the OS setting on saw a dead scene with
// no explanation and no way to opt in.
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let REDUCED = reduceQuery.matches;
// On by default, per the brief: the effects are the point of the page. The
// toggle still appears when the OS asks for reduced motion so it can be turned
// back off, and page-level auto-scroll is the thing it governs.
let motionOverride = true;

const prefersReduced = () => REDUCED && !motionOverride;
/** Page-level motion: auto-scroll, camera damping. Always respects the setting. */
const noPageMotion = () => prefersReduced();
/** In-canvas ambience: weather, birds. Damped rather than removed. */
const ambienceScale = () => (prefersReduced() ? 0.45 : 1);

reduceQuery.addEventListener('change', (e) => {
  REDUCED = e.matches;
  updateMotionUI();
});
const rad = (d) => (d * Math.PI) / 180;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// One camera keyframe per section. Azimuth climbs monotonically so scrolling
// the page walks you once around the building.
// Three sections, two decisive 120-degree turns. The old eight-stop version
// crept round in 25-30 degree increments, which read as drift rather than as
// the building being shown to you from a new side.
// These climb; they must not be written as their negative equivalents. 154 and
// 274 are the same two sides as -206 and -86, but reaching them by counting DOWN
// walks the building backwards past them, and left the azimuth run descending —
// which is the opposite of what scrollForAz and autoDir below both assume.
const SHOTS = [
  { id: 's-hero', az: 34, el: 9, dist: 40, targetY: 5.0, panX: -6.5 },
  { id: 's-build', az: 154, el: 11, dist: 46, targetY: 5.0, panX: -7.0 },
  // Middle third only — hence the pull-back and no lateral offset.
  { id: 's-final', az: 274, el: 13, dist: 66, targetY: 5.0, panX: 0 },
];

// Dimensions annotate the size-and-specify section. The framing cutaway used to
// be its own scroll section; it's a toggle now, so it isn't tied to a shot.
const DIMENSION_SECTION = 1;
// Where the seasons hand back to the white grid, as a fraction of the scroll.
const GRID_AT = 0.86;
const OUT_FOV = 32;
const IN_FOV = 74;

// The line spans 6x8 up to 24x32, so a fixed camera distance would frame them
// wildly differently. Shot distances scale off the footprint diagonal, keyed to
// The Chateau as 1.0.
const REF_DIAG = Math.hypot(12, 20);
const fitFor = (m) => Math.hypot(m.width, m.depth) / REF_DIAG;

const ROOF_LABEL = { gable: 'Gable', gambrel: 'Barn / gambrel', lean: 'Single slope' };
const DOOR_LABEL = {
  single: 'Single',
  barn: 'Double barn',
  rollup: 'Roll-up',
  sauna: 'Glass',
  none: 'Open front',
};

const canvas = document.getElementById('stage');
const dimLayer = document.getElementById('dim-layer');
const sections = SHOTS.map((s) => document.getElementById(s.id));

let stage = null;
try {
  stage = createScene(canvas);
} catch (err) {
  console.warn('WebGL unavailable, falling back to flat layout.', err);
  canvas.style.display = 'none';
  document.body.classList.add('no-3d');
}

const lot = stage ? createEnvironment(stage.scene) : null;

// Ambient life reads the live scene each frame rather than being pushed state,
// so it can never drift out of step with the season or the camera.
let lastCamDist = 40;
const ambient = stage
  ? createAmbient(stage.scene, () => ({
      season: currentSeason,
      camDist: lastCamDist,
      camAz: rad(current.az),
      reduced: prefersReduced() && ambienceScale() === 0,
      enabled: mode === 'seasons' && !inGridTail,
    }))
  : null;

/* ------------------------------------------------------------------- state */

const cloneModel = (m) => ({ ...m, colors: { ...m.colors } });

/** Read the saved default. Must be defined before it is used at module init. */
function readSaved() {
  try {
    const raw = localStorage.getItem('chateau:build');
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && v.base && v.model ? v : null;
  } catch {
    return null;
  }
}

// A shared link wins over the default on first load.
const fromUrl = decode(location.search, byId);
const saved = fromUrl ? null : readSaved();
let active = fromUrl ? byId(fromUrl.baseId) : byId(saved?.base || 'chateau');

// `working` must keep its identity for the life of the page: the configurator
// closes over this exact object. Reassigning it on a model switch orphaned the
// controls -- they carried on writing to the old object while the renderer read
// the new one, so every slider silently did nothing after changing model.
const working = fromUrl ? fromUrl.model : saved?.model || cloneModel(active);

function setWorking(model) {
  const next = cloneModel(model);
  for (const k of Object.keys(working)) delete working[k];
  Object.assign(working, next);
}

// Seasons is the default now: the animals, weather and specials are the point
// of the page, and none of them run on the plain grid.
let mode = 'seasons'; // grid | seasons
let framing = false;
let framingMix = 0;
let currentSeason = 'spring';
let interior = false;
let interiorMix = 0;
let zoom = 1;
// Set while a drag is in flight, so the spin accumulates smoothly instead of
// re-reading a scroll position it is itself changing.
let spinAz = null;
// Set while the pointer is over the photography. The page turning itself under
// someone who is studying a photograph is the single most annoying thing the
// idle orbit can do, and unlike a click it should resume the moment they leave
// rather than sitting out the full idle timeout.
let hoverPause = false;
// True once the year has handed back to the grid — everything living switches
// off there, so the final screen is only the grid.
let inGridTail = false;
// 0..1 as the grid takes over; lifts the camera so the grid reads as a grid.
let gridLift = 0;

/* ---------------------------------------------------------------- content */

function setText(key, value) {
  document.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => {
    el.textContent = value;
  });
}

function bindCopy() {
  const cat = CATEGORIES.find((c) => c.id === active.category);
  setText('categoryLabel', cat ? cat.label : '');
  setText('tab', active.tab);
  setText('tagline', active.tagline);
  setText('blurb', active.blurb);
  setText('size', active.size);
  setText('price', active.price);
  setText('roofLabel', ROOF_LABEL[active.roof]);
  document.documentElement.style.setProperty('--accent', active.accent);
}

/** A one-line description of the configured build, for the quote and the URL. */
function buildSummary() {
  const sq = Math.round(working.width * working.depth);
  return [
    `${active.tab} (${working.width}' × ${working.depth}', ${sq} sq ft)`,
    `Wall height ${working.wallHeight}'`,
    `Roofline ${ROOF_LABEL[working.roof]}`,
    `Doors ${DOOR_LABEL[working.door]}`,
    `Windows ${working.windows}`,
    working.porch ? `Porch ${working.porch}'` : 'No porch',
    `Siding ${working.colors.siding}, trim ${working.colors.trim}, roof ${working.colors.roof}, door ${working.colors.door}`,
  ].join('\n');
}

/** Figures that track the configurator rather than the catalog entry. */
function bindSpecs() {
  const sq = Math.round(working.width * working.depth);
  setText('dimW', `${working.width}'`);
  setText('dimD', `${working.depth}'`);
  setText('dimH', `${working.wallHeight}'`);
  setText('dimSq', String(sq));
  setText('cfgSize', `${working.width}' × ${working.depth}'`);
  setText('cfgSq', `${sq} sq ft`);
  setText('cfgRoof', `${ROOF_LABEL[working.roof]}, ${DOOR_LABEL[working.door]}`);
  if (shed) setText('cfgPeak', `${shed.userData.peakY.toFixed(1)}'`);

  // The hero doubles as the building's own page, so it carries the full spec.
  setText('heroSq', `${sq} sq ft`);
  setText('heroWall', `${working.wallHeight}'`);
  if (shed) setText('heroPeak', `${shed.userData.peakY.toFixed(1)}'`);
  setText('heroDoor', DOOR_LABEL[working.door]);
  setText('heroWin', String(working.windows));
  setText('heroPorch', working.porch ? `${working.porch}'` : 'None');

  const q = document.getElementById('q-build');
  if (q) {
    q.innerHTML = `<span class="cfg-label">Attached to this enquiry</span>${buildSummary()
      .split('\n')
      .map((l) => `<span>${l}</span>`)
      .join('')}`;
  }
}

/* ------------------------------------------------------------------- tabs */

const catBar = document.getElementById('cats');
const tabBar = document.getElementById('tabs');

CATEGORIES.forEach((c) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cat';
  b.dataset.id = c.id;
  b.textContent = c.label;
  b.addEventListener('click', () => {
    const first = inCategory(c.id)[0];
    if (first) select(first);
  });
  catBar.appendChild(b);
});

function renderTabs() {
  tabBar.innerHTML = '';
  for (const m of inCategory(active.category)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'tab';
    b.className = 'tab';
    b.dataset.id = m.id;
    b.setAttribute('aria-selected', String(m.id === active.id));
    b.innerHTML = `<span class="swatch" style="background:${m.colors.siding}"></span>${m.tab}`;
    b.addEventListener('click', () => select(m));
    tabBar.appendChild(b);
  }
  catBar.querySelectorAll('.cat').forEach((c) =>
    c.setAttribute('aria-pressed', String(c.dataset.id === active.category))
  );
}

function select(model) {
  if (model.id === active.id) return;
  active = model;
  setWorking(model);
  renderTabs();
  bindCopy();
  rebuild(true);
  cfg && cfg.sync(working);
  scheduleSync();
  renderPlates(); // photography follows the category
}

/* ------------------------------------------------------------------ model */

let shed = null;
let dims = null;
let dimNodes = [];

/**
 * The only place a building gets created. Swapping the procedural builder for
 * a GLTFLoader later means changing these few lines and nothing else.
 */
function makeShed(model) {
  return buildShed(model);
}

function setGroupOpacity(group, v) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      // Scale from the material's intended opacity, not to a flat 1 -- driving
      // every material to 1 turns the greenhouse glazing permanently opaque.
      const base = m.userData.baseOpacity ?? 1;
      m.opacity = base * v;
      m.transparent = m.opacity < 0.999;
      m.depthWrite = m.opacity > 0.95;
    });
  });
}

function tween(ms, onUpdate, onDone) {
  if (noPageMotion()) {
    onUpdate(1);
    onDone && onDone();
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    onUpdate(t < 1 ? 1 - Math.pow(1 - t, 3) : 1);
    if (t < 1) requestAnimationFrame(step);
    else onDone && onDone();
  };
  requestAnimationFrame(step);
}

function buildLabels() {
  dimLayer.innerHTML = '';
  dimNodes = dims.userData.labels.map((l) => {
    const el = document.createElement('span');
    el.className = 'dim-label';
    el.textContent = l.text;
    dimLayer.appendChild(el);
    return el;
  });
}

/**
 * Rebuild the building and its dimension lines. `animate` is for tab changes;
 * configurator edits go through instantly, because a 500ms fade on every slider
 * tick would read as lag rather than polish.
 */
function rebuild(animate) {
  if (!stage) return;
  const outgoing = animate ? shed : null;
  if (!animate && shed) {
    stage.scene.remove(shed);
    disposeShed(shed);
  }
  if (dims) {
    stage.scene.remove(dims);
    disposeDimensions(dims);
  }

  const incoming = makeShed(working);
  stage.scene.add(incoming);
  shed = incoming;

  dims = buildDimensions(working, incoming.userData.peakY, incoming.userData.eaveY);
  stage.scene.add(dims);
  buildLabels();
  bindSpecs();

  if (!animate) return;

  incoming.scale.setScalar(0.94);
  incoming.position.y = 0.6;
  setGroupOpacity(incoming, 0);

  if (outgoing) {
    tween(
      260,
      (t) => {
        setGroupOpacity(outgoing, 1 - t);
        outgoing.scale.setScalar(1 - 0.05 * t);
        outgoing.position.y = -0.5 * t;
      },
      () => {
        stage.scene.remove(outgoing);
        disposeShed(outgoing);
      }
    );
  }

  tween(520, (t) => {
    setGroupOpacity(incoming, t);
    incoming.scale.setScalar(0.94 + 0.06 * t);
    incoming.position.y = 0.6 * (1 - t);
  });
}

/* ----------------------------------------------------------- configurator */

let pendingRebuild = false;
function scheduleRebuild() {
  if (pendingRebuild) return;
  pendingRebuild = true;
  requestAnimationFrame(() => {
    pendingRebuild = false;
    rebuild(false);
    measure();
    syncUrl(working);
  });
}

let pendingSync = false;
function scheduleSync() {
  if (pendingSync) return;
  pendingSync = true;
  requestAnimationFrame(() => {
    pendingSync = false;
    syncUrl(working);
    bindSpecs();
  });
}

const cfg = mountConfigurator(document.getElementById('cfg'), working, {
  onGeometry: scheduleRebuild,
  onColor: (key, hex) => {
    // Colors write straight to the live materials -- no rebuild, no flicker.
    const mats = shed && shed.userData.materials;
    if (mats && mats[key]) mats[key].color.set(hex);
    scheduleSync();
  },
});

document.getElementById('cfg-reset').addEventListener('click', () => {
  setWorking(active);
  cfg.sync(working);
  rebuild(false);
  syncUrl(working);
});

const shareNote = document.getElementById('cfg-share-note');
document.getElementById('cfg-share').addEventListener('click', async () => {
  const url = shareUrl(working);
  try {
    await navigator.clipboard.writeText(url);
    shareNote.textContent = 'Link copied — it opens this exact build.';
  } catch {
    // Clipboard needs a secure context and permission; fall back to showing it.
    shareNote.textContent = url;
  }
});

/* -------------------------------------------------------------- catalogue */

const catalogue = mountCatalogue(document.getElementById('catalogue'), {
  models: MODELS,
  categories: CATEGORIES,
  matrix: MATRIX,
  onPick: (m) => {
    // Selecting a building takes you to its page — which is this page, with
    // that building on the grid and every spec, photo and control attached.
    select(m);
    catalogue.close();
    window.scrollTo({ top: 0, behavior: 'auto' });
  },
});
document.getElementById('open-catalogue').addEventListener('click', catalogue.open);
document.getElementById('hero-browse').addEventListener('click', catalogue.open);

/* ------------------------------------------------------------ view toggles */

const viewbar = document.getElementById('viewbar');

const envGroup = viewbar.querySelector('[data-group="env"]');
MODES.forEach((m) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.mode = m.id;
  b.textContent = m.label;
  b.setAttribute('aria-pressed', String(m.id === mode));
  envGroup.appendChild(b);
});

const seasonBadge = document.getElementById('season-badge');
let lastSky = '';

function refreshEnvironment() {
  if (!stage) return;
  const onSeasons = mode === 'seasons';
  document.body.classList.toggle('lot', onSeasons);
  // The treeline sits at a FIXED 128-190ft. Deriving fog from camera distance
  // meant zooming in (which divides the distance) pulled the far plane inside
  // the treeline and made the trees vanish, then reappear on zoom out. In
  // seasons the fog is pinned to the world instead.
  if (onSeasons) stage.setFogRange(150, 460);
  else {
    stage.setFogRange(null);
    stage.setFogFar(2.6);
  }
  seasonBadge.hidden = !onSeasons;
  if (onSeasons) {
    // Apply straight away rather than waiting on the next animation frame —
    // a backgrounded tab would otherwise switch mode and show nothing.
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const s = seasonAt(Math.min(1, Math.max(0, window.scrollY / (max || 1))));
    applySeason(stage.scene, lot, stage.grids, stage.lights, s, true);
    const hf = 0.5 - (0.5 * Math.tan(rad(SHOTS[0].el))) / Math.tan(rad(OUT_FOV / 2));
    document.documentElement.style.setProperty('--sky', skyGradient(s.skyFrom, s.skyTo, s.skyT, hf));
    document.documentElement.style.setProperty(
      '--horizon',
      `#${s.fog.toString(16).padStart(6, '0')}`
    );
    lastSky = null;
    seasonBadge.textContent = s.label;
  } else {
    applySeason(stage.scene, lot, stage.grids, stage.lights, null, false);
    document.documentElement.style.setProperty('--sky', 'none');
    lastSky = '';
  }
  viewbar
    .querySelectorAll('[data-mode]')
    .forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mode === mode)));
}

viewbar.addEventListener('click', (e) => {
  const modeBtn = e.target.closest('button[data-mode]');
  if (modeBtn) {
    mode = modeBtn.dataset.mode;
    refreshEnvironment();
    return;
  }
  // The framing cutaway lost its own scroll section in the restructure, but
  // it's the clearest evidence for the snow-load claim — so it lives here.
  const frameBtn = e.target.closest('button[data-frame]');
  if (frameBtn) {
    framing = !framing;
    frameBtn.setAttribute('aria-pressed', String(framing));
    return;
  }
  const motionBtn = e.target.closest('button[data-motion]');
  if (motionBtn) {
    motionOverride = !motionOverride;
    updateMotionUI();
  }
});

/**
 * Surfaced only when the OS asks for reduced motion. Without it, that setting
 * silently disabled the idle orbit, the weather and the birds, and there was no
 * way to tell the difference between "off by preference" and "broken".
 */
function updateMotionUI() {
  document.body.classList.toggle('no-motion', prefersReduced());
  const group = document.getElementById('motion-group');
  if (!group) return;
  group.hidden = !REDUCED;
  const b = group.querySelector('[data-motion]');
  b.textContent = motionOverride ? 'Motion on' : 'Motion off';
  b.setAttribute('aria-pressed', String(motionOverride));
  b.title = motionOverride
    ? 'Full motion, overriding your system preference'
    : 'Your system asks for reduced motion — tap to turn motion on anyway';
}

/* --------------------------------------------------------- direct control */

// Azimuth is monotonic across the page, so it can be inverted back to a scroll
// position. Sampled once per measure() rather than solved analytically — the
// keyframes are smoothstepped, which has no clean closed-form inverse.
let azTable = [];
function buildAzTable() {
  azTable = [];
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const y = (max * i) / N;
    azTable.push([y, shotAt(y).shot.az]);
  }
}

function scrollForAz(az) {
  if (!azTable.length) return window.scrollY;
  // The table is ordered by SCROLL, so which END of it is the larger AZIMUTH
  // depends on which way the run travels. It climbs, so first < last — but this
  // read its bounds as lo=azTable[0], hi=last unconditionally, and when the
  // shots were briefly written descending that made Math.min(hi, Math.max(lo,
  // az)) collapse every target onto the final az. It then returned the bottom of
  // the document whatever it was asked for: the idle orbit landed on the quote
  // and FAQ view on its first frame and every drag teleported there too.
  // Reading the orientation off the table costs nothing and cannot go stale.
  const first = azTable[0][1];
  const last = azTable[azTable.length - 1][1];
  const desc = last < first;
  const target = Math.min(Math.max(az, Math.min(first, last)), Math.max(first, last));
  let a = 0;
  let b = azTable.length - 1;
  while (b - a > 1) {
    const mid = (a + b) >> 1;
    // Walk toward the target in whichever direction the table runs.
    if (desc ? azTable[mid][1] >= target : azTable[mid][1] <= target) a = mid;
    else b = mid;
  }
  const [y0, a0] = azTable[a];
  const [y1, a1] = azTable[b];
  const t = a1 === a0 ? 0 : (target - a0) / (a1 - a0);
  return y0 + (y1 - y0) * t;
}

/* ------------------------------------------------------------ idle orbit */

// The building turns itself until you touch something, and picks it back up
// once you have been idle a while. Deliberately slow -- this drives the page
// position, so anything brisk would yank the document out from under a reader.
const IDLE_MS = 5000;
const AUTO_DEG_PER_SEC = 2.6;

let lastInput = 0;
let auto = true; // on from load, per the brief
let autoDir = 1;
let lastSetScroll = -1;

function noteInput() {
  lastInput = performance.now();
  auto = false;
}

for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart']) {
  window.addEventListener(ev, noteInput, { passive: true });
}

// A scroll we caused ourselves must not count as the user taking over.
// The previous version set a flag and cleared it on the next animation frame,
// but scroll events land asynchronously and routinely arrived AFTER the clear —
// so the idle orbit read its own movement as user input and switched itself off
// one step after starting. Comparing against the position we actually asked for
// has no race in it.
window.addEventListener(
  'scroll',
  () => {
    if (Math.abs(window.scrollY - lastSetScroll) <= 2) return;
    noteInput();
  },
  { passive: true }
);

function setScroll(top) {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const clamped = Math.max(0, Math.min(max, top));
  lastSetScroll = Math.round(clamped);
  window.scrollTo({ top: clamped, behavior: 'auto' });
}

// The run descends, so 'lo' and 'hi' are by scroll position, not by value.
const AZ_START = SHOTS[0].az;
const AZ_END = SHOTS[SHOTS.length - 1].az;
const AZ_LO = Math.min(AZ_START, AZ_END);
const AZ_HI = Math.max(AZ_START, AZ_END);

function spinBy(delta) {
  // Re-seed from the real scroll position whenever the two disagree. Anything
  // that moves the page without going through here — picking a model from the
  // catalogue, an anchor link, the keyboard — used to leave spinAz stale, and
  // the next drag teleported the page to wherever that stale angle pointed.
  const fromScroll = shotAt(window.scrollY).shot.az;
  if (spinAz === null || Math.abs(spinAz - fromScroll) > 6) spinAz = fromScroll;
  // Clamping matters: without it a long drag past the end accumulated forever,
  // and dragging back did nothing until it had unwound all of it.
  spinAz = Math.min(AZ_HI, Math.max(AZ_LO, spinAz + delta));
  setScroll(scrollForAz(spinAz));
}

/** Advance the idle orbit, reversing at each end so it never jumps. */
function autoOrbit(dt) {
  const fromScroll = shotAt(window.scrollY).shot.az;
  if (spinAz === null || Math.abs(spinAz - fromScroll) > 6) spinAz = fromScroll;
  // Ease off approaching either limit so the turn is a decelerating arc rather
  // than running full speed into a wall and snapping back.
  const span = AZ_HI - AZ_LO;
  const toEdge = Math.min(spinAz - AZ_LO, AZ_HI - spinAz) / (span * 0.12);
  const ease = 0.15 + 0.85 * smoothstep(clamp01(toEdge));
  spinAz += AUTO_DEG_PER_SEC * ease * dt * autoDir;
  if (spinAz >= AZ_HI) {
    spinAz = AZ_HI;
    autoDir = -1;
  } else if (spinAz <= AZ_LO) {
    spinAz = AZ_LO;
    autoDir = 1;
  }
  setScroll(scrollForAz(spinAz));
}

function zoomBy(delta) {
  zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + delta));
}

if (stage) {
  attachControls(canvas, {
    onSpin: spinBy,
    onZoom: zoomBy,
    onActive: (active) => {
      // Keep spinAz across the handoff so the idle orbit resumes from where the
      // user left the building, rather than snapping to the section keyframe.
      if (!active) return;
      noteInput();
      // Taking hold of the building releases the pinned quote view — otherwise
      // there is no way back out of it by dragging, which is the one gesture
      // the whole page is built around.
      if (document.body.classList.contains("final-overlay")) {
        document.body.classList.remove("final-overlay");
        customizing = false;
        document.body.classList.remove("customizing");
      }
    },
  });
}

// Button fallback for anyone without a wheel — or without a mouse at all.
// Press and hold repeats; a single click steps. Pointer events rather than
// mousedown so it works under touch and pen too.
const navpad = document.getElementById('navpad');
let holdRaf = 0;

function startHold(fn) {
  stopHold();
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fn(dt);
    holdRaf = requestAnimationFrame(tick);
  };
  holdRaf = requestAnimationFrame(tick);
}

function stopHold() {
  if (holdRaf) cancelAnimationFrame(holdRaf);
  holdRaf = 0;
  spinAz = null;
}

navpad.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    b.setPointerCapture(e.pointerId);
  } catch {}
  const spin = Number(b.dataset.spin || 0);
  const z = Number(b.dataset.zoom || 0);
  // One immediate step so a click does something even without the hold.
  if (spin) spinBy(spin * 5);
  if (z) zoomBy(z * 0.08);
  startHold((dt) => {
    if (spin) spinBy(spin * 55 * dt);
    if (z) zoomBy(z * 0.85 * dt);
  });
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  navpad.addEventListener(ev, stopHold);
}
// Keyboard activation never fires pointerdown, so handle it separately.
navpad.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const b = e.target.closest('button');
  if (!b) return;
  e.preventDefault();
  if (b.dataset.spin) spinBy(Number(b.dataset.spin) * 12);
  if (b.dataset.zoom) zoomBy(Number(b.dataset.zoom) * 0.12);
  spinAz = null;
});

/* ------------------------------------------------------------------ media */

// Real photographs, pulled from the live site's own galleries. Falls back to a
// captioned slot if a category has none, rather than showing a broken frame.
// Photographs are the one full-colour, real-world thing on a white line-drawn
// page. Rather than fight that, they're treated as plates laid on the drafting
// sheet: snapped to the grid module, hairline-ruled, captioned in the same
// small caps as the specs. Twelve inline, the rest behind "open the archive".
const photos = document.getElementById('media-photos');
photos.classList.add('plates-feature');
const INLINE_PLATES = 13; // 12 tiles plus the 2x2 feature
let stripItems = [];

/** Everything for the active category, then the rest, deduped. */
function galleryPool() {
  const first = GALLERY[active.category] || [];
  const rest = Object.entries(GALLERY)
    .filter(([k]) => k !== active.category)
    .flatMap(([, v]) => v);
  return [...new Set([...first, ...rest])];
}

function plateFigure(url, i, cat) {
  const fig = document.createElement('figure');
  fig.className = 'plate';
  fig.innerHTML = `
    <span class="plate-frame">
      <img src="${img(url, 520, 390)}" alt="Chateau Sheds building" loading="lazy" decoding="async">
    </span>
    <figcaption><i>${String(i + 1).padStart(2, '0')}</i>${cat}</figcaption>`;
  return fig;
}

function renderPlates() {
  const cat = CATEGORIES.find((c) => c.id === active.category);
  const label = cat ? cat.label : '';
  const pool = galleryPool();
  stripItems = pool.map((url) => ({ url, caption: label }));
  setText('galleryCount', String(pool.length));

  photos.innerHTML = '';
  if (!pool.length) {
    photos.innerHTML = `<div class="slot slot-photo"><span>Photo</span><small>No imagery yet</small></div>`;
    return;
  }
  // Doubled run inside a track, so the CSS loop lands exactly on the seam.
  const track = document.createElement('div');
  track.className = 'belt-track';
  const run = pool.slice(0, INLINE_PLATES);
  // Walk-throughs ride the belt as frames of their own rather than sitting in a
  // separate row underneath it.
  const VIDEOS = [
    ['Shed walk-throughs', 'https://www.chateaushedsoutdoorstructures.com/copy-of-sauna-walk-throughs'],
    ['Sauna walk-throughs', 'https://www.chateaushedsoutdoorstructures.com/sauna-walk-throughs'],
  ];
  const fill = () => {
    run.forEach((url, i) => {
      track.appendChild(plateFigure(url, i, label));
      if (i % 6 !== 5) return;
      const [name, href] = VIDEOS[((i / 6) | 0) % VIDEOS.length];
      const a = document.createElement('a');
      a.className = 'plate belt-video';
      a.href = href;
      a.rel = 'noopener';
      a.innerHTML = `<b>&#9654;</b><span>${name}</span>`;
      track.appendChild(a);
    });
  };
  // Twice through, so the CSS translate of -50% lands exactly on the seam.
  fill();
  fill();
  photos.appendChild(track);
  const note = document.getElementById('gallery-note');
  if (note) {
    note.textContent = `Showing ${Math.min(INLINE_PLATES, pool.length)} of ${pool.length}.`;
  }
}

renderPlates();
// Delegated, so restocking on a category change needs no rebind.
bindStrip(photos, () => stripItems);

// Hovering the media holds the building still. Bound to the containers rather
// than the tiles so moving between two photographs doesn't flicker the pause.
for (const el of [photos, document.getElementById('media-reels')]) {
  if (!el) continue;
  el.addEventListener('pointerenter', () => {
    hoverPause = true;
  });
  el.addEventListener('pointerleave', () => {
    hoverPause = false;
  });
}

/* --------------------------------------------------------- photo archive */

const platesOverlay = document.getElementById('plates');
let platesBuilt = false;

function openPlates() {
  const cat = CATEGORIES.find((c) => c.id === active.category);
  const label = cat ? cat.label : '';
  const pool = galleryPool();
  platesOverlay.innerHTML = `
    <div class="cat-sheet">
      <div class="cat-head">
        <div>
          <p class="eyelid">Archive</p>
          <h2>${pool.length} photographs</h2>
        </div>
        <button class="cat-close" type="button" aria-label="Close archive">Close</button>
      </div>
      <div class="plates plates-all" id="plates-grid"></div>
      <p class="fine">
        The client's own photography, served from their Wix CDN and sized on the
        fly. Re-host before production.
      </p>
    </div>`;
  const grid = platesOverlay.querySelector('#plates-grid');
  // Every image is lazy + CDN-sized, so a hundred of them cost one small
  // request each and only when scrolled to.
  pool.forEach((url, i) => grid.appendChild(plateFigure(url, i, label)));
  platesOverlay.querySelector('.cat-close').addEventListener('click', closePlates);
  bindStrip(grid, () => pool.map((url) => ({ url, caption: label })));
  platesOverlay.classList.add('open');
  document.body.classList.add('locked');
  platesOverlay.querySelector('.cat-close').focus();
  platesBuilt = true;
}

function closePlates() {
  platesOverlay.classList.remove('open');
  document.body.classList.remove('locked');
}

document.getElementById('open-plates').addEventListener('click', openPlates);
platesOverlay.addEventListener('click', (e) => {
  if (e.target === platesOverlay) closePlates();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && platesOverlay.classList.contains('open')) closePlates();
});

// The walk-through videos can't be embedded: Wix returns 403 on direct access
// to the files, so these link out until they're re-hosted or moved to YouTube.
const reels = document.getElementById('media-reels');
const VIDEO_LINKS = [
  ['Shed walk-throughs', 'https://www.chateaushedsoutdoorstructures.com/copy-of-sauna-walk-throughs'],
  ['Sauna walk-throughs', 'https://www.chateaushedsoutdoorstructures.com/sauna-walk-throughs'],
  ['Shed info videos', 'https://www.chateaushedsoutdoorstructures.com/shed-walk-throughs'],
];
reels.innerHTML = '';
VIDEO_LINKS.forEach(([label, href]) => {
  const a = document.createElement('a');
  a.className = 'slot slot-reel';
  a.href = href;
  a.rel = 'noopener';
  a.innerHTML = `<span>Video</span><small>${label}</small>`;
  reels.appendChild(a);
});

/* -------------------------------------------------------------------- faq */

const faqEl = document.getElementById('faq');
FAQ.forEach(({ q, a }) => {
  const d = document.createElement('details');
  d.className = 'faq-item';
  d.innerHTML = `<summary>${q}</summary><p>${a}</p>`;
  faqEl.appendChild(d);
});

/* ------------------------------------------------------------------ quote */

const form = document.getElementById('quote-form');
const qError = document.getElementById('q-error');

// Where a quote lands is a deploy-time decision, not a code one. Hosted
// publicly and pointed at the real inbox, this demo puts live enquiries in
// front of a business that did not send anyone here. Set VITE_QUOTE_EMAIL at
// build time to route them somewhere else; the default keeps local behaviour.
const QUOTE_TO = import.meta.env.VITE_QUOTE_EMAIL || 'info@ChateauSheds.com';

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const missing = ['name', 'town', 'email'].filter((k) => !String(data.get(k) || '').trim());
  const email = String(data.get('email') || '');
  if (missing.length) {
    qError.hidden = false;
    qError.textContent = `Still needed: ${missing.join(', ')}.`;
    form.querySelector(`[name="${missing[0]}"]`).focus();
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    qError.hidden = false;
    qError.textContent = 'That email address does not look right.';
    form.querySelector('[name="email"]').focus();
    return;
  }
  qError.hidden = true;

  const body = [
    `Name: ${data.get('name')}`,
    `Town: ${data.get('town')}`,
    `Email: ${email}`,
    `Phone: ${data.get('phone') || '—'}`,
    '',
    'Build:',
    buildSummary(),
    '',
    `Link: ${shareUrl(working)}`,
    '',
    `Notes: ${data.get('notes') || '—'}`,
    '',
    // The recipient reads this with none of the page's context around it, so
    // the caveat has to travel with the message rather than only sit on screen.
    'Sent from the demo configurator — the build above is a starting point,',
    'not an order, and the options offered on it are only a sample of the range.',
  ].join('\n');

  // No backend on a sample site, so hand off to the visitor's mail client --
  // they see and send it themselves. Swap for a POST when there's an endpoint.
  location.href = `mailto:${QUOTE_TO}?subject=${encodeURIComponent(
    `Quote request — ${active.tab}`
  )}&body=${encodeURIComponent(body)}`;
});

/* ----------------------------------------------------------------- scroll */

let anchors = [];

// The topbar is fixed and overlays the top of the stage band, so the canvas was
// taller than the part of it you can actually see and the building sat centred
// in a box whose top 90px was behind the nav. Publish the real height so the
// phone layout can inset the canvas to the visible area instead of guessing —
// the bar grows and shrinks with the category and model names.
function measureTopbar() {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  const h = Math.round(bar.getBoundingClientRect().height);
  if (h) document.documentElement.style.setProperty('--topbar-h', `${h}px`);
}

function measure() {
  measureTopbar();
  anchors = sections.map((el) => el.offsetTop);
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  if (anchors.length) anchors[anchors.length - 1] = Math.max(anchors[anchors.length - 1], maxScroll);
  stage && stage.resize();
  buildAzTable();
}

/** Which shot we're in, how far through it, and the interpolated camera. */
function shotAt(y) {
  const last = SHOTS.length - 1;
  if (y <= anchors[0]) return { shot: SHOTS[0], index: 0, t: 0 };
  if (y >= anchors[last]) return { shot: SHOTS[last], index: last, t: 1 };
  let i = 0;
  while (i < anchors.length - 2 && y >= anchors[i + 1]) i++;
  const span = anchors[i + 1] - anchors[i] || 1;
  const raw = clamp01((y - anchors[i]) / span);
  const t = smoothstep(raw);
  const a = SHOTS[i];
  const b = SHOTS[i + 1];
  return {
    index: i,
    t: raw,
    shot: {
      az: lerp(a.az, b.az, t),
      el: lerp(a.el, b.el, t),
      dist: lerp(a.dist, b.dist, t),
      targetY: lerp(a.targetY, b.targetY, t),
      panX: lerp(a.panX, b.panX, t),
    },
  };
}

/** Ramp up, hold, ramp down across a section — zero at both boundaries. */
function envelope(t, ramp = 0.3) {
  return smoothstep(clamp01(t / ramp)) * smoothstep(clamp01((1 - t) / ramp));
}

const fill = document.getElementById('scroll-fill');
const current = { ...SHOTS[0] };
let lastNow = performance.now();

function frame(now) {
  // Resume the idle orbit once the user has been quiet long enough. Suppressed
  // while a modal is up, while the tab is hidden, and under reduced-motion.
  const dtAuto = Math.min(0.05, (now - lastNow) / 1000);
  if (!auto && now - lastInput > IDLE_MS) auto = true;
  const blocked =
    noPageMotion() || document.hidden || hoverPause || document.body.classList.contains('locked');
  if (auto && !blocked && stage) autoOrbit(dtAuto);

  updateDockDrift(now);

  const y = window.scrollY;
  const { shot: goal, index, t } = shotAt(y);

  const max = document.documentElement.scrollHeight - window.innerHeight;
  fill.style.width = `${Math.min(100, (y / (max || 1)) * 100)}%`;

  if (stage) {
    const k = noPageMotion() ? 1 : 0.085;
    for (const key of ['az', 'el', 'dist', 'targetY', 'panX']) {
      current[key] = lerp(current[key], goal[key], k);
    }
    interiorMix = noPageMotion() ? (interior ? 1 : 0) : lerp(interiorMix, interior ? 1 : 0, 0.1);

    const drift = noPageMotion() ? 0 : Math.sin(now / 4200) * 0.9;
    const f = fitFor(working);
    // Narrow screens: pull back and drop the side offset, since the copy sits
    // over the building instead of beside it. Derived every frame rather than
    // written into SHOTS on resize -- nothing to go stale.
    const narrow = window.innerWidth < 860;
    const eaveY = shed ? shed.userData.eaveY : 8.8;

    // Outside and inside are two camera rigs blended by interiorMix, so
    // stepping in is a move through the wall rather than a cut.
    // Zoom divides: a bigger zoom pulls the camera in, not out.
    const outDist = (current.dist * f * (narrow ? 1.16 : 1)) / zoom;
    lastCamDist = outDist; // ambient scales its flight radius off this
    const inDist = Math.max(2.6, Math.min(working.width, working.depth) * 0.3);
    // The narrow-screen raise existed to lift the building clear of a copy card
    // that lay over the lower half of the canvas. The canvas is now a band with
    // nothing on top of it, so the building wants centring in that band, not
    // pushing up out of it.
    const outY = current.targetY + (working.wallHeight - 8) * 0.4;

    stage.setCamera({
      az: rad(current.az + drift),
      el: rad(lerp(lerp(current.el, 34, gridLift), 2, interiorMix)),
      dist: lerp(outDist, inDist, interiorMix),
      targetY: lerp(outY, eaveY * 0.55, interiorMix),
      panX: narrow ? 0 : current.panX * f * (1 - interiorMix),
      fov: lerp(OUT_FOV, IN_FOV, interiorMix),
      // Inside, fog has to key off the room, not the 3ft camera distance.
      fogDist: lerp(outDist, Math.hypot(working.width, working.depth) * 1.5, interiorMix),
    });

    // Seasons ride the scroll: spring at the top of the page, winter at the
    // bottom, everything in between blended rather than switched.
    if (mode === 'seasons') {
      const p = Math.min(1, Math.max(0, y / (max || 1)));
      // Past GRID_AT the year is over and the scene returns to the drafting grid
      // it started from, so the last thing you see is the brand, not winter.
      const toGrid = Math.min(1, Math.max(0, (p - GRID_AT) / (1 - GRID_AT)));
      const s = seasonAt(Math.min(p, GRID_AT));
      applySeason(stage.scene, lot, stage.grids, stage.lights, s, toGrid < 0.98);
      lot.lot.visible = toGrid < 0.98;
      stage.grids.forEach((g) => (g.visible = toGrid > 0.02));
      if (toGrid > 0.02) {
        stage.setFogRange(null);
        stage.setFogFar(2.6);
      } else stage.setFogRange(150, 460);
      // Lift the camera as the grid takes over. At the 13-degree elevation the
      // seasons use, a ground grid is seen almost edge-on and its lines compress
      // into horizontal bands — it stops reading as a grid at all.
      gridLift = toGrid;
      // Rewriting a gradient string every frame is wasteful; only when it moves.
      const horizonFrac = 0.5 - (0.5 * Math.tan(rad(current.el))) / Math.tan(rad(OUT_FOV / 2));
      const sky = skyGradient(s.skyFrom, s.skyTo, s.skyT, horizonFrac);
      if (sky !== lastSky) {
        document.documentElement.style.setProperty('--sky', sky);
        document.documentElement.style.setProperty(
          '--horizon',
          `#${s.fog.toString(16).padStart(6, '0')}`
        );
        lastSky = sky;
      }
      inGridTail = toGrid > 0.5;
      // Hand the backdrop back to the white grid as the year ends, or the old
      // sky gradient stays painted behind it as horizontal bands.
      document.body.classList.toggle("lot", toGrid < 0.98);
      if (toGrid > 0.5 && lastSky !== null) {
        document.documentElement.style.setProperty("--sky", "none");
        lastSky = null;
      }
      const label = inGridTail ? 'Grid' : s.label;
      if (seasonBadge.textContent !== label) seasonBadge.textContent = label;
      currentSeason = s.label.toLowerCase();
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      const wx = inGridTail ? 0 : s.weatherStrength * ambienceScale();
      lot.weather.update(dt, wx, now / 1000);
      lot.weather2.update(dt, wx, now / 1000);
    }
    // Ambient must run every frame, not just in seasons — it needs the frame
    // where the mode flips off to hide its actors.
    if (ambient) ambient.update(Math.min(0.05, (now - lastNow) / 1000));
    lastNow = now;

    stage.lights.interior.intensity = 13 * interiorMix;
    stage.lights.interior.position.y = eaveY * 0.8;

    // Framing is a deliberate toggle now rather than a scroll side-effect, so
    // it eases toward its target instead of tracking a section envelope.
    const outside = 1 - interiorMix;
    framingMix = noPageMotion() ? (framing ? 1 : 0) : lerp(framingMix, framing ? 1 : 0, 0.12);
    setCutaway(shed, framingMix * outside);
    const dimT = index === DIMENSION_SECTION ? envelope(t, 0.22) * outside : 0;
    setDimensionOpacity(dims, dimT);
    layoutLabels(dims, dimNodes, stage.camera, canvas.clientWidth, canvas.clientHeight, dimT);

    stage.render();
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------- init */

document.body.classList.add('js');
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
  { threshold: 0.15 }
);
const panels = document.querySelectorAll('.panel');
panels.forEach((p) => io.observe(p));
// Don't wait on the observer for the panel that's already on screen.
panels[0].classList.add('in');

renderTabs();
bindCopy();
rebuild(true);
updateMotionUI();
refreshEnvironment();
measure();
requestAnimationFrame(frame);

window.addEventListener('resize', measure);
window.addEventListener('load', measure);

// Handy for poking at the scene from the console.
window.__chateau = {
  stage,
  get shed() {
    return shed;
  },
  get working() {
    return working;
  },
  SHOTS,
  select,
  MODELS,
  CATEGORIES,
  rebuild,
  catalogue,
  lot,
  autoOrbit,
  noteInput,
  /** One-line answer to "why can't I see the weather / birds / rotation?" */
  get diag() {
    return {
      reducedMotion: REDUCED, motionOverride,
      mode,
      weatherAndBirdsNeedSeasons: mode !== 'seasons',
      autoRotating: auto,
      hoverPause,
      orbitWouldRunNow:
        auto && !(noPageMotion() || document.hidden || hoverPause || document.body.classList.contains('locked')),
      secondsSinceInput: Math.round((performance.now() - lastInput) / 1000),
      weatherVisible: lot ? lot.weather.points.visible : null,
      birdsVisible: ambient ? ambient.root.visible : null,
      spinAz,
      scrollY: window.scrollY,
    };
  },
  get autoState() {
    return { auto, dir: autoDir, sinceInput: performance.now() - lastInput, spinAz };
  },
  tickIdle: (now) => {
    if (!auto && now - lastInput > IDLE_MS) auto = true;
    return auto;
  },
  setMode: (m) => {
    mode = m;
    refreshEnvironment();
  },
  get zoom() {
    return zoom;
  },
  setZoom: (v) => {
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));
  },
  openLightbox,
  setInterior: (v) => {
    interior = v;
    interiorMix = v ? 1 : 0;
  },
  setCutaway: (t) => setCutaway(shed, t),
  setDims: (t) => {
    setDimensionOpacity(dims, t);
    layoutLabels(dims, dimNodes, stage.camera, canvas.clientWidth, canvas.clientHeight, t);
  },
};

/* ------------------------------------------------------- three rotations */

// The palette used to live inside a scrolling section — but rotating the
// building IS scrolling, so a full turn around it scrolled the colour options
// off screen mid-edit. It now lives in a fixed dock that survives any rotation,
// and "Finished" is what moves you on.
const dock = document.getElementById('dock');
const dockLeft = document.getElementById('dock-left');
// Size on the left, colour on the right. The configurator renders one flat list
// of groups, so it is split after mounting: sliders and rooflines stay left,
// everything to do with colour moves right.
function splitPalette() {
  const groups = [...document.querySelectorAll('#cfg .cfg-group')];
  const right = document.getElementById('dock-body');
  const colour = el => /Colorway|Siding|Trim|Roof$|Door$/.test(el.querySelector('.cfg-label')?.textContent || '');
  const rightGroups = groups.filter((g, i) => i >= 7);
  rightGroups.forEach(g => right.appendChild(g));
}
let resetDockIdle = () => {};
// #cfg is authored inside the left dock; splitPalette() moves only the colour
// groups across to the right one.

const ROTATIONS = {
  customize: { section: 's-hero', dock: false },
  inventory: { section: 's-build', dock: true },
  final: { section: 's-final', dock: false },
};
let rotation = 'customize';

// Which view owns the screen, as an attribute the stylesheet can switch on.
//
// The narrow layout shows one view's words at a time, and that cannot ride on
// the .panel.in class: the IntersectionObserver only ever ADDS .in (see the
// observer at the init block below), so once view 3 has been on screen once,
// every panel carries it for the rest of the session and all three bands are
// "active" at the same time, stacked in the same box. An add-only class can
// reveal but can never conceal.
//
// `rotation` is already the answer to "which view is this", it is already
// recomputed from scroll position by the listener that keeps the switcher
// honest, and that listener already fires on the idle orbit's own programmatic
// scrolls. So it costs one attribute write and no new state.
const setViewAttr = (id) => {
  if (document.body.dataset.view === id) return;
  document.body.dataset.view = id;
  // Each view gets a different share of a phone screen: view 1 is the building
  // and wants most of it, view 2 has two dock sheets to fit, view 3 has a FAQ
  // and a form. The stylesheet varies --stage-h per view to suit, which changes
  // the canvas box, and the renderer only ever re-reads that on a window
  // resize. Without this the drawing buffer keeps the previous view's aspect
  // and the building comes out stretched.
  if (stage) stage.resize();
  // Collapse the scene toggles again on a view change; leaving them open over
  // the next view is just clutter the user did not ask for.
  closeViewbar();
  renderSubnav();
  mountPanel();
};

/* --------------------------------------------------- one panel at a time */

// Views 2 and 3 are several panels each. On desktop they sit side by side and
// read as one composition; stacked into a phone band they just crowd each
// other, and two half-height dock sheets are worse than one full-height one.
// So on a phone each view shows a single panel and this picks which.
//
// The CSS does the hiding, keyed off body[data-pane]. Nothing here runs on
// desktop beyond writing an attribute no desktop rule reads.
const PANES = {
  customize: [],
  inventory: [
    { id: 'size', label: 'Dimensions' },
    { id: 'colour', label: 'Colour' },
  ],
  final: [
    { id: 'faq', label: 'Questions' },
    { id: 'quote', label: 'Get a quote' },
    { id: 'built', label: 'Built' },
  ],
};

const subnav = document.getElementById('subnav');
const infoPane = document.getElementById('info-pane');

/* ------------------------------------------------ the two phone containers */

// On a phone the page is two containers: the stage pane holds the grid and the
// model, the info pane holds the words. Exactly one panel lives in the info
// pane at a time, so it is the only thing below the model that scrolls — the
// panels themselves become plain static content inside it.
//
// The panels are moved rather than copied, and each remembers where it came
// from so the desktop layout can be put back exactly. Listeners survive a
// move, so nothing has to be rebound.
const narrowLayout = () => window.matchMedia('(max-width: 860px)').matches;

/** Which element is the body of the current view/pane, mirroring renderSubnav. */
function currentPanelEl() {
  if (dock && !dock.hidden) {
    return document.body.dataset.pane === 'colour' ? dock : dockLeft;
  }
  if (rotation === 'final') {
    const pane = document.body.dataset.pane || 'faq';
    return document.querySelector(
      pane === 'quote' ? '.tri-right' : pane === 'built' ? '.tri-strip' : '.tri-left'
    );
  }
  // By id, not '#s-hero .copy': once this panel is mounted in the info pane
  // it is no longer a descendant of #s-hero and that selector returns null,
  // which silently unmounted view 1 on every later call.
  return document.getElementById('hero-copy');
}

const paneHomes = new Map();
let mountedPanel = null;

function sendPanelHome(el) {
  const home = paneHomes.get(el);
  if (home && home.parent) home.parent.insertBefore(el, home.next);
}

/** Put the current panel in the info pane, and everything else back. */
function mountPanel() {
  if (!infoPane) return;
  if (!narrowLayout()) {
    if (mountedPanel) sendPanelHome(mountedPanel);
    mountedPanel = null;
    return;
  }
  const el = currentPanelEl();
  if (el === mountedPanel) return;
  if (mountedPanel) sendPanelHome(mountedPanel);
  mountedPanel = null;
  if (!el) return;
  if (!paneHomes.has(el)) paneHomes.set(el, { parent: el.parentNode, next: el.nextSibling });
  // A panel that is being mounted is by definition the one on screen; never let
  // a stale hidden attribute make the band look empty.
  el.hidden = false;
  infoPane.appendChild(el);
  mountedPanel = el;
  // A panel should never open already scrolled from the last time it was read.
  infoPane.scrollTop = 0;
}

// Crossing the breakpoint has to put things back or take them over. Two
// triggers rather than one: resize covers rotation and window dragging, and the
// media query fires even when a resize event does not — if either is missed the
// panel is stranded in a container the other layout hides, which shows as a
// completely blank column.
window.addEventListener('resize', mountPanel);
const narrowQuery = window.matchMedia('(max-width: 860px)');
if (narrowQuery.addEventListener) narrowQuery.addEventListener('change', mountPanel);
else if (narrowQuery.addListener) narrowQuery.addListener(mountPanel);

function setPane(id) {
  document.body.dataset.pane = id;
  mountPanel();
  if (!subnav) return;
  subnav.querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.pane === id))
  );
}

/** Rebuild the picker for whatever the band is currently showing. */
function renderSubnav() {
  if (!subnav) return;
  // Keyed off what is on screen, not off the view. Customizing mode pins the
  // docks open in every view, and when it does they are what the band holds —
  // so they own the picker, or there would be no way to get from dimensions to
  // colour without scrolling back to view 2.
  const panes = dock && !dock.hidden ? PANES.inventory : PANES[rotation] || [];
  subnav.hidden = panes.length === 0;
  subnav.innerHTML = '';
  if (!panes.length) {
    delete document.body.dataset.pane;
    mountPanel();
    return;
  }
  for (const p of panes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.pane = p.id;
    b.textContent = p.label;
    subnav.appendChild(b);
  }
  // Keep the current panel if this view still offers it, so returning to a
  // view does not silently throw away what you were looking at.
  const keep = panes.some((p) => p.id === document.body.dataset.pane);
  setPane(keep ? document.body.dataset.pane : panes[0].id);
}

if (subnav) {
  subnav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pane]');
    if (!b) return;
    setPane(b.dataset.pane);
    // Picking a panel is attention: the idle orbit must not turn the page out
    // from under someone who just chose what to look at.
    noteInput();
    resetDockIdle();
  });
}

// The scene toggles are a disclosure on narrow screens (see the button in
// index.html). Defined before setViewAttr runs at init.
function closeViewbar() {
  document.body.classList.remove('viewbar-open');
  const t = document.getElementById('viewbar-toggle');
  if (t) t.setAttribute('aria-expanded', 'false');
}

function setRotation(id) {
  resetDockIdle();
  rotation = ROTATIONS[id] ? id : 'customize';
  const cfg = ROTATIONS[rotation];
  // Dock visibility has to be settled BEFORE setViewAttr: the picker it
  // rebuilds is keyed off which docks are on screen, and this ran the other way
  // round, so the picker was always one call behind.
  dock.hidden = !cfg.dock;
  if (dockLeft) dockLeft.hidden = !cfg.dock;
  setViewAttr(rotation);
  // setViewAttr early-returns when the view has not changed, and the dock state
  // may still have; re-render unconditionally.
  renderSubnav();
  document.querySelectorAll('#rotations button').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.rot === rotation))
  );
  const el = document.getElementById(cfg.section);
  if (el) {
    // Jump rather than smooth-scroll: these are destinations, not a journey,
    // and a 5-second smooth scroll across the document reads as a bug.
    spinAz = null;
    window.scrollTo({ top: el.offsetTop, behavior: 'auto' });
  }
  noteInput();
}

document.getElementById('rotations').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-rot]');
  if (b) setRotation(b.dataset.rot);
});

// Scene toggles as a disclosure on phones. Tapping the button counts as input,
// so the idle orbit does not turn the page under someone reaching for a swatch.
const viewbarToggle = document.getElementById('viewbar-toggle');
if (viewbarToggle) {
  viewbarToggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('viewbar-open');
    viewbarToggle.setAttribute('aria-expanded', String(open));
    noteInput();
  });
  // Anywhere else on the page closes it, the way a menu should behave.
  document.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('viewbar-open')) return;
    if (e.target.closest('#viewbar') || e.target.closest('#viewbar-toggle')) return;
    closeViewbar();
  });
}

// Finished puts the palette away and hands you to the last rotation.



// Keep the nav honest as the user scrolls between rotations by hand.
window.addEventListener(
  'scroll',
  () => {
    const y = window.scrollY + window.innerHeight * 0.4;
    let best = 'customize';
    for (const [id, cfg] of Object.entries(ROTATIONS)) {
      const el = document.getElementById(cfg.section);
      if (el && y >= el.offsetTop) best = id;
    }
    if (best !== rotation) {
      rotation = best;
      // Dock visibility BEFORE setViewAttr, for the same reason setRotation was
      // reordered: renderSubnav() and currentPanelEl() are both keyed off
      // dock.hidden, and setViewAttr calls them. Getting here first means every
      // view change that does NOT come from tapping the switcher — scrolling,
      // dragging the model, the idle orbit that starts on its own — rendered
      // the previous view's decision. That is how the colour palette ended up
      // under a picker reading "Questions | Get a quote | Built".
      //
      // Customizing pins the docks across views on DESKTOP, where they float
      // beside the building. On a phone they are the band, so pinning them puts
      // the palette in a view that is not about the palette; there the view
      // owns its own docks.
      const showDock = ROTATIONS[best].dock || (customizing && !narrowLayout());
      if (showDock && dock.hidden) resetDockIdle();
      dock.hidden = !showDock;
      if (dockLeft) dockLeft.hidden = !showDock;
      setViewAttr(best);
      renderSubnav();
      document.querySelectorAll('#rotations button').forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.rot === best))
      );
    }
  },
  { passive: true }
);

splitPalette();
setRotation('customize');

/* --------------------------------------------------- dock idle behaviour */

// The dock is fixed so a rotation can't carry it away mid-edit, but left alone
// it should still get out of the way. It drifts off after a spell of being
// ignored, and snaps back the moment it's touched.
//
// The distinction that matters: only interaction with the OVERLAY resets it.
// Dragging the building is not "using the palette" — if it counted, the dock
// would never leave, because rotating is the main thing you do on this page.
const DOCK_IDLE_MS = 20000;
const DOCK_FADE_MS = 1200;
let lastDockInput = performance.now();

for (const ev of ['pointerdown', 'input', 'change', 'focusin', 'wheel']) {
  dock.addEventListener(ev, () => {
    lastDockInput = performance.now();
  });
}

// Activity anywhere on the page counts as being present. Restricting this to
// the dock alone was the real cause of "any click sends me to view 3": you
// could be clicking, dragging or reading elsewhere while the dock's idle clock
// quietly ran out and handed you over.
for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel']) {
  window.addEventListener(
    ev,
    () => {
      lastDockInput = performance.now();
    },
    { passive: true }
  );
}
// Hovering counts as attention too — reaching for a swatch shouldn't race the
// timer that is about to slide the swatch away.
dock.addEventListener('pointerenter', () => {
  lastDockInput = performance.now();
});

function updateDockDrift(now) {
  // Drift is a desktop affordance: a floating sheet easing out of the way of
  // the building. In the phone info pane the dock IS the band, covers nothing,
  // and the layout pins its opacity and transform — so the only part that
  // survives is an inline pointer-events:none written onto a panel that still
  // looks completely live, and an auto-exit that unmounts the palette you were
  // editing. Neither is wanted on a phone, and no CSS can beat an inline style.
  if (narrowLayout() || dock.hidden) {
    for (const d of [dock, dockLeft]) {
      if (!d) continue;
      d.style.removeProperty('--dock-drift');
      d.style.removeProperty('pointer-events');
    }
    return;
  }
  const idle = now - lastDockInput;
  const drift = Math.min(1, Math.max(0, (idle - DOCK_IDLE_MS) / DOCK_FADE_MS));
  for (const d of [dock, dockLeft]) {
    if (!d) continue;
    d.style.setProperty('--dock-drift', drift.toFixed(3));
    // Fully drifted panels must stop taking clicks, or they become invisible
    // walls down both sides of the building.
    d.style.pointerEvents = drift > 0.95 ? 'none' : 'auto';
  }
  // Fully drifted while customizing: the palette is done with, so view 3
  // arrives where the building already is.
  if (drift >= 1 && customizing) exitCustomizing(true);
}

// Entering a rotation deliberately counts as attention, so the dock arrives
// centred rather than already half-way out.
resetDockIdle = () => {
  lastDockInput = performance.now();
};

/* ------------------------------------------- final rotation: photo row */

// A row of what's already been delivered, sitting under the FAQ. Clicking one
// opens it in the middle of the screen — that's the existing lightbox, so the
// behaviour matches the archive rather than being a second thing to learn.
const faqPlates = document.getElementById('faq-plates');
if (faqPlates) {
  const row = galleryPool().slice(0, 14);
  const track = document.createElement('div');
  track.className = 'belt-track';
  // Twice through, so translateX(-50%) lands exactly on the seam.
  [...row, ...row].forEach((url, i) => track.appendChild(plateFigure(url, i % row.length, 'Delivered')));
  faqPlates.appendChild(track);
  bindStrip(faqPlates, () => row.map((url) => ({ url, caption: 'Delivered' })));
  faqPlates.addEventListener('pointerenter', () => {
    hoverPause = true;
  });
  faqPlates.addEventListener('pointerleave', () => {
    hoverPause = false;
  });
}

/* ----------------------------------------------- per-view navigation */

// Every view carries buttons to the other two. The global rotation bar does the
// same job, but a visitor reading a panel shouldn't have to go hunting at the
// top of the screen for the way onward.
const GOTO_ROT = { 's-hero': 'customize', 's-build': 'inventory', 's-final': 'final' };
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (!b) return;
  e.preventDefault();
  const rot = GOTO_ROT[b.dataset.goto];
  if (rot) setRotation(rot);
});

// Panels that legitimately scroll their own overflow. Everything else swallows
// the wheel: the page is driven by dragging, the nav and the idle orbit.
const SCROLLERS =
  ".dock, .cat-overlay, .tri-left, .tri-right, .lb, .mx3-scroll, .page-main, .copy, .triptych, .info-pane";

/**
 * The nearest ancestor that both matches SCROLLERS and actually has overflow.
 *
 * closest() alone stops at the first *selector* match and answers with it even
 * when it cannot scroll, which silently swallows the wheel for everything
 * above it. On narrow screens the copy band is exactly that shape: the wheel
 * lands in .tri-left, which is in the list but which the narrow layout makes
 * static and non-overflowing, while the element that really scrolls is the
 * .triptych above it. Keep walking instead of trusting the first hit.
 */
function scrollableAncestor(node) {
  for (let el = node; el && el !== document.body; el = el.parentElement) {
    if (el.matches && el.matches(SCROLLERS) && el.scrollHeight - el.clientHeight > 2) return el;
  }
  return null;
}

window.addEventListener(
  "wheel",
  (e) => {
    const panel = e.target instanceof Element ? scrollableAncestor(e.target) : null;
    if (panel) {
      const atTop = panel.scrollTop <= 0 && e.deltaY < 0;
      const atEnd = panel.scrollTop >= panel.scrollHeight - panel.clientHeight - 1 && e.deltaY > 0;
      if (!atTop && !atEnd) return;
    }
    e.preventDefault();
  },
  { passive: false }
);

/* ------------------------------------------------------ saved default build */

// Save keeps the current build as your default for next time. A shared link
// still wins over it — someone opening a colleague's configuration should see
// that configuration, not their own saved one.
const SAVE_KEY = 'chateau:build';

function saveBuild() {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ base: active.id, model: working })
    );
    shareNote.textContent = 'Saved — this is your default next visit.';
  } catch {
    // Private browsing and full quotas both throw here; the build still works,
    // it just will not persist.
    shareNote.textContent = 'Could not save — storage is unavailable.';
  }
}

export function loadSavedBuild() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const { base, model } = JSON.parse(raw);
    if (!base || !model) return null;
    return { base, model };
  } catch {
    return null;
  }
}

document.getElementById('dock-done').addEventListener('click', saveBuild);

/* --------------------------------------------------- customizing behaviour */

// Changing a value — not merely hovering — unpins rotation from the view. From
// then on the building can be turned the whole way round without the page
// handing you to the quote view, and the docks come with you.
//
// When the docks eventually time out, view 3 arrives pinned to the viewport
// instead of being scrolled to, so the shed stays exactly where you left it.
// That is the point of the mode: you were rotating freely, and snapping the
// camera at the end would undo it.
let customizing = false;

function enterCustomizing() {
  const already = customizing && document.body.classList.contains('customizing');
  customizing = true;
  document.body.classList.add('customizing');
  document.body.classList.remove('final-overlay');
  // Always push the idle clock out: every further tweak buys more time.
  resetDockIdle();
  // Entering and leaving customizing changes which docks are on screen without
  // changing the view, and the picker is keyed off what is on screen.
  renderSubnav();
  return already;
}

function exitCustomizing(showFinal) {
  if (!customizing) return;
  customizing = false;
  document.body.classList.remove('customizing');
  document.body.classList.toggle('final-overlay', !!showFinal);
  dock.hidden = true;
  if (dockLeft) dockLeft.hidden = true;
  renderSubnav();
}

// Value changes only. `input` and `change` fire on the sliders and fields;
// clicks land on the roofline, door, colorway and swatch buttons.
for (const ev of ['input', 'change']) {
  for (const d of [dock, dockLeft]) d?.addEventListener(ev, enterCustomizing);
}
for (const d of [dock, dockLeft]) {
  d?.addEventListener('click', (e) => {
    if (e.target.closest('.cfg-choice, .cfg-way, .cfg-swatch')) enterCustomizing();
  });
}

// Explicitly choosing a view restores the normal pairing of rotation and view.
document.getElementById('rotations').addEventListener('click', () => {
  customizing = false;
  document.body.classList.remove('customizing', 'final-overlay');
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-goto]')) {
    customizing = false;
    document.body.classList.remove('customizing', 'final-overlay');
  }
});

export const customizingState = () => ({
  customizing,
  finalPinned: document.body.classList.contains('final-overlay'),
});
