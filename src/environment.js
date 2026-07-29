import * as THREE from 'three';

// Two backdrops: the drafting grid, and the seasons.
//
// The grid is the brand and stays the default. Seasons is the context mode --
// and rather than being a picker, it's bound to scroll: you travel through
// spring, summer, autumn and winter as you move down the page, with the weather
// to match. A building that has visibly stood through a New England winter
// argues the snow-load case better than a paragraph about it.

export const MODES = [
  { id: 'grid', label: 'Grid' },
  { id: 'seasons', label: 'Seasons' },
];

export const SEASONS = [
  {
    id: 'spring',
    label: 'Spring',
    ground: 0x7d9c53,
    tree: 0x5f8241,
    fog: 0xdde6e0,
    sky: ['#a8c8dd', '#c8dce0', '#dde6e0', '#dde6e0'],
    hemi: { ground: 0x6a8446, intensity: 0.78 },
    key: { color: 0xfff6e2, intensity: 2.2, height: 20 },
    // Two layers per season. Spring reads as blossom and a passing shower --
    // the old single pale-pink layer at small size was indistinguishable from
    // snow, which is exactly what it should never look like.
    fx: ['petals', 'none'],
  },
  {
    id: 'summer',
    label: 'Summer',
    ground: 0x4f7d2e,
    tree: 0x2c4a22,
    fog: 0xcfe4ec,
    sky: ['#5aa3d8', '#9ccbe2', '#cfe4ec', '#cfe4ec'],
    hemi: { ground: 0x4f7336, intensity: 0.8 },
    key: { color: 0xfff2d0, intensity: 2.6, height: 26 },
    fx: ['pollen', 'none'],
  },
  {
    id: 'autumn',
    label: 'Autumn',
    ground: 0x8a7a42,
    tree: 0xa85a2a,
    fog: 0xdad2c4,
    sky: ['#8fa5b4', '#c3c3b4', '#dad2c4', '#dad2c4'],
    hemi: { ground: 0x6f6238, intensity: 0.66 },
    key: { color: 0xffd9a8, intensity: 2.0, height: 14 },
    fx: ['leaves', 'rain'],
  },
  {
    id: 'winter',
    label: 'Winter',
    ground: 0xeef2f6,
    tree: 0x3d4f42,
    fog: 0xe8eef4,
    sky: ['#b9c9d8', '#d3dfe8', '#e8eef4', '#e8eef4'],
    hemi: { ground: 0xdce6ef, intensity: 0.95 },
    key: { color: 0xeaf2ff, intensity: 1.8, height: 12 },
    fx: ['snow', 'flurry'],
  },
];

// The CSS backdrop must reach the horizon colour ABOVE where the 3D ground
// actually ends, then stay flat. Fading it lower drew a second horizon band of
// its own, sitting at a fixed viewport height and disagreeing with the real one.
// Reach the horizon colour above where the 3D ground ends, then stay flat —
// fading lower drew a second horizon of its own. Pulled up from 0.44 so more
// actual sky is visible above the treeline instead of a thin pale band.
const SKY_STOPS = [0, 0.16, 0.36, 1];

/** Deterministic PRNG so the treeline doesn't reshuffle. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const TREE_COUNT = 130;

/**
 * The treeline as three InstancedMeshes — trunks, canopies, snow caps.
 *
 * Previously each tree was a Group of three separate Meshes: 390 draw calls,
 * and each part frustum-culled on its own bounding sphere, so a canopy could
 * disappear while its trunk stayed put. That independent popping was half of
 * the "trees disappearing" report. Three instanced draws fixes both.
 *
 * Rounded, wide and squat on purpose. Tall narrow cones at a distance read as a
 * mountain range rather than a tree line, which is the opposite of the point.
 */
function makeTreeline(rand, canopyMat, snowMat) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.5, 0.8, 1, 5),
    trunkMat,
    TREE_COUNT
  );
  const canopies = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    canopyMat,
    TREE_COUNT
  );
  const caps = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    snowMat,
    TREE_COUNT
  );

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const tint = new THREE.Color();

  for (let i = 0; i < TREE_COUNT; i++) {
    const a = (i / TREE_COUNT) * Math.PI * 2 + rand() * 0.05;
    const dist = 128 + rand() * 62;
    const h = 14 + rand() * 9;
    const r = h * (0.42 + rand() * 0.14);
    const x = Math.sin(a) * dist;
    const z = Math.cos(a) * dist;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);

    trunks.setMatrixAt(i, m.compose(pos.set(x, h * 0.15, z), q, scale.set(1, h * 0.3, 1)));
    canopies.setMatrixAt(i, m.compose(pos.set(x, h * 0.62, z), q, scale.set(r, r * 0.82, r)));
    caps.setMatrixAt(
      i,
      m.compose(pos.set(x, h * 0.62 + r * 0.34, z), q, scale.set(r * 0.72, r * 0.36, r * 0.72))
    );
    // Per-instance tint multiplies the material colour, so the season can still
    // recolour every tree at once while each keeps its own variation.
    // Per-tree RGB jitter rather than pure lightness: multiplied against the
    // season colour it gives a mixed canopy, which is what makes autumn read
    // as foliage instead of one flat orange wall.
    tint.setRGB(
      1 + (rand() - 0.5) * 0.42,
      1 + (rand() - 0.5) * 0.26,
      1 + (rand() - 0.5) * 0.5
    );
    canopies.setColorAt(i, tint);
  }
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;

  // The ring straddles the frustum edge constantly; culling the whole ring as
  // one sphere would blink the entire treeline in and out.
  for (const mesh of [trunks, canopies, caps]) mesh.frustumCulled = false;

  return { trunks, canopies, caps };
}

// Each effect's character. `fall` 0 means the layer is off. `tumble` and
// `swing` are what stop blossom and leaves reading as precipitation — they
// swing sideways as they descend, where rain and snow fall more or less true.
const KINDS = {
  none: { color: 0xffffff, size: 0, fall: 0, drift: 0, tumble: 0, swing: 0, alpha: 0 },
  // Bigger, pinker and much slower than before. The old pale 0.3 dot at
  // near-white was indistinguishable from a snowflake.
  petals: { color: 0xf0b8c8, size: 0.62, fall: -1.1, drift: 1.4, tumble: 1.5, swing: 0.9, alpha: 0.95 },
  showers: { color: 0x9fb6c8, size: 0.26, fall: -26, drift: 0.4, tumble: 0.1, swing: 0.3, alpha: 0.5 },
  pollen: { color: 0xffe9a8, size: 0.22, fall: -0.35, drift: 1.1, tumble: 1.1, swing: 0.5, alpha: 0.7 },
  leaves: { color: 0xc9762e, size: 0.7, fall: -1.6, drift: 1.8, tumble: 2.1, swing: 1.1, alpha: 0.95 },
  rain: { color: 0x8ea6bb, size: 0.34, fall: -34, drift: 0.3, tumble: 0.1, swing: 0.3, alpha: 0.78 },
  snow: { color: 0xffffff, size: 0.42, fall: -2.4, drift: 1.2, tumble: 0.6, swing: 0.6, alpha: 0.85 },
  flurry: { color: 0xf2f8ff, size: 0.24, fall: -4.2, drift: 2.4, tumble: 1.2, swing: 1.4, alpha: 0.6 },
};

/**
 * Weather as a reusable point cloud. One buffer, re-seeded when the kind
 * changes, so switching seasons never allocates. `fraction` lets a secondary
 * layer run thinner than the primary without a second buffer size.
 */
function makeWeather(fraction = 1) {
  const COUNT = 1400;
  const pos = new Float32Array(COUNT * 3);
  const vel = new Float32Array(COUNT * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setDrawRange(0, Math.floor(COUNT * fraction));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.5,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 30;

  const R = 46;
  const H = 40;
  const rand = rng(7);
  const seed = (i) => {
    pos[i * 3] = (rand() - 0.5) * R * 2;
    pos[i * 3 + 1] = rand() * H;
    pos[i * 3 + 2] = (rand() - 0.5) * R * 2;
  };
  for (let i = 0; i < COUNT; i++) seed(i);

  let kind = 'none';
  const setKind = (k) => {
    if (k === kind) return;
    kind = k;
    const spec = KINDS[k];
    if (spec) {
      mat.color.setHex(spec.color);
      mat.size = spec.size;
    }
    const drift = spec ? spec.drift : 0.3;
    for (let i = 0; i < COUNT; i++) {
      vel[i * 3] = (rand() - 0.5) * drift;
      vel[i * 3 + 1] = spec ? spec.fall : -1.4;
      vel[i * 3 + 2] = (rand() - 0.5) * drift;
    }
  };

  const update = (dt, strength, t) => {
    const spec = KINDS[kind];
    const live = strength > 0.01 && spec && spec.fall !== 0;
    points.visible = !!live;
    if (!live) return;
    mat.opacity = strength * spec.alpha * fraction;
    for (let i = 0; i < COUNT * fraction; i++) {
      const j = i * 3;
      // Tumble is what separates blossom and leaves from precipitation: they
      // swing laterally instead of falling in a straight line.
      pos[j] += (vel[j] + Math.sin(t * spec.swing + i) * spec.tumble) * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += (vel[j + 2] + Math.cos(t * spec.swing * 0.8 + i) * spec.tumble) * dt;
      if (pos[j + 1] < 0) {
        pos[j] = (rand() - 0.5) * R * 2;
        pos[j + 1] = H;
        pos[j + 2] = (rand() - 0.5) * R * 2;
      }
    }
    geo.attributes.position.needsUpdate = true;
  };

  return { points, setKind, update };
}

export function createEnvironment(scene) {
  const lot = new THREE.Group();
  lot.visible = false;
  scene.add(lot);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x6d8a4f, roughness: 1 });
  // Must reach past the fog's far plane from any camera position, or you see
  // the disc end against the sky — the second horizon the fog was meant to hide.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(520, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  lot.add(ground);

  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x445c38,
    roughness: 1,
    flatShading: true,
  });
  const snowMat = new THREE.MeshStandardMaterial({
    color: 0xf2f6fa,
    roughness: 0.95,
    flatShading: true,
    transparent: true,
    opacity: 0,
  });

  const rand = rng(20260728);
  const treeline = makeTreeline(rand, canopyMat, snowMat);
  lot.add(treeline.trunks, treeline.canopies, treeline.caps);

  const weather = makeWeather(1);
  const weather2 = makeWeather(0.55);
  lot.add(weather.points, weather2.points);

  return { lot, groundMat, canopyMat, snowMat, weather, weather2, treeline };
}

const cA = new THREE.Color();
const cB = new THREE.Color();
const mix = (a, b, t) => cA.setHex(a).lerp(cB.setHex(b), t).getHex();
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Blend two skies into a CSS gradient, with the horizon band placed where the
 * 3D horizon ACTUALLY falls on screen.
 *
 * Fixed stops were the whole "two horizons" problem. The 3D horizon sits at
 * `0.5 - 0.5*tan(el)/tan(fov/2)` from the top, which moves from about 10% to
 * 29% across the sections as the camera elevation changes. A gradient still
 * mid-transition at that row meets a ground plane already fogged to the horizon
 * colour, and the mismatch draws a second line. Anchoring the last two stops to
 * the live horizon means the two always meet at the same colour.
 */
export function skyGradient(from, to, t, horizonFrac = 0.36) {
  const h = Math.max(0.04, Math.min(0.9, horizonFrac));
  const stops = [0, h * 0.4, h * 0.9, 1];
  const parts = from.map((hex, i) => {
    const c = cA.set(hex).lerp(cB.set(to[i]), t);
    return `#${c.getHexString()} ${(stops[i] * 100).toFixed(1)}%`;
  });
  return `linear-gradient(to bottom, ${parts.join(', ')})`;
}

/**
 * Position within the year, from scroll progress. Returns the blended season
 * plus the CSS sky, so the page backdrop and the 3D fog stay in agreement.
 */
export function seasonAt(p) {
  const span = 1 / (SEASONS.length - 1);
  const i = Math.min(SEASONS.length - 2, Math.floor(p / span));
  const t = Math.min(1, Math.max(0, (p - i * span) / span));
  const a = SEASONS[i];
  const b = SEASONS[i + 1];
  return {
    a,
    b,
    t,
    label: t < 0.5 ? a.label : b.label,
    ground: mix(a.ground, b.ground, t),
    tree: mix(a.tree, b.tree, t),
    fog: mix(a.fog, b.fog, t),
    skyFrom: a.sky,
    skyTo: b.sky,
    skyT: t,
    hemiGround: mix(a.hemi.ground, b.hemi.ground, t),
    hemiIntensity: lerp(a.hemi.intensity, b.hemi.intensity, t),
    keyColor: mix(a.key.color, b.key.color, t),
    keyIntensity: lerp(a.key.intensity, b.key.intensity, t),
    keyHeight: lerp(a.key.height, b.key.height, t),
    // Snow accumulates through the back half of autumn.
    snowCap: Math.max(0, Math.min(1, (p - 0.62) / 0.25)),
    fx: t < 0.5 ? a.fx : b.fx,
    weatherStrength: Math.abs(t - 0.5) * 2 * 0.75 + 0.25,
  };
}

/** Apply a blended season to the scene. */
export function applySeason(scene, env3d, grids, lights, s, onSeasons) {
  const { lot, groundMat, canopyMat, snowMat, weather, weather2 } = env3d;
  lot.visible = onSeasons;
  grids.forEach((g) => (g.visible = !onSeasons));
  if (!onSeasons) {
    scene.fog.color.setHex(0xffffff);
    lights.hemi.groundColor.setHex(0xdcd8cd);
    lights.hemi.intensity = 0.65;
    lights.key.color.setHex(0xfff4e6);
    lights.key.intensity = 2.1;
    lights.key.position.set(16, 20, 12);
    weather.points.visible = false;
    weather2.points.visible = false;
    return;
  }
  groundMat.color.setHex(s.ground);
  canopyMat.color.setHex(s.tree);
  snowMat.opacity = s.snowCap;
  // Skip the whole transparent pass for the caps outside winter.
  env3d.treeline.caps.visible = s.snowCap > 0.01;
  scene.fog.color.setHex(s.fog);
  lights.hemi.groundColor.setHex(s.hemiGround);
  lights.hemi.intensity = s.hemiIntensity;
  lights.key.color.setHex(s.keyColor);
  lights.key.intensity = s.keyIntensity;
  lights.key.position.set(16, s.keyHeight, 12);
  weather.setKind(s.fx[0]);
  weather2.setKind(s.fx[1]);
}
