import { roofProfile } from './shed.js';

// Front-elevation line drawings for the catalogue cards.
//
// Rendered as SVG from the same roofProfile the 3D model is built from, so a
// card can never disagree with the building it opens. Cheap enough to draw
// eleven of them instantly, and it keeps the drafting language of the site --
// which a grid of tiny 3D renders would not.

const PAD = 1.6;

export function elevationSVG(m, { width = 260, stroke = '#16181c' } = {}) {
  const W = m.width;
  const wallH = m.wallHeight;
  const profile = roofProfile(m.roof, W, wallH, m.pitch);
  const over = m.overhang ?? 1;

  const peak = Math.max(...profile.map((p) => p[1]));
  const spanX = W + over * 2 + PAD * 2;
  const spanY = peak + 1.4 + PAD;
  const height = Math.round((width * spanY) / spanX);

  // Model feet -> SVG units, y flipped so the ground sits at the bottom.
  const sx = (x) => ((x + spanX / 2) / spanX) * width;
  const sy = (y) => height - ((y + PAD * 0.5) / spanY) * height;

  const parts = [];
  const line = (x1, y1, x2, y2, w = 1.4, opacity = 1) =>
    parts.push(
      `<line x1="${sx(x1).toFixed(1)}" y1="${sy(y1).toFixed(1)}" x2="${sx(x2).toFixed(
        1
      )}" y2="${sy(y2).toFixed(1)}" stroke-width="${w}" stroke-opacity="${opacity}"/>`
    );
  const rect = (x, y, w, h, sw = 1.1, opacity = 1) =>
    parts.push(
      `<rect x="${sx(x - w / 2).toFixed(1)}" y="${sy(y + h).toFixed(1)}" width="${(
        (w / spanX) *
        width
      ).toFixed(1)}" height="${((h / spanY) * height).toFixed(
        1
      )}" fill="none" stroke-width="${sw}" stroke-opacity="${opacity}"/>`
    );

  // Ground
  line(-spanX / 2, 0, spanX / 2, 0, 1.2, 0.35);

  // Walls
  line(-W / 2, 0, -W / 2, wallH);
  line(W / 2, 0, W / 2, wallH);

  // Roof, including the eave overhang at each end
  const first = profile[0];
  const last = profile[profile.length - 1];
  const dxA = profile[1][0] - first[0];
  const dyA = profile[1][1] - first[1];
  const lenA = Math.hypot(dxA, dyA);
  const dxB = last[0] - profile[profile.length - 2][0];
  const dyB = last[1] - profile[profile.length - 2][1];
  const lenB = Math.hypot(dxB, dyB);

  line(first[0] - (dxA / lenA) * over, first[1] - (dyA / lenA) * over, first[0], first[1], 1.8);
  for (let i = 0; i < profile.length - 1; i++) {
    line(profile[i][0], profile[i][1], profile[i + 1][0], profile[i + 1][1], 1.8);
  }
  line(last[0], last[1], last[0] + (dxB / lenB) * over, last[1] + (dyB / lenB) * over, 1.8);

  // Door
  if (m.door === 'rollup') {
    const bays = m.bays ?? 1;
    const openW = Math.min(9, (W - 2) / bays - 0.6);
    const openH = Math.min(wallH - 0.9, 8);
    for (let b = 0; b < bays; b++) {
      const cx = bays === 1 ? 0 : (b - (bays - 1) / 2) * (W / bays);
      rect(cx, 0, openW, openH);
      for (let r = 1; r < 4; r++) {
        line(cx - openW / 2, (openH / 4) * r, cx + openW / 2, (openH / 4) * r, 0.7, 0.5);
      }
    }
  } else if (m.door !== 'none') {
    const leaves = m.door === 'barn' ? 2 : 1;
    const leafW = m.door === 'barn' ? 3 : 3.2;
    for (let i = 0; i < leaves; i++) {
      const cx = leaves === 1 ? 0 : (i - 0.5) * leafW;
      rect(cx, 0, leafW - 0.1, 6.7);
    }
  } else {
    // Open front: posts only
    line(-W / 2 + 0.3, 0, -W / 2 + 0.3, wallH, 1.6);
    line(W / 2 - 0.3, 0, W / 2 - 0.3, wallH, 1.6);
  }

  // A window either side of the opening, if the model has any
  if ((m.windows ?? 0) > 0 && m.door !== 'rollup') {
    const inset = W / 2 - 1.6;
    if (inset > 2.6) {
      rect(-inset, wallH - 4.2, 2.2, 2.8, 1, 0.8);
      rect(inset, wallH - 4.2, 2.2, 2.8, 1, 0.8);
    }
  }

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${
    m.tab
  } front elevation" style="stroke:${stroke};fill:none;stroke-linecap:square">${parts.join(
    ''
  )}</svg>`;
}
