import * as THREE from 'three';

// Procedural building builder.
//
// The whole model is derived from a catalog entry: dimensions, a roof type, a
// wall treatment, a door type, and colors. No downloaded geometry, no textures
// -- a new building is an object literal in catalog.js, not an asset pipeline.
//
// Coordinates: y = 0 is the ground. +z is the front of the building (the side
// the door lives on). Units are feet.

const SKID_H = 0.5;
const DECK_H = 0.35;
// Walls start just below the deck surface (0.85) so nothing ends up exactly
// coplanar with it -- the battens land at 0.95 and stop z-fighting the deck.
const FLOOR_TOP = 0.8;
const ROOF_T = 0.24;
const WALL_T = 0.32;
const STUD_SPACING = 16 / 12; // 16" on center, the spec the copy claims

/**
 * The roof as a 2D polyline across the width, left eave to right eave.
 * Everything downstream (panels, gable ends, ridge, trusses) is derived from
 * this, so adding a roof style means adding a case here and nothing else.
 */
export function roofProfile(type, W, wallH, pitch) {
  const half = W / 2;
  switch (type) {
    case 'lean':
      return [
        [-half, wallH],
        [half, wallH + W * pitch * 0.55],
      ];
    case 'gambrel': {
      const q = W / 4;
      const lower = wallH + q * pitch * 2.1;
      const peak = lower + q * pitch * 0.85;
      return [
        [-half, wallH],
        [-q, lower],
        [0, peak],
        [q, lower],
        [half, wallH],
      ];
    }
    case 'gable':
    default:
      return [
        [-half, wallH],
        [0, wallH + half * pitch],
        [half, wallH],
      ];
  }
}

function makeMaterials(colors) {
  return {
    siding: new THREE.MeshStandardMaterial({ color: colors.siding, roughness: 0.85 }),
    trim: new THREE.MeshStandardMaterial({ color: colors.trim, roughness: 0.7 }),
    roof: new THREE.MeshStandardMaterial({
      color: colors.roof,
      roughness: 0.42,
      metalness: 0.25,
    }),
    door: new THREE.MeshStandardMaterial({ color: colors.door, roughness: 0.6 }),
    foundation: new THREE.MeshStandardMaterial({
      color: colors.foundation,
      roughness: 0.95,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: '#4d5b66',
      roughness: 0.08,
      metalness: 0.9,
    }),
    glazing: new THREE.MeshStandardMaterial({
      color: '#b9cbd4',
      roughness: 0.05,
      metalness: 0.35,
      transparent: true,
      opacity: 0.42,
    }),
    framing: new THREE.MeshStandardMaterial({ color: '#a8763c', roughness: 0.9 }),
    // Openings are surface appliqué, not holes cut through the wall, so from
    // inside there'd be no daylight at all. These panels sit on the inner face
    // where each opening is and stand in for it.
    daylight: new THREE.MeshBasicMaterial({ color: '#e8f0f4' }),
  };
}

/**
 * Remember each material's intended opacity. Glazing is meant to stay
 * semi-transparent, so any code that fades the building has to scale from this
 * rather than driving every material to a flat 1.
 */
function tagBaseOpacity(materials) {
  for (const m of Object.values(materials)) m.userData.baseOpacity = m.opacity;
  return materials;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildShed(preset) {
  const {
    width: W,
    depth: D,
    wallHeight: wallH,
    roof: roofType,
    pitch,
    overhang,
    porch = 0,
    door,
    windows,
    frontOpen = false,
    walls = 'solid',
    bays = 1,
  } = preset;

  const glazed = walls === 'glass';
  const materials = tagBaseOpacity(makeMaterials(preset.colors));
  const wallMat = glazed ? materials.glazing : materials.siding;
  const root = new THREE.Group();

  const bodyDepth = D - porch;
  const bodyZ = -porch / 2; // walls slide back to make room for the porch
  const frontZ = bodyZ + bodyDepth / 2;
  const backZ = bodyZ - bodyDepth / 2;

  // Framing lives in its own group so the cutaway can reveal it without
  // rebuilding anything.
  const framing = new THREE.Group();
  framing.visible = false;
  root.add(framing);

  // --- foundation -----------------------------------------------------------
  const skidInset = Math.min(1.2, W / 6);
  for (const sx of [-1, 1]) {
    const skid = box(
      0.55,
      SKID_H,
      D - 0.4,
      materials.foundation,
      sx * (W / 2 - skidInset),
      SKID_H / 2,
      0
    );
    root.add(skid);
    framing.add(
      box(0.6, SKID_H + 0.02, D - 0.4, materials.framing, skid.position.x, SKID_H / 2, 0)
    );
  }
  root.add(box(W, DECK_H, D, materials.foundation, 0, SKID_H + DECK_H / 2, 0));
  // Floor joists, visible in the cutaway
  const joists = Math.floor(D / STUD_SPACING);
  for (let i = 0; i <= joists; i++) {
    framing.add(
      box(
        W - 0.3,
        DECK_H,
        0.14,
        materials.framing,
        0,
        SKID_H + DECK_H / 2,
        -D / 2 + (D / joists) * i
      )
    );
  }

  // --- body (walls + roof), lifted onto the deck ----------------------------
  const body = new THREE.Group();
  body.position.y = FLOOR_TOP;
  root.add(body);

  const bodyFraming = new THREE.Group();
  bodyFraming.position.y = FLOOR_TOP;
  framing.add(bodyFraming);

  // Walls are four separate panels rather than one box, so a wall can be
  // omitted (run-in sheds) or swapped to glass (greenhouses) independently.
  const panels = [
    { id: 'back', span: W, axis: 'x', x: 0, z: backZ, rotY: 0 },
    { id: 'left', span: bodyDepth, axis: 'z', x: -W / 2, z: bodyZ, rotY: Math.PI / 2 },
    { id: 'right', span: bodyDepth, axis: 'z', x: W / 2, z: bodyZ, rotY: Math.PI / 2 },
  ];
  if (!frontOpen) panels.push({ id: 'front', span: W, axis: 'x', x: 0, z: frontZ, rotY: 0 });

  for (const p of panels) {
    const w = p.axis === 'x' ? p.span : WALL_T;
    const d = p.axis === 'x' ? WALL_T : p.span;
    body.add(box(w, wallH, d, wallMat, p.x, wallH / 2, p.z));

    // Board-and-batten (solid walls) or mullions (glass walls)
    const gap = glazed ? 2.4 : 1.15;
    const n = Math.max(2, Math.round(p.span / gap));
    for (let i = 1; i < n; i++) {
      const t = -p.span / 2 + (p.span / n) * i;
      const bw = p.axis === 'x' ? 0.14 : 0.09;
      const bd = p.axis === 'x' ? 0.09 : 0.14;
      body.add(
        box(
          bw,
          wallH - (glazed ? 0 : 0.3),
          bd,
          materials.trim,
          p.axis === 'x' ? p.x + t : p.x + Math.sign(p.x) * 0.2,
          wallH / 2,
          p.axis === 'x' ? p.z + Math.sign(p.z || 1) * 0.2 : p.z + t
        )
      );
    }
    if (glazed) {
      // A horizontal rail so the glazing reads as a frame, not a fish tank
      const rw = p.axis === 'x' ? p.span : 0.12;
      const rd = p.axis === 'x' ? 0.12 : p.span;
      body.add(box(rw, 0.14, rd, materials.trim, p.x, wallH * 0.55, p.z));
    }

    // Studs at 16" O.C. for the cutaway
    const studs = Math.floor(p.span / STUD_SPACING);
    for (let i = 0; i <= studs; i++) {
      const t = -p.span / 2 + (p.span / studs) * i;
      bodyFraming.add(
        box(
          p.axis === 'x' ? 0.13 : WALL_T,
          wallH,
          p.axis === 'x' ? WALL_T : 0.13,
          materials.framing,
          p.axis === 'x' ? p.x + t : p.x,
          wallH / 2,
          p.axis === 'x' ? p.z : p.z + t
        )
      );
    }
    // Top and bottom plates
    for (const y of [0.08, wallH - 0.08]) {
      bodyFraming.add(
        box(
          p.axis === 'x' ? p.span : WALL_T,
          0.16,
          p.axis === 'x' ? WALL_T : p.span,
          materials.framing,
          p.x,
          y,
          p.z
        )
      );
    }
  }

  // An open front needs posts and a header where the wall would have been.
  if (frontOpen) {
    for (const sx of [-1, 1]) {
      body.add(box(0.42, wallH, 0.42, materials.trim, sx * (W / 2 - 0.3), wallH / 2, frontZ));
    }
    body.add(box(W, 0.5, 0.42, materials.trim, 0, wallH - 0.25, frontZ));
  }

  // Corner trim
  if (!glazed) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        if (frontOpen && sz > 0) continue;
        body.add(
          box(
            0.34,
            wallH,
            0.34,
            materials.trim,
            sx * (W / 2 + 0.06),
            wallH / 2,
            bodyZ + sz * (bodyDepth / 2 + 0.06)
          )
        );
      }
    }
  }

  // --- roof -----------------------------------------------------------------
  const profile = roofProfile(roofType, W, wallH, pitch);
  const roofDepth = D + overhang * 2;
  const roofMat = glazed ? materials.glazing : materials.roof;
  const roofGroup = new THREE.Group();
  body.add(roofGroup);

  for (let i = 0; i < profile.length - 1; i++) {
    let [x0, y0] = profile[i];
    let [x1, y1] = profile[i + 1];

    // Only the outermost segments get an eave overhang.
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len0 = Math.hypot(dx, dy);
    const ux = dx / len0;
    const uy = dy / len0;
    if (i === 0) {
      x0 -= ux * overhang;
      y0 -= uy * overhang;
    }
    if (i === profile.length - 2) {
      x1 += ux * overhang;
      y1 += uy * overhang;
    }

    const len = Math.hypot(x1 - x0, y1 - y0);
    const angle = Math.atan2(y1 - y0, x1 - x0);
    // Outward normal for a left-to-right polyline.
    const nx = -uy;
    const ny = ux;
    const cx = (x0 + x1) / 2 + nx * (ROOF_T / 2);
    const cy = (y0 + y1) / 2 + ny * (ROOF_T / 2);

    const panel = box(len, ROOF_T, roofDepth, roofMat, cx, cy, 0);
    panel.rotation.z = angle;
    roofGroup.add(panel);

    // Standing-seam ribs, running down-slope. Glass roofs get none.
    if (!glazed) {
      const ribs = Math.floor(roofDepth / 1.25);
      for (let r = 0; r <= ribs; r++) {
        const z = -roofDepth / 2 + (roofDepth / ribs) * r;
        const rib = box(len, 0.08, 0.13, materials.roof, 0, ROOF_T / 2 + 0.04, z);
        rib.castShadow = false;
        panel.add(rib);
      }
    }
  }

  // Rafters following the roof profile, every 2ft, for the cutaway
  const bays_ = Math.max(2, Math.floor(D / 2));
  for (let r = 0; r <= bays_; r++) {
    const z = -D / 2 + (D / bays_) * r;
    for (let i = 0; i < profile.length - 1; i++) {
      const [x0, y0] = profile[i];
      const [x1, y1] = profile[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const rafter = box(
        len,
        0.16,
        0.13,
        materials.framing,
        (x0 + x1) / 2,
        (y0 + y1) / 2,
        z
      );
      rafter.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      bodyFraming.add(rafter);
    }
    // Bottom chord ties the truss together at the eave line
    bodyFraming.add(box(W, 0.16, 0.13, materials.framing, 0, wallH, z));
  }

  // Ridge cap over the highest vertex
  const peak = profile.reduce((a, p) => (p[1] > a[1] ? p : a), profile[0]);
  if (roofType !== 'lean' && !glazed) {
    roofGroup.add(
      box(0.5, 0.18, roofDepth, materials.roof, peak[0], peak[1] + ROOF_T * 0.75, 0)
    );
  }

  // Gable end walls: the polygon between the eave line and the roof profile.
  // Close along y = wallH rather than straight back to the start -- on a
  // single-slope roof the two ends sit at different heights, and closing
  // directly would collapse the shape to zero area and leave the end open.
  const gableShape = new THREE.Shape();
  gableShape.moveTo(profile[0][0], profile[0][1]);
  for (let i = 1; i < profile.length; i++) gableShape.lineTo(profile[i][0], profile[i][1]);
  gableShape.lineTo(profile[profile.length - 1][0], wallH);
  gableShape.lineTo(profile[0][0], wallH);
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, {
    depth: 0.3,
    bevelEnabled: false,
  });
  gableGeo.translate(0, 0, -0.15);
  for (const z of [frontZ, backZ]) {
    const g = new THREE.Mesh(gableGeo, wallMat);
    g.position.z = z;
    g.castShadow = true;
    g.receiveShadow = true;
    body.add(g);
  }

  // A roof whose two ends sit at different heights (single slope) leaves the
  // high side wall short of the roofline. Fill the gap. Gable and gambrel both
  // end at wallH on each side, so this is a no-op for them.
  for (const end of [profile[0], profile[profile.length - 1]]) {
    const rise = end[1] - wallH;
    if (rise <= 0.01) continue;
    body.add(box(0.34, rise, bodyDepth, wallMat, end[0], wallH + rise / 2, bodyZ));
    const n = Math.max(2, Math.round(bodyDepth / 1.15));
    for (let i = 1; i < n; i++) {
      body.add(
        box(
          0.07,
          rise,
          0.14,
          materials.trim,
          end[0] + (end[0] > 0 ? 0.2 : -0.2),
          wallH + rise / 2,
          bodyZ - bodyDepth / 2 + (bodyDepth / n) * i
        )
      );
    }
  }

  // Fascia along both eaves
  for (const sx of [-1, 1]) {
    const edge = sx < 0 ? profile[0] : profile[profile.length - 1];
    const nb = sx < 0 ? profile[1] : profile[profile.length - 2];
    const ux = Math.sign(edge[0] - nb[0]);
    const slope = (edge[1] - nb[1]) / (edge[0] - nb[0]);
    body.add(
      box(
        0.16,
        0.55,
        roofDepth,
        materials.trim,
        edge[0] + ux * overhang,
        edge[1] + slope * ux * overhang - 0.28,
        0
      )
    );
  }

  // --- porch ----------------------------------------------------------------
  if (porch > 0) {
    const porchZ = D / 2 - porch / 2;
    root.add(box(W, DECK_H, porch, materials.foundation, 0, SKID_H + DECK_H / 2, porchZ));
    for (const sx of [-1, 1]) {
      body.add(
        box(0.38, wallH, 0.38, materials.trim, sx * (W / 2 - 0.55), wallH / 2, D / 2 - 0.6)
      );
      body.add(
        box(1.4, 0.3, 0.28, materials.trim, sx * (W / 2 - 1.1), wallH - 0.35, D / 2 - 0.6)
      );
    }
  }

  // --- doors ----------------------------------------------------------------
  // Walls are slabs centred on frontZ, so the outer face is half a wall
  // thickness proud of it. Doors have to clear that or they sit inside the wall
  // with the battens drawn over them.
  const dz = frontZ + WALL_T / 2 + 0.06;
  if (door === 'rollup') {
    // Garage doors: one opening per bay, segmented panel face.
    const openW = Math.min(9, (W - 2) / bays - 0.6);
    const openH = Math.min(wallH - 0.9, 8);
    for (let b = 0; b < bays; b++) {
      const cx = bays === 1 ? 0 : (b - (bays - 1) / 2) * (W / bays);
      body.add(box(openW + 0.7, 0.3, 0.18, materials.trim, cx, openH + 0.15, dz + 0.08));
      for (const sx of [-1, 1]) {
        body.add(
          box(0.3, openH, 0.18, materials.trim, cx + sx * (openW / 2 + 0.2), openH / 2, dz + 0.08)
        );
      }
      const rows = 4;
      for (let r = 0; r < rows; r++) {
        body.add(
          box(
            openW,
            openH / rows - 0.06,
            0.14,
            materials.door,
            cx,
            (openH / rows) * (r + 0.5),
            dz
          )
        );
      }
    }
  } else if (door !== 'none') {
    const doorH = 6.7;
    const leaves = door === 'barn' ? 2 : 1;
    const leafW = door === 'barn' ? 3.0 : 3.2;
    const openW = leafW * leaves;

    body.add(box(openW + 0.7, 0.28, 0.16, materials.trim, 0, doorH + 0.14, dz + 0.08));
    for (const sx of [-1, 1]) {
      body.add(
        box(0.28, doorH, 0.16, materials.trim, sx * (openW / 2 + 0.21), doorH / 2, dz + 0.08)
      );
    }

    for (let i = 0; i < leaves; i++) {
      const cx = leaves === 1 ? 0 : (i - 0.5) * leafW;
      const leaf = new THREE.Group();
      leaf.position.set(cx, doorH / 2, dz);
      body.add(leaf);
      leaf.add(box(leafW - 0.08, doorH, 0.14, materials.door));

      if (door === 'barn') {
        for (const y of [-doorH / 2 + 0.45, 0, doorH / 2 - 0.45]) {
          leaf.add(box(leafW - 0.3, 0.22, 0.06, materials.trim, 0, y, 0.1));
        }
        const diag = box(
          Math.hypot(leafW - 0.3, doorH - 1.4),
          0.2,
          0.06,
          materials.trim,
          0,
          0,
          0.1
        );
        diag.rotation.z = Math.atan2(doorH - 1.4, leafW - 0.3) * (i === 0 ? 1 : -1);
        leaf.add(diag);
      } else {
        // Sauna doors are mostly glass; shed doors get a lite in the top half.
        const gh = door === 'sauna' ? doorH - 1.4 : 2.4;
        const gy = door === 'sauna' ? 0 : doorH / 2 - 1.7;
        leaf.add(box(leafW - 1.0, gh, 0.06, materials.glass, 0, gy, 0.09));
        leaf.add(box(0.12, gh, 0.08, materials.trim, 0, gy, 0.11));
        if (door !== 'sauna') {
          leaf.add(box(leafW - 1.0, 0.12, 0.08, materials.trim, 0, gy, 0.11));
        }
      }
      leaf.add(
        box(
          0.1,
          0.6,
          0.1,
          materials.trim,
          (leafW / 2 - 0.4) * (leaves === 1 ? 1 : i ? -1 : 1),
          0,
          0.16
        )
      );
    }

    if (door === 'barn') {
      body.add(box(openW + 1.6, 0.14, 0.2, materials.trim, 0, doorH + 0.5, dz + 0.14));
    }
  }

  // --- windows --------------------------------------------------------------
  const winW = 2.5;
  const winH = 3.0;
  const winY = wallH - 1.2 - winH / 2;
  const perSide = [Math.ceil(windows / 2), Math.floor(windows / 2)];
  for (const side of [0, 1]) {
    const sx = side === 0 ? 1 : -1;
    const n = perSide[side];
    for (let i = 0; i < n; i++) {
      const z = bodyZ + (bodyDepth / (n + 1)) * (i + 1) - bodyDepth / 2;
      const w = new THREE.Group();
      w.position.set(sx * (W / 2 + WALL_T / 2 + 0.02), winY, z);
      w.rotation.y = (sx * Math.PI) / 2;
      body.add(w);

      w.add(box(winW + 0.5, winH + 0.5, 0.09, materials.trim));
      w.add(box(winW, winH, 0.054, materials.glass, 0, 0, 0.03));
      w.add(box(0.11, winH, 0.1, materials.trim, 0, 0, 0.06));
      w.add(box(winW, 0.11, 0.1, materials.trim, 0, 0, 0.06));
      w.add(box(winW + 0.9, 0.18, 0.3, materials.trim, 0, -winH / 2 - 0.35, 0.06));

      // Matching daylight panel on the inner face, for the interior view.
      body.add(
        box(
          0.04,
          winH,
          winW,
          materials.daylight,
          sx * (W / 2 - WALL_T / 2 - 0.03),
          winY,
          z
        )
      );
    }
  }

  // Daylight through the door opening too, unless the front is already open.
  if (!frontOpen && door !== 'none') {
    const openW = door === 'rollup' ? Math.min(9, (W - 2) / bays - 0.6) * bays : door === 'barn' ? 6 : 3.2;
    const openH = door === 'rollup' ? Math.min(wallH - 0.9, 8) : 6.7;
    body.add(
      box(openW, openH, 0.04, materials.daylight, 0, openH / 2, frontZ - WALL_T / 2 - 0.03)
    );
  }

  // Sorts the framing last within the transparent pass — see setCutaway.
  framing.traverse((o) => {
    if (o.isMesh) o.renderOrder = 20;
  });

  root.userData.materials = materials;
  root.userData.framing = framing;
  // Peak height above grade, used by the dimension annotations
  root.userData.peakY = FLOOR_TOP + peak[1] + ROOF_T;
  root.userData.eaveY = FLOOR_TOP + wallH;
  return root;
}

/** Fade the skin out to expose the framing underneath. t: 0 = solid, 1 = open. */
export function setCutaway(group, t) {
  const { materials, framing } = group.userData;
  if (!materials) return;
  framing.visible = t > 0.01;
  // Siding, battens, trim and roof stack up to a milky white even at 10% each,
  // and three.js always draws opaque meshes before transparent ones -- so an
  // opaque stud gets painted over by the ghost no matter what its depth says.
  // Push the framing into the transparent pass with a high renderOrder and it
  // composites last, on top, at full strength.
  const f = materials.framing;
  f.transparent = t > 0.01;
  f.depthTest = t < 0.01;
  f.opacity = 1;
  for (const key of ['siding', 'trim', 'roof', 'door', 'glass', 'glazing']) {
    const m = materials[key];
    m.opacity = m.userData.baseOpacity * (1 - t * 0.9);
    m.transparent = m.opacity < 0.999;
    m.depthWrite = t < 0.15;
  }
}

export function disposeShed(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m.dispose());
    }
  });
}
