import * as THREE from 'three';

// Dimension annotations drawn in 3D and labelled in HTML.
//
// The lines live in the scene so they sit in perspective with the building.
// The numbers are DOM nodes projected to screen coordinates each frame -- text
// stays crisp and readable at any camera angle, which sprite text does not.

const LINE_COLOR = 0x16181c;
const OFF = 2.4; // how far a dimension line sits off the building

export function buildDimensions(m, peakY, eaveY) {
  const W = m.width;
  const D = m.depth;
  const pts = [];
  const labels = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const seg = (a, b) => pts.push(a, b);

  /** A dimension run: witness lines at each end, ticks, and a label anchor. */
  function run(a, b, witnessA, witnessB, text) {
    seg(a, b);
    seg(witnessA, a);
    seg(witnessB, b);
    // Architectural ticks: a short slash through each end of the run.
    const dir = b.clone().sub(a).normalize();
    const tick = new THREE.Vector3(dir.z, dir.y === 0 ? 0.6 : 0, -dir.x)
      .normalize()
      .multiplyScalar(0.35);
    if (tick.lengthSq() < 0.001) tick.set(0.35, 0, 0);
    seg(a.clone().sub(tick), a.clone().add(tick));
    seg(b.clone().sub(tick), b.clone().add(tick));
    labels.push({ pos: a.clone().lerp(b, 0.5), text });
  }

  const zf = D / 2;
  const y0 = 0.06;

  // Width, across the front
  run(
    v(-W / 2, y0, zf + OFF),
    v(W / 2, y0, zf + OFF),
    v(-W / 2, y0, zf),
    v(W / 2, y0, zf),
    `${W}'`
  );

  // Depth, down the right side
  run(
    v(W / 2 + OFF, y0, -D / 2),
    v(W / 2 + OFF, y0, D / 2),
    v(W / 2, y0, -D / 2),
    v(W / 2, y0, D / 2),
    `${D}'`
  );

  // Wall height, at the front-right corner. Both vertical runs live on the +x
  // side because that's the side the dimensions shot faces -- putting them on
  // the far side would bury them inside the building.
  run(
    v(W / 2 + OFF, 0, zf + OFF),
    v(W / 2 + OFF, eaveY, zf + OFF),
    v(W / 2, 0, zf),
    v(W / 2, eaveY, zf),
    `${m.wallHeight}' wall`
  );

  // Peak height, further out so it doesn't collide with the wall run
  run(
    v(W / 2 + OFF, 0, zf + OFF * 2.4),
    v(W / 2 + OFF, peakY, zf + OFF * 2.4),
    v(W / 2, 0, zf),
    v(W / 2, peakY, zf),
    `${peakY.toFixed(1)}' peak`
  );

  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  // depthTest stays on: with it off the vertical runs draw straight through the
  // roof, which reads as a rendering fault rather than a drawing.
  const mat = new THREE.LineBasicMaterial({
    color: LINE_COLOR,
    transparent: true,
    opacity: 0,
    fog: false,
  });
  const group = new THREE.Group();
  const lines = new THREE.LineSegments(geo, mat);
  group.add(lines);
  group.userData = { material: mat, labels };
  return group;
}

/**
 * Project each label to screen space and place its DOM node. Labels behind the
 * camera or outside the frustum are hidden rather than wrapped to the far side.
 */
export function layoutLabels(group, nodes, camera, width, height, opacity) {
  const { labels } = group.userData;
  const p = new THREE.Vector3();
  for (let i = 0; i < labels.length; i++) {
    const el = nodes[i];
    if (!el) continue;
    if (opacity < 0.01) {
      el.style.opacity = '0';
      continue;
    }
    p.copy(labels[i].pos).project(camera);
    const onScreen = p.z < 1 && p.x > -1.15 && p.x < 1.15 && p.y > -1.15 && p.y < 1.15;
    el.style.opacity = onScreen ? String(opacity) : '0';
    el.style.transform = `translate(-50%,-50%) translate(${(p.x * 0.5 + 0.5) * width}px, ${
      (-p.y * 0.5 + 0.5) * height
    }px)`;
  }
}

export function setDimensionOpacity(group, t) {
  group.userData.material.opacity = t;
  group.visible = t > 0.01;
}

export function disposeDimensions(group) {
  group.traverse((o) => {
    if (o.isLineSegments) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
}
