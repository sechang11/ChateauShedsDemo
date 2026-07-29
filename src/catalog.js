// The catalog: categories, then models within them.
//
// The real business sells eleven product lines, not four sheds -- saunas and
// garages are separate buying journeys, so category sits above model.
//
// PRICING IS PLACEHOLDER. Every `price` below is invented for layout purposes.
// The live business publishes no pricing at all; real numbers have to come from
// Chateau before any of this goes in front of a customer. See README.

export const CATEGORIES = [
  { id: 'sheds', label: 'Sheds', blurb: 'Storage, workshops and backyard studios.' },
  { id: 'garages', label: 'Garages', blurb: 'Single-bay through double-wide.' },
  { id: 'saunas', label: 'Saunas', blurb: 'Wood-fired, electric and infrared.' },
  { id: 'animal', label: 'Animal Structures', blurb: 'Run-ins, coops and kennels.' },
  { id: 'growing', label: 'Greenhouses', blurb: 'Four-season growing space.' },
];

export const MODELS = [
  // --- sheds ---------------------------------------------------------------
  {
    id: 'petit',
    category: 'sheds',
    accent: '#4f6050',
    tab: 'Le Petit',
    size: "10' × 12'",
    tagline: 'The garden house',
    blurb:
      'Our smallest building, and the one people fall for first. Board-and-batten pine, a single lite-glass door, and a roofline steep enough to shed a February storm.',
    price: 'from $4,280',
    width: 10,
    depth: 12,
    wallHeight: 7.5,
    roof: 'gable',
    pitch: 0.5,
    overhang: 0.9,
    porch: 0,
    door: 'single',
    windows: 2,
    colors: {
      siding: '#e8e4da',
      trim: '#ffffff',
      roof: '#4a4f4a',
      door: '#5c6b5d',
      foundation: '#4a4034',
    },
  },
  {
    id: 'chateau',
    category: 'sheds',
    accent: '#8a5a3c',
    tab: 'The Chateau',
    size: "12' × 20'",
    tagline: 'The flagship',
    blurb:
      'A covered porch, double barn doors, and twenty feet of usable floor. This is the building that gets converted into an office about six months after it lands.',
    price: 'from $9,640',
    width: 12,
    depth: 20,
    wallHeight: 8,
    roof: 'gable',
    pitch: 0.48,
    overhang: 1.1,
    porch: 5,
    door: 'barn',
    windows: 2,
    colors: {
      siding: '#f2efe8',
      trim: '#ffffff',
      roof: '#3f4a52',
      door: '#8a5a3c',
      foundation: '#4a4034',
    },
  },
  {
    id: 'atelier',
    category: 'sheds',
    accent: '#8a6b14',
    tab: "L'Atelier",
    size: "12' × 16'",
    tagline: 'The studio',
    blurb:
      'A single-slope roof pitched toward the north light, charcoal siding, and glass where the storage would normally go. Wired for a desk, not a mower.',
    price: 'from $8,900',
    width: 12,
    depth: 16,
    wallHeight: 8.5,
    roof: 'lean',
    pitch: 0.42,
    overhang: 0.9,
    porch: 0,
    door: 'single',
    windows: 3,
    colors: {
      siding: '#3c3f42',
      trim: '#22252a',
      roof: '#2b2e31',
      door: '#c9a227',
      foundation: '#2a2724',
    },
  },
  {
    id: 'grange',
    category: 'sheds',
    accent: '#8f3f36',
    tab: 'La Grange',
    size: "14' × 24'",
    tagline: 'The barn',
    blurb:
      'A true gambrel with a full loft above the rafters. Fourteen feet wide, two-tone, and tall enough that you stop calling it a shed within about a week.',
    price: 'from $13,200',
    width: 14,
    depth: 24,
    wallHeight: 7,
    roof: 'gambrel',
    pitch: 0.5,
    overhang: 1.0,
    porch: 0,
    door: 'barn',
    windows: 4,
    colors: {
      siding: '#8f3f36',
      trim: '#f5f2ec',
      roof: '#4a4f4a',
      door: '#f5f2ec',
      foundation: '#4a4034',
    },
  },

  // --- garages -------------------------------------------------------------
  {
    id: 'carriage',
    category: 'garages',
    accent: '#3f5566',
    tab: 'The Carriage',
    size: "14' × 24'",
    tagline: 'Single bay',
    blurb:
      'One vehicle, or one vehicle and a workbench. Nine-foot walls clear a truck with a rack, and the header is sized for an opener from day one.',
    price: 'from $16,400',
    width: 14,
    depth: 24,
    wallHeight: 9,
    roof: 'gable',
    pitch: 0.46,
    overhang: 1.0,
    porch: 0,
    door: 'rollup',
    bays: 1,
    windows: 2,
    colors: {
      siding: '#dfe3e6',
      trim: '#ffffff',
      roof: '#3f4a52',
      door: '#9aa2a8',
      foundation: '#4a4034',
    },
  },
  {
    id: 'doublewide',
    category: 'garages',
    accent: '#4a4a52',
    tab: 'The Double-Wide',
    size: "24' × 32'",
    tagline: 'Two bays, shop height',
    blurb:
      'Ships as a two-piece set and mates on site. Ten-foot walls, reinforced trusses, and enough clear span to put a lift in one bay and a business in the other.',
    price: 'from $38,900',
    width: 24,
    depth: 32,
    wallHeight: 10,
    roof: 'gable',
    pitch: 0.42,
    overhang: 1.2,
    porch: 0,
    door: 'rollup',
    bays: 2,
    windows: 4,
    colors: {
      siding: '#cfd4d8',
      trim: '#ffffff',
      roof: '#33383d',
      door: '#8b939a',
      foundation: '#4a4034',
    },
  },

  // --- saunas --------------------------------------------------------------
  {
    id: 'sauna',
    category: 'saunas',
    accent: '#9a5f2c',
    tab: 'Le Sauna',
    size: "8' × 12'",
    tagline: 'Wood-fired, off-grid',
    blurb:
      'Finnish-style, wood-fired, and happy without a power drop. Multi-layer insulated wall system, cedar interior, and a covered landing so you are not stepping straight into the snow.',
    price: 'from $18,500',
    width: 8,
    depth: 12,
    wallHeight: 7.5,
    roof: 'gable',
    pitch: 0.58,
    overhang: 1.0,
    porch: 3,
    door: 'sauna',
    windows: 1,
    colors: {
      siding: '#9a6b41',
      trim: '#a8794c',
      roof: '#2f3336',
      door: '#7a4f2a',
      foundation: '#3a3028',
    },
  },
  {
    id: 'spa',
    category: 'saunas',
    accent: '#6b6f52',
    tab: 'Le Spa',
    size: "7' × 9'",
    tagline: 'Infrared, plug-in',
    blurb:
      'Runs off a standard circuit and heats in a fraction of the time. A single-slope roof keeps the footprint tight enough for a deck or a side yard.',
    price: 'from $11,800',
    width: 7,
    depth: 9,
    wallHeight: 7.5,
    roof: 'lean',
    pitch: 0.45,
    overhang: 0.8,
    porch: 0,
    door: 'sauna',
    windows: 1,
    colors: {
      siding: '#4a4f45',
      trim: '#8f9482',
      roof: '#2f3336',
      door: '#6b6f52',
      foundation: '#2f2a24',
    },
  },

  // --- animal structures ---------------------------------------------------
  {
    id: 'runin',
    category: 'animal',
    accent: '#6b5334',
    tab: 'The Run-In',
    size: "12' × 24'",
    tagline: 'Three-sided horse shelter',
    blurb:
      'Open to the south, closed to the weather. Posted header instead of a front wall, skirted to keep drafts off the bedding, and framed for the snow load a run-in roof actually sees.',
    price: 'from $10,900',
    width: 12,
    depth: 24,
    wallHeight: 9,
    roof: 'lean',
    pitch: 0.38,
    overhang: 1.3,
    porch: 0,
    door: 'none',
    windows: 0,
    frontOpen: true,
    colors: {
      siding: '#7a5f3f',
      trim: '#e9e4d8',
      roof: '#4a4f4a',
      door: '#7a5f3f',
      foundation: '#3a3028',
    },
  },
  {
    id: 'coop',
    category: 'animal',
    accent: '#7a3f38',
    tab: 'The Coop',
    size: "6' × 8'",
    tagline: 'Six to twelve birds',
    blurb:
      'Ventilated high and draft-free low, which is the whole trick in a New England winter. Full-height door so you can muck it out standing up.',
    price: 'from $3,650',
    width: 6,
    depth: 8,
    wallHeight: 6,
    roof: 'gable',
    pitch: 0.55,
    overhang: 0.8,
    porch: 0,
    door: 'single',
    windows: 2,
    colors: {
      siding: '#b04a3f',
      trim: '#f5f2ec',
      roof: '#3f4a52',
      door: '#f5f2ec',
      foundation: '#3a3028',
    },
  },

  // --- greenhouses ---------------------------------------------------------
  {
    id: 'serre',
    category: 'growing',
    accent: '#3f6b52',
    tab: 'La Serre',
    size: "10' × 14'",
    tagline: 'Four-season growing',
    blurb:
      'Glazed walls and roof on a framed, insulated base, so it holds heat into November instead of giving up in October. Ridge vents open as it warms.',
    price: 'from $14,200',
    width: 10,
    depth: 14,
    wallHeight: 7.5,
    roof: 'gable',
    pitch: 0.52,
    overhang: 0.6,
    porch: 0,
    door: 'single',
    windows: 0,
    walls: 'glass',
    colors: {
      siding: '#cfd8d4',
      trim: '#f0f2f1',
      roof: '#cfd8d4',
      door: '#3f6b52',
      foundation: '#4a4034',
    },
  },
];

// --- the matrix ------------------------------------------------------------
//
// Old Hickory doesn't sell a list of named models — their own page describes
// "gable, utility, and lofted barn designs with flexible size options". That's
// a style × size matrix, which is how the industry actually sells sheds, so the
// catalogue generates it rather than hand-authoring every cell.
//
// The named MODELS above stay as the featured line; the matrix is the full grid.

export const STYLES = [
  {
    id: 'gable',
    label: 'Gable',
    note: 'Full wall height, vertical storage, workbench clearance.',
    roof: 'gable',
    pitch: 0.5,
    wallHeight: 8,
    door: 'barn',
    windows: 2,
    rate: 34,
    accent: '#4f6050',
    colors: {
      siding: '#e8e4da',
      trim: '#ffffff',
      roof: '#4a4f4a',
      door: '#5c6b5d',
      foundation: '#4a4034',
    },
  },
  {
    id: 'utility',
    label: 'Utility',
    note: 'Single slope, tight footprint, tucks against a fence or wall.',
    roof: 'lean',
    pitch: 0.45,
    wallHeight: 7.5,
    door: 'single',
    windows: 2,
    rate: 30,
    accent: '#3f5566',
    colors: {
      siding: '#dfe3e6',
      trim: '#ffffff',
      roof: '#3f4a52',
      door: '#3f5566',
      foundation: '#4a4034',
    },
  },
  {
    id: 'lofted',
    label: 'Lofted Barn',
    note: 'Gambrel roof with overhead storage above the rafters.',
    roof: 'gambrel',
    pitch: 0.5,
    wallHeight: 7,
    door: 'barn',
    windows: 2,
    rate: 39,
    accent: '#8f3f36',
    colors: {
      siding: '#8f3f36',
      trim: '#f5f2ec',
      roof: '#4a4f4a',
      door: '#f5f2ec',
      foundation: '#4a4034',
    },
  },
];

export const SIZES = [
  [8, 10],
  [8, 12],
  [10, 12],
  [10, 16],
  [12, 16],
  [12, 20],
  [12, 24],
  [14, 24],
];

/**
 * One cell of the matrix, as a full model object.
 *
 * PLACEHOLDER PRICING: derived from a made-up $/sq ft rate per style. Formulaic
 * rather than arbitrary, but still invented — see the README.
 */
export function matrixModel(style, [w, d]) {
  const sq = w * d;
  return {
    id: `${style.id}-${w}x${d}`,
    category: 'sheds',
    matrix: true,
    styleId: style.id,
    accent: style.accent,
    tab: `${style.label} ${w}×${d}`,
    size: `${w}' × ${d}'`,
    tagline: style.label,
    blurb: style.note,
    price: `from $${(Math.round((sq * style.rate) / 20) * 20).toLocaleString()}`,
    width: w,
    depth: d,
    wallHeight: style.wallHeight,
    roof: style.roof,
    pitch: style.pitch,
    overhang: 1.0,
    porch: 0,
    door: style.door,
    windows: style.windows,
    colors: { ...style.colors },
  };
}

export const MATRIX = STYLES.flatMap((s) => SIZES.map((size) => matrixModel(s, size)));

/** Options the configurator exposes. */
export const OPTIONS = {
  width: { min: 8, max: 24, step: 2, unit: "'" },
  depth: { min: 8, max: 32, step: 2, unit: "'" },
  wallHeight: { min: 6, max: 10, step: 0.5, unit: "'" },
  windows: { min: 0, max: 6, step: 1, unit: '' },
  porch: { min: 0, max: 6, step: 1, unit: "'" },
  roof: [
    { value: 'gable', label: 'Gable' },
    { value: 'gambrel', label: 'Barn' },
    { value: 'lean', label: 'Utility' },
  ],
  // All five, because the catalog ships models on all five: the saunas carry
  // 'sauna' and the open pavilion carries 'none'. With only three offered here,
  // selecting one of those models left the Doors control with nothing pressed,
  // and the first press swapped the building's own door for one of the three on
  // show with no way back to it. shed.js has always drawn all five.
  door: [
    { value: 'single', label: 'Single' },
    { value: 'barn', label: 'Double barn' },
    { value: 'rollup', label: 'Roll-up' },
    { value: 'sauna', label: 'Glass' },
    { value: 'none', label: 'Open front' },
  ],
};

/**
 * Named colorways — one click sets all four colors together.
 *
 * Most buyers don't want to pick four hexes; they want "the red barn one".
 * The individual swatches below stay for anyone who does.
 */
export const COLORWAYS = [
  {
    id: 'clapboard',
    name: 'Clapboard White',
    colors: { siding: '#f2efe8', trim: '#ffffff', roof: '#3f4a52', door: '#8a5a3c' },
  },
  {
    id: 'barnred',
    name: 'Barn Red',
    colors: { siding: '#8f3f36', trim: '#f5f2ec', roof: '#4a4f4a', door: '#f5f2ec' },
  },
  {
    id: 'sage',
    name: 'Sage & Cream',
    colors: { siding: '#e8e4da', trim: '#ffffff', roof: '#4a4f4a', door: '#5c6b5d' },
  },
  {
    id: 'charcoal',
    name: 'Charcoal & Brass',
    colors: { siding: '#3c3f42', trim: '#22252a', roof: '#2b2e31', door: '#c9a227' },
  },
  {
    id: 'driftwood',
    name: 'Driftwood',
    colors: { siding: '#b8bdb5', trim: '#f5f2ec', roof: '#33383d', door: '#7a5f3f' },
  },
  {
    id: 'cedar',
    name: 'Cedar & Slate',
    colors: { siding: '#9a6b41', trim: '#a8794c', roof: '#2f3336', door: '#7a4f2a' },
  },
  {
    id: 'harbor',
    name: 'Harbor Grey',
    colors: { siding: '#dfe3e6', trim: '#ffffff', roof: '#3f4a52', door: '#3f5566' },
  },
  {
    id: 'forest',
    name: 'Forest & Bone',
    colors: { siding: '#4a4f45', trim: '#f0f2f1', roof: '#2f3336', door: '#3f6b52' },
  },
];

/** Stock colorways. The live business advertises twenty-two; these stand in. */
export const SWATCHES = {
  siding: [
    '#f2efe8', '#e8e4da', '#d8d2c4', '#b8bdb5',
    '#8f3f36', '#b04a3f', '#7a5f3f', '#9a6b41',
    '#4a4f45', '#3c3f42', '#3f5566', '#2f3336',
  ],
  trim: ['#ffffff', '#f5f2ec', '#c9a271', '#8f9482', '#3c3f42', '#22252a'],
  roof: ['#3f4a52', '#4a4f4a', '#33383d', '#2b2e31', '#6b4a3a', '#5a6b5c'],
  door: ['#5c6b5d', '#8a5a3c', '#c9a227', '#f5f2ec', '#3f6b52', '#b04a3f'],
};

// Matrix cells are addressable too, so a shared link to one still resolves.
export const byId = (id) =>
  MODELS.find((m) => m.id === id) || MATRIX.find((m) => m.id === id) || MODELS[0];
export const inCategory = (cat) => MODELS.filter((m) => m.category === cat);
