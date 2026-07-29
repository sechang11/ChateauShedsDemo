import * as THREE from 'three';

// Occasional life in the scene: birds crossing, a shaft of sun.
//
// Everything is allocated once. The scheduler never builds an event object --
// it flips a preallocated actor from idle to live and hands it a few scalars,
// so nothing here produces garbage in the frame loop.
//
// Two corrections worth recording, because both were wrong in the first design:
//
//  * Sun shafts use NORMAL blending, not additive. The sky bottoms out around
//    #d8e6e8 and winter is #e8eef4; additive over that clips every channel and
//    turns a warm shaft into a flat white blob. Normal blending with a colour
//    slightly brighter than the sky is the only thing that reads.
//  * Birds are pooled, and the POOL is the exclusion key, not the event name.
//    Letting a single bird and a flock be live together oversubscribed the
//    shared instance buffer and had two fade envelopes fighting over one
//    material opacity.

const MAX_BIRDS = 7;
const WING_TRIS = 2;

/** Deterministic per-session, but different each load. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeBirds(rand) {
  // One triangle per wing, two InstancedMeshes. A bird is 8-30px tall on
  // screen; anything more detailed is invisible detail at real cost.
  const wing = new THREE.BufferGeometry();
  wing.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0.28, -0.35, 1, 0.28, 0.35]), 3)
  );
  wing.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({
    color: 0x2f3438,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: true,
  });

  const left = new THREE.InstancedMesh(wing, mat, MAX_BIRDS);
  const right = new THREE.InstancedMesh(wing, mat, MAX_BIRDS);
  left.frustumCulled = false;
  right.frustumCulled = false;
  left.visible = false;
  right.visible = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  // Per-bird state, all preallocated.
  const birds = Array.from({ length: MAX_BIRDS }, () => ({
    az0: 0, sweep: 0, r: 0, y: 0, dy: 0, phase: 0, size: 1,
  }));
  let count = 0;
  let life = 0;
  let dur = 0;
  let loop = false;
  let relaunch = () => {};

  function launch(n, camDist, camAz, rand, persist = false) {
    loop = persist;
    relaunch = () => launch(n, camDist, camAz, rand, persist);
    count = Math.min(MAX_BIRDS, n);
    life = 0;
    dur = 7 + rand() * 5;
    // Enter just off one edge of the current view and sweep across it. Spawning
    // at a random azimuth around the full circle meant most flights happened
    // behind the camera and were never seen.
    // camAz is where the camera SITS on its orbit; it looks at the origin, so
    // the visible half of the world is camAz + PI. Entering at camAz put every
    // flight directly behind the viewer.
    const side = rand() < 0.5 ? -1 : 1;
    const entry = camAz + Math.PI + side * (0.42 + rand() * 0.2);
    // Radius scales off the live camera distance. Hardcoding it meant birds
    // read as giant moths when zoomed in and vanished when zoomed out.
    const base = Math.max(45, camDist * 1.6);
    for (let i = 0; i < count; i++) {
      const b = birds[i];
      b.az0 = entry + (rand() - 0.5) * 0.18 + i * 0.05 * -side;
      b.sweep = -side * (1.0 + rand() * 0.5);
      b.r = base * (0.85 + rand() * 0.5) + i * 3.5;
      // Altitude keys off the camera, not a fixed number. The camera sits at
      // roughly camDist*sin(el) and looks DOWN, so a fixed y of 26-48 put every
      // bird above the top of the frustum — they flew past off-screen.
      b.y = camDist * (0.3 + rand() * 0.25) + i * 1.4;
      b.dy = (rand() - 0.5) * 6;
      b.phase = rand() * Math.PI * 2;
      b.size = 1.5 + rand() * 0.9;
    }
    left.count = count;
    right.count = count;
    left.visible = true;
    right.visible = true;
  }

  function update(dt, t) {
    if (!left.visible) return;
    life += dt;
    let u = life / dur;
    if (u >= 1) {
      // Looping keeps the flock resident for the whole season instead of
      // crossing once and leaving the sky empty until the next random roll.
      if (loop) { life = 0; u = 0; relaunch(); } else {
        left.visible = false;
        right.visible = false;
        return;
      }
    }
    // Ease in and out so nothing pops into frame.
    mat.opacity = Math.min(1, Math.min(u, 1 - u) * 6) * 0.9;

    for (let i = 0; i < count; i++) {
      const b = birds[i];
      const az = b.az0 + b.sweep * u;
      const y = b.y + b.dy * u;
      p.set(Math.sin(az) * b.r, y, Math.cos(az) * b.r);

      // ~2 rad/s, so a 7-12s flight actually contains flap/glide alternation.
      // At the original 0.35 the cycle was 18s and most birds glided the whole
      // way past without ever flapping.
      const cycle = Math.sin(t * 2.0 + b.phase);
      const gliding = Math.sin(t * 0.5 + b.phase) < -0.25;
      const flap = gliding ? cycle * 0.08 : cycle * 0.55;

      const heading = az + b.sweep * 0.5 + Math.PI / 2;
      s.setScalar(b.size);

      e.set(flap, heading, 0.12);
      q.setFromEuler(e);
      left.setMatrixAt(i, m.compose(p, q, s));

      e.set(-flap, heading, -0.12);
      q.setFromEuler(e);
      s.set(b.size, b.size, -b.size); // mirror
      right.setMatrixAt(i, m.compose(p, q, s));
      s.setScalar(b.size);
    }
    left.instanceMatrix.needsUpdate = true;
    right.instanceMatrix.needsUpdate = true;
  }

  return {
    meshes: [left, right],
    launch,
    update,
    dismiss() { loop = false; },
    get live() { return left.visible; },
    get looping() { return loop && left.visible; },
  };
}

// Ground animals. Bodies and heads are two pooled InstancedMeshes; a "kind"
// is just a size, colour and gait, so chickens and cows share every buffer.
const HERD = 9;
const STOCK = {
  chickens: { body: 0xf2efe6, head: 0xc4453a, size: 0.55, spread: 16, bob: 3.2, walk: 0.5 },
  cows: { body: 0x2e2b28, head: 0xf2efe6, size: 2.3, spread: 26, bob: 0.7, walk: 0.18 },
  // Winter gets no livestock — just this, standing still. bob/walk of 0 turn
  // the peck-and-wander animation off without needing a separate actor.
  snowman: { body: 0xf7fbfe, head: 0xf7fbfe, size: 1.7, spread: 6, bob: 0, walk: 0 },
  deer: { body: 0x8a6a45, head: 0x9c7c53, size: 1.7, spread: 22, bob: 1.1, walk: 0.35 },
  rabbits: { body: 0xa8998a, head: 0xbfb2a4, size: 0.5, spread: 12, bob: 4.0, walk: 0.7 },
  squirrels: { body: 0x8a6a52, head: 0x9a7a60, size: 0.34, spread: 9, bob: 5.5, walk: 0.9 },
};

// Winter leaves tracks instead of livestock. Flat quads on the snow, laid in a
// wandering line — cheap, and it implies an animal without drawing one.
const PRINTS = 26;
function makeFootprints() {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xc8d4e0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const geo = new THREE.PlaneGeometry(0.34, 0.5);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, mat, PRINTS);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 2;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  let out = 0;
  let leaving = false;

  return {
    mesh,
    launch(camDist, camAz, rand) {
      const side = rand() < 0.5 ? -1 : 1;
      let a = camAz + Math.PI + side * (0.45 + rand() * 0.4);
      let r = Math.max(16, camDist * 0.36);
      let heading = rand() * Math.PI * 2;
      for (let i = 0; i < PRINTS; i++) {
        // A hopping gait: pairs of prints, wandering slightly as it goes.
        heading += (rand() - 0.5) * 0.35;
        r += 0.9 + rand() * 0.5;
        a += (rand() - 0.5) * 0.02;
        const x = Math.sin(a) * r + Math.cos(heading) * (i % 2 ? 0.28 : -0.28);
        const z = Math.cos(a) * r + Math.sin(heading) * (i % 2 ? 0.28 : -0.28);
        e.set(0, heading, 0);
        q.setFromEuler(e);
        mesh.setMatrixAt(i, m.compose(p.set(x, 0.03, z), q, s));
      }
      mesh.instanceMatrix.needsUpdate = true;
      out = 0;
      leaving = false;
      mesh.visible = true;
    },
    update(dt) {
      if (!mesh.visible) return;
      if (leaving) {
        out -= dt * 1.4;
        if (out <= 0) {
          mesh.visible = false;
          leaving = false;
          return;
        }
      } else if (out < 1) out = Math.min(1, out + dt * 0.9);
      mat.opacity = out * 0.55;
    },
    dismiss() {
      if (mesh.visible) leaving = true;
    },
    get live() {
      return mesh.visible && !leaving;
    },
  };
}

function makeStock() {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0 });
  const bodies = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), bodyMat, HERD);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), headMat, HERD);
  bodies.frustumCulled = false;
  heads.frustumCulled = false;
  bodies.visible = false;
  heads.visible = false;
  bodies.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const stock = Array.from({ length: HERD }, () => ({ x: 0, z: 0, dir: 0, phase: 0, sc: 1 }));

  let count = 0;
  let life = 0;
  let dur = 0;
  let spec = STOCK.chickens;
  let current = null;   // which kind is resident
  let leaving = false;  // season has moved on; fade out
  let out = 0;          // 0..1 presence

  function launch(kind, camDist, camAz, rand) {
    current = kind;
    leaving = false;
    out = 0;
    spec = STOCK[kind] || STOCK.chickens;
    count = kind === 'snowman' ? 1 : kind === 'cows' ? 3 + Math.floor(rand() * 3) : 4 + Math.floor(rand() * 5);
    life = 0;
    dur = kind === 'snowman' ? 30 + rand() * 20 : 16 + rand() * 10;
    // camAz + PI is the far side of the building — which is exactly where the
    // BUILDING is, from the camera's point of view. Every previous herd was
    // placed in its shadow and occluded. They need a lateral offset to clear it.
    const side = rand() < 0.5 ? -1 : 1;
    const centre = camAz + Math.PI + side * (0.5 + rand() * 0.45);
    // Ground nearer than about camY/tan(el+halfFov) is below the frustum, so
    // hug the middle distance rather than crowding the camera.
    const r = Math.max(18, camDist * 0.4);
    for (let i = 0; i < count; i++) {
      const a = centre + (rand() - 0.5) * 0.4;
      const rr = r + rand() * spec.spread;
      stock[i].x = Math.sin(a) * rr;
      stock[i].z = Math.cos(a) * rr;
      stock[i].dir = rand() * Math.PI * 2;
      stock[i].phase = rand() * Math.PI * 2;
      stock[i].sc = spec.size * (0.85 + rand() * 0.3);
    }
    bodyMat.color.setHex(spec.body);
    headMat.color.setHex(spec.head);
    bodies.count = count;
    heads.count = count;
    bodies.visible = true;
    heads.visible = true;
  }

  function update(dt, t) {
    if (!bodies.visible) return;
    life += dt;
    // Resident, not a timed event: the herd belongs to the season and only
    // leaves when the season does.  is set by the season change, and
    // the fade runs down rather than the clock running out.
    if (leaving) {
      out -= dt * 1.4;
      if (out <= 0) { bodies.visible = false; heads.visible = false; leaving = false; return; }
    } else if (out < 1) {
      out = Math.min(1, out + dt * 1.4);
    }
    const fade = out;
    bodyMat.opacity = fade;
    headMat.opacity = fade;

    for (let i = 0; i < count; i++) {
      const a = stock[i];
      // A slow wander, and a head that dips to the ground to feed.
      a.x += Math.sin(a.dir) * spec.walk * dt;
      a.z += Math.cos(a.dir) * spec.walk * dt;
      a.dir += Math.sin(t * 0.3 + a.phase) * dt * 0.4;
      const sc = a.sc;

      p.set(a.x, sc * 0.85, a.z);
      e.set(0, a.dir, 0);
      q.setFromEuler(e);
      s.set(sc * 1.25, sc * 0.9, sc);
      bodies.setMatrixAt(i, m.compose(p, q, s));

      const peck = Math.max(0, Math.sin(t * spec.bob + a.phase));
      p.set(
        a.x + Math.sin(a.dir) * sc * 1.15,
        sc * (1.5 - peck * 0.95),
        a.z + Math.cos(a.dir) * sc * 1.15
      );
      s.setScalar(sc * 0.48);
      heads.setMatrixAt(i, m.compose(p, q, s));
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }

  return {
    meshes: [bodies, heads],
    launch,
    update,
    dismiss() { if (bodies.visible) leaving = true; },
    get kind() { return bodies.visible && !leaving ? current : null; },
    get live() { return bodies.visible; },
  };
}

/** A rainbow: concentric torus arcs, normal-blended so it tints rather than clips. */
function makeRainbow() {
  const group = new THREE.Group();
  const BANDS = [0xd06a6a, 0xd69a5a, 0xd8cc6a, 0x76b276, 0x6a90c8, 0x8a72b8];
  const mats = [];
  BANDS.forEach((hex, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });
    mats.push(mat);
    // Thin arcs stacked outward; a torus half is the cheapest true arc there is.
    // A real rainbow's centre sits BELOW the horizon, which is also what keeps
    // it in frame: centred at y=0 the arc peaked at y=58, far above a camera
    // that only sees to about y=21.
    const arc = new THREE.Mesh(new THREE.TorusGeometry(96 + i * 3.4, 1.6, 3, 64, Math.PI), mat);
    arc.position.set(0, -62, -70);
    group.add(arc);
  });
  group.visible = false;
  group.renderOrder = 24;

  let life = 0;
  let dur = 0;
  return {
    group,
    launch(camAz, rand) {
      life = 0;
      dur = 14 + rand() * 8;
      // Opposite the sun, which is what a real one does — and conveniently
      // that is the half of the world the camera is already looking at.
      group.rotation.y = camAz + Math.PI;
      group.visible = true;
    },
    update(dt) {
      if (!group.visible) return;
      life += dt;
      const u = life / dur;
      if (u >= 1) {
        group.visible = false;
        return;
      }
      const a = Math.min(1, Math.min(u, 1 - u) * 5) * 0.3;
      mats.forEach((m) => (m.opacity = a));
    },
    get live() {
      return group.visible;
    },
  };
}

function makeSun() {
  // A fan of soft quads standing in the air. Normal-blended, tinted just above
  // the sky, so it lightens rather than clips.
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfffaf0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    fog: false,
  });
  // Anchored low and near, so the shafts land inside a frustum that is aimed
  // down at a building rather than up at the sky.
  for (let i = 0; i < 5; i++) {
    const w = 6 + i * 2.2;
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(w, 80), mat);
    shaft.position.set(-18 + i * 10, 24, -26 - i * 4);
    shaft.rotation.set(-0.5, 0.55, 0.2 + i * 0.05);
    group.add(shaft);
  }
  group.visible = false;
  group.renderOrder = 25;

  let life = 0;
  let dur = 0;
  return {
    group,
    launch(rand) {
      life = 0;
      dur = 9 + rand() * 7;
      group.visible = true;
    },
    update(dt) {
      if (!group.visible) return;
      life += dt;
      const u = life / dur;
      if (u >= 1) {
        group.visible = false;
        return;
      }
      // Peak alpha stays low deliberately — see the note at the top of the file.
      mat.opacity = Math.min(1, Math.min(u, 1 - u) * 4) * 0.09;
    },
    get live() {
      return group.visible;
    },
  };
}

/**
 * @param scene       THREE.Scene to attach to
 * @param getContext  () => ({ season, camDist, reduced }) read each frame
 */
export function createAmbient(scene, getContext) {
  const rand = rng(Date.now() & 0xffff);
  const birds = makeBirds(rand);
  const stock = makeStock();
  const prints = makeFootprints();
  const rainbow = makeRainbow();
  const sun = makeSun();
  const root = new THREE.Group();
  root.add(...birds.meshes, ...stock.meshes, prints.mesh, rainbow.group, sun.group);
  scene.add(root);

  let clock = 0;
  let nextAt = 3 + rand() * 4;

  // One animal and one special per season, alongside the weather that
  // environment.js already drives. Chickens because they sell coops; cows
  // because a summer field wants something in it.
  // A roster per season rather than a single animal, so the lot isn't identical
  // every time you pass through the same month. One is chosen when the season
  // takes over and stays for its whole run.
  const SEASON = {
    spring: { animals: ['chickens', 'rabbits'], special: 'rainbow' },
    summer: { animals: ['cows', 'deer'], special: 'sun' },
    autumn: { animals: ['deer', 'geese', 'squirrels'], special: 'rainbow' },
    winter: { animals: ['snowman'], special: 'sun' },
  };
  // Which animal this season settled on. Re-rolled only when the season changes,
  // never per frame — otherwise the herd would flicker between species.
  let chosen = null;
  let chosenFor = null;

  function fire(kind, camDist, camAz, season) {
    const cfg = SEASON[season] || SEASON.summer;
    if (kind === 'animal') {
      if (cfg.animal === 'chickens' || cfg.animal === 'cows' || cfg.animal === 'snowman') {
        stock.launch(cfg.animal, camDist, camAz, rand);
      } else {
        // Geese travel in a flock; winter crows come in ones and twos.
        const n = cfg.animal === 'geese' ? 5 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 2);
        birds.launch(n, camDist, camAz, rand);
      }
    } else if (cfg.special === 'rainbow') rainbow.launch(camAz, rand);
    else sun.launch(rand);
  }

  function update(dt) {
    const { season, camDist, camAz, reduced, enabled } = getContext();
    if (!enabled || reduced) {
      root.visible = false;
      return;
    }
    root.visible = true;
    birds.update(dt, clock);
    stock.update(dt, clock);
    prints.update(dt);
    rainbow.update(dt);
    sun.update(dt);

    clock += dt;

    // The animal is a RESIDENT, not an event. Whatever the season is, its
    // animal should be standing there — the only thing that removes one is the
    // season changing under it as the page rotates.
    const cfg = SEASON[season] || SEASON.summer;
    if (chosenFor !== season) {
      chosenFor = season;
      chosen = cfg.animals[Math.floor(rand() * cfg.animals.length)];
    }
    const grounded = chosen !== 'geese';

    if (grounded) {
      if (birds.live) birds.dismiss();
      if (stock.kind !== chosen) {
        // Fade the old one out first, and only bring the new one in once the
        // ground is clear — otherwise chickens pop straight into cows.
        if (stock.live) stock.dismiss();
        else stock.launch(chosen, camDist, camAz, rand);
      }
    } else {
      if (stock.live) stock.dismiss();
      if (!birds.looping) birds.launch(5 + Math.floor(rand() * 3), camDist, camAz, rand, true);
    }

    // Tracks in the snow, winter only, alongside the snowman.
    if (season === 'winter') {
      if (!prints.live && !prints.mesh.visible) prints.launch(camDist, camAz, rand);
    } else if (prints.live) prints.dismiss();

    // Only the SPECIAL is still occasional — a rainbow that never leaves stops
    // being a rainbow.
    if (clock < nextAt) return;
    nextAt = clock + 12 + rand() * 16;
    const specialBusy = cfg.special === 'rainbow' ? rainbow.live : sun.live;
    if (!specialBusy) fire('special', camDist, camAz, season);
  }

  return {
    update,
    fire: (k, d = 40, a = 0, s = 'summer') => fire(k, d, a, s),
    root,
  };
}
