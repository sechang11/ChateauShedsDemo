import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildShed } from './shed.js';

// The catalogue as a field of real buildings standing on the drafting grid.
//
// Naively this is 35 buildings x 120-380 meshes = ~8,000 draw calls, which is
// not viable. But every building is made of a handful of shared materials, so
// collapsing each one to a single mesh PER MATERIAL takes it to ~7 draws per
// building — around 240 total. That is real geometry, no billboards, no LOD.
//
// Scrolling moves the camera along the rows rather than orbiting: on the model
// page rotation is the gesture, here it is travel.

const COLS = 5;
const CELL_X = 42;
const CELL_Z = 46;
const SKIP = new Set(['framing', 'daylight']); // never visible on a catalogue tile

/** Collapse one building to one mesh per material. */
function mergeBuilding(model) {
  const src = buildShed(model);
  src.updateMatrixWorld(true);

  const mats = src.userData.materials;
  const skip = new Set([...SKIP].map((k) => mats[k]).filter(Boolean));

  const byMat = new Map();
  src.traverse((o) => {
    if (!o.isMesh || skip.has(o.material)) return;
    // The framing group is hidden wholesale; its children still report visible.
    let p = o;
    let hidden = false;
    while (p) {
      if (p.visible === false) hidden = true;
      p = p.parent;
    }
    if (hidden) return;
    // BoxGeometry is indexed; ExtrudeGeometry (the gable ends) is not, and
    // mergeGeometries refuses a mixed batch — it returns null and the whole
    // material group vanishes silently. Normalise everything to non-indexed
    // first so a building can't lose parts of itself.
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });

  const group = new THREE.Group();
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (merged) group.add(new THREE.Mesh(merged, mat));
  }
  // Drop the source geometry but keep the materials — the merged meshes use them.
  src.traverse((o) => {
    if (o.isMesh) o.geometry.dispose();
  });

  group.userData.model = model;
  return group;
}

export function createMatrix(renderer, models, onPick) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 90, 340);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 900);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xdcd8cd, 0.72));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
  key.position.set(30, 46, 24);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe4edf5, 0.5);
  fill.position.set(-24, 16, -18);
  scene.add(fill);

  const rows = Math.ceil(models.length / COLS);
  const spanX = (COLS - 1) * CELL_X;
  const spanZ = (rows - 1) * CELL_Z;

  // Same drafting grid as the model page, sized to the field.
  const grid = new THREE.GridHelper(Math.max(spanX, spanZ) + 220, 60, 0xd9d7d1, 0xe6e4de);
  grid.material.transparent = true;
  grid.material.opacity = 0.8;
  grid.position.set(spanX / 2, 0, spanZ / 2);
  scene.add(grid);

  const field = new THREE.Group();
  scene.add(field);

  const cells = [];
  let built = 0;

  /** Build one row per frame so opening the sheet never blocks. */
  function buildNext() {
    if (built >= models.length) return false;
    const model = models[built];
    const g = mergeBuilding(model);
    const col = built % COLS;
    const row = Math.floor(built / COLS);
    g.position.set(col * CELL_X, 0, row * CELL_Z);
    g.rotation.y = -0.42; // a consistent three-quarter presentation
    field.add(g);
    cells.push({
      group: g,
      model,
      x: col * CELL_X,
      z: row * CELL_Z,
      lift: 0,
      target: 0,
    });
    built++;
    return true;
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();
  let hovered = null;

  /** Pick by intersecting the ground and reading the cell off x/z — far
   *  cheaper than raycasting 240 merged meshes every mouse move. */
  function pick(nx, ny) {
    pointer.set(nx, ny);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return null;
    const col = Math.round(hitPoint.x / CELL_X);
    const row = Math.round(hitPoint.z / CELL_Z);
    if (col < 0 || col >= COLS || row < 0 || row >= rows) return null;
    const idx = row * COLS + col;
    if (idx >= cells.length) return null;
    const c = cells[idx];
    // Only count it as a hover if the pointer is actually near the building.
    if (Math.abs(hitPoint.x - c.x) > CELL_X * 0.42) return null;
    if (Math.abs(hitPoint.z - c.z) > CELL_Z * 0.42) return null;
    return c;
  }

  function setHover(c) {
    hovered = c;
    for (const cell of cells) cell.target = cell === c ? 1 : 0;
  }

  let scrollT = 0;
  const camTarget = new THREE.Vector3();

  function update(t, dt) {
    scrollT = t;
    // Travel down the rows. A little lead-in and lead-out so the first and last
    // rows are fully framed rather than clipped at the edge of the sweep.
    const z = -CELL_Z * 0.9 + t * (spanZ + CELL_Z * 1.8);
    camTarget.set(spanX / 2, 4, z);
    // Far enough back to hold all five columns. spanX is 168 units across, and
    // at 36deg vertical that needs roughly 175 of standoff — not the 69 the
    // first pass used, which framed a single building.
    camera.position.set(camTarget.x, 118, camTarget.z + 132);
    camera.lookAt(camTarget.x, 0, camTarget.z - 14);
    camera.updateMatrixWorld(true);

    for (const c of cells) {
      c.lift += (c.target - c.lift) * Math.min(1, dt * 9);
      c.group.position.y = c.lift * 2.2;
      c.group.rotation.y = -0.42 + c.lift * 0.28;
    }
  }

  function resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function render() {
    renderer.render(scene, camera);
  }

  return {
    scene,
    camera,
    cells,
    buildNext,
    get built() {
      return built;
    },
    total: models.length,
    rows,
    pick,
    setHover,
    get hovered() {
      return hovered;
    },
    update,
    resize,
    render,
  };
}
