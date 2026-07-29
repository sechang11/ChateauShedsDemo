import * as THREE from 'three';
import { buildShed, disposeShed } from './shed.js';

// Baked 3D thumbnails for the catalogue matrix.
//
// A grid of two dozen live WebGL canvases is not an option -- browsers cap
// contexts somewhere around a dozen and start dropping the oldest. Instead one
// small offscreen renderer draws each building in turn and hands back a PNG
// data URL, which is then just an <img>. Same buildShed as the main scene, so a
// thumbnail can never disagree with the building it opens.

const CACHE = new Map();
let ctx = null;

function boot() {
  if (ctx) return ctx;
  const canvas = document.createElement('canvas');
  canvas.width = 420;
  canvas.height = 320;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdcd8cd, 0.75));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.1);
  key.position.set(16, 20, 12);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe4edf5, 0.55);
  fill.position.set(-14, 9, -11);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.5, 400);

  ctx = { canvas, renderer, scene, camera };
  return ctx;
}

/** Cheap identity for a build — two models that look identical share a bake. */
const keyOf = (m) =>
  [
    m.width,
    m.depth,
    m.wallHeight,
    m.roof,
    m.door,
    m.windows,
    m.porch ?? 0,
    m.bays ?? 1,
    m.frontOpen ? 1 : 0,
    m.walls ?? 'solid',
    m.colors.siding,
    m.colors.trim,
    m.colors.roof,
    m.colors.door,
  ].join('|');

export function thumbnail(model) {
  const k = keyOf(model);
  const hit = CACHE.get(k);
  if (hit) return hit;

  const { renderer, scene, camera, canvas } = boot();
  const shed = buildShed(model);
  scene.add(shed);

  // Frame from the footprint diagonal so every cell in the matrix reads at the
  // same apparent size, whatever its dimensions.
  const diag = Math.hypot(model.width, model.depth);
  const dist = diag * 1.95 + 6;
  const az = (34 * Math.PI) / 180;
  const el = (14 * Math.PI) / 180;
  const targetY = shed.userData.peakY * 0.46;
  camera.position.set(
    dist * Math.cos(el) * Math.sin(az),
    targetY + dist * Math.sin(el),
    dist * Math.cos(el) * Math.cos(az)
  );
  camera.lookAt(0, targetY, 0);

  renderer.render(scene, camera);
  const url = canvas.toDataURL('image/png');

  scene.remove(shed);
  disposeShed(shed);
  CACHE.set(k, url);
  return url;
}

/**
 * Bake a list without blocking the main thread. Each model gets its own frame,
 * and `onEach` fires as results land so the grid fills in progressively rather
 * than sitting empty then appearing all at once.
 */
export function bakeAll(models, onEach) {
  let i = 0;
  const step = () => {
    if (i >= models.length) return;
    const m = models[i++];
    onEach(m, thumbnail(m));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function disposeThumbnails() {
  if (!ctx) return;
  ctx.renderer.dispose();
  ctx = null;
  CACHE.clear();
}
