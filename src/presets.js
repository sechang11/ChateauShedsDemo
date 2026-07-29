// Every shed on the site is just a parameter set. Add a preset here and it shows
// up as a tab -- no new geometry code, no new assets.
//
// Units are feet. The camera rig in scene.js assumes that scale.

export const PRESETS = [
  {
    id: 'petit',
    accent: '#4f6050',
    tab: 'Le Petit',
    size: "10' × 12'",
    tagline: 'The garden house',
    blurb:
      'Our smallest building, and the one people fall for first. Board-and-batten pine, a single lite-glass door, and a roofline steep enough to shrug off a February storm.',
    price: 'from $4,280',
    width: 10,
    depth: 12,
    wallHeight: 7.5,
    roof: 'gable',
    pitch: 0.5, // rise over half-span
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
    accent: '#8a6b14', // darkened off the brass door so it clears AA on white
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
];

export const byId = (id) => PRESETS.find((p) => p.id === id) || PRESETS[0];
