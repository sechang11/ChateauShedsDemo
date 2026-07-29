# Chateau Sheds — sample site

A white drafting grid, one building sitting on it, and a camera that walks around
the building as you scroll. Eleven models across five categories, a live
configurator, dimension annotations, and a framing cutaway.

```bash
npm install
npm run dev
```

## ⚠️ Invented content — do not ship as-is

This is a sample. Some content is real (pulled from
chateaushedsoutdoorstructures.com), some is fabricated for layout. Before any of
this goes in front of a customer, replace:

| Thing | Status |
| --- | --- |
| **All prices** | **Invented.** The live site publishes no pricing at all. Featured models carry hand-set figures; matrix cells derive theirs from a made-up `rate` ($/sq ft) per style — formulaic, but still fiction. Marked with an asterisk throughout. |
| **Model names and copy** | **Invented.** "Le Petit", "La Grange" etc. are not real product names. |
| **Dimensions per model** | **Plausible but invented.** Real sizes need to come from Chateau. |
| **"10 year structural warranty"** | Removed — was invented in an earlier pass. |
| **Site-prep figures** (pad tolerance, access width, slope) | **Invented.** Realistic, but confirm against actual delivery practice. |
| **All photography, video and Instagram content** | **Absent by design.** The media section is placeholder slots with captions describing what belongs there. No stock imagery, no invented posts, no fake engagement numbers. |
| Addresses, phone, email, counties served | **Real**, from the live site. |
| Instagram handle (@chateausheds) | **Real.** Facebook and Instagram are the only working socials — see the bug list at the bottom. |
| Snow load / freeze-thaw / 16" O.C. / USA-owned claims | **Real**, paraphrased from the live site's own copy. |

Lot hours are deliberately absent — the live site doesn't publish them, so the
page says "call for current lot hours" rather than inventing them.

## How it fits together

| File | Job |
| --- | --- |
| `src/catalog.js` | Categories, the eleven models, configurator options, swatches. |
| `src/shed.js` | Builds a building from a catalog entry. All the geometry. |
| `src/scene.js` | Renderer, lights, ground grid, camera rig, fog. |
| `src/environment.js` | The "on your lot" backdrop — grass, treeline, warmer light. |
| `src/annotations.js` | Dimension lines in 3D, labels in HTML. |
| `src/configurator.js` | The control panel. |
| `src/urlstate.js` | The configured build ⇄ the querystring. |
| `src/elevation.js` | SVG front elevations, drawn instantly while renders bake. |
| `src/thumbnails.js` | Offscreen renderer that bakes 3D thumbnails to data URLs. |
| `src/catalogue.js` | The overlay: style × size matrix, featured line, detail views. |
| `src/content.js` | **Generated.** Copy, photography and FAQ from the live site. |
| `src/main.js` | Scroll → camera, tabs → model, controls → geometry. |
| `src/styles.css` | The page. The flat grid lives here. |
| `tools/harvest-to-content.mjs` | Turns a scrape of the live site into `content.js`. |
| `content/source/*.txt` | Verbatim record of all 26 pages, nav stripped. |

## Content from the live site

All copy, photography and FAQ content is harvested from
chateaushedsoutdoorstructures.com — the client's own site — and generated into
`src/content.js`. Nothing there is hand-edited, so a refresh loses nothing.

### Re-harvesting

1. Open the live site in a browser tab (the scrape runs same-origin).
2. Run the fetch-and-extract snippet against every page and POST the result to
   `http://localhost:5173/__content` (dev-only endpoint in `vite.config.js`).
3. `node tools/harvest-to-content.mjs`

Current haul: 26 pages, ~94k characters, 219 unique images (213 content, 6 site
chrome), 8 FAQ pairs, 40 video ids.

### Three things to settle before launch

1. **Duplicate content.** Publishing this copy verbatim on a second domain is an
   active SEO problem — search engines pick one and can suppress the other, and
   it's the established site that has more to lose. The prose is also written
   for search rather than for readers. Rewrite it, or decide this site replaces
   the Wix one and redirect.
2. **Images hotlink Wix's CDN.** Fine for a sample, not for production. The
   originals run to ~3 MB each, so everything is served through Wix's on-the-fly
   resize (`img()` in `content.js`) rather than raw. Re-host before launch.
3. **Videos can't be embedded at all.** Wix returns **403** on direct access to
   the video files, so the three walk-through pages link out instead. Re-host
   the source files, or move them to YouTube — which is what I'd suggest anyway,
   since it costs nothing and adds a search surface.

### Where it landed

| Source | Placed |
| --- | --- |
| Shed / sauna / garage image pages, gallery | Photography strip in "On the ground", and every catalogue detail view. Follows the selected category. |
| FAQ page | Expandable Q&A under "Before delivery", where the site-prep and permit questions already live. |
| Walk-through & info video pages | Outbound links in the media block, pending re-hosting. |
| Product page prose | Held in `content.js` / `content/source/`, **not yet placed** — see duplicate-content above. |

The FAQ page tabs its questions by product type and only the Dog Kennels tab is
in the server-rendered markup; the rest are client-rendered. A per-tab scrape
would pick up the others.

### Shareable builds

The configurator writes to the querystring (`?m=grange&w=16&d=28&…`), so a
customer can send their build to the lot and the lot can send options back,
with no accounts involved. `urlstate.decode` ignores anything malformed — a
mangled link opens the site, not a broken configurator.

The quote form carries the same build, and has no backend: it opens a prefilled
email that the visitor sends themselves. Swap the `location.href = 'mailto:…'`
in `main.js` for a POST when there's an endpoint, or wire it to the existing Wix
Bookings consult flow.

### Two backdrops, two vantage points

White studio is the default — it's the brand, and it keeps copy legible over
the model without scrims. "On your lot" swaps in grass, a treeline and warmer
light for buyers who can't picture a building floating in nothing.

Trees are deliberately squat and rounded. The first pass used tall cones and the
horizon read as a mountain range, which is both wrong for Western Mass and the
exact thing the white backdrop exists to avoid.

"Step inside" blends between two camera rigs rather than cutting, so entering is
a move through the wall. Two things it needs that aren't obvious:

- Fog depth is passed as `fogDist`, separately from camera distance. Standing
  inside puts the camera ~3 ft from the subject, and deriving fog from that
  whites out the far wall completely.
- Openings are surface appliqué, not holes cut through the wall, so there'd be
  no daylight inside at all. `materials.daylight` panels sit on the inner face
  where each window and door is and stand in for the opening.

### The grid is two grids

The page background is a CSS grid (`.grid-bg`). The ground plane in the 3D scene
is a `GridHelper`. The scene fog is white and the renderer is transparent, so the
3D grid dissolves into the flat one at the horizon and the two read as a single
surface. If you change the page background color, change `scene.fog` to match or
the seam becomes visible.

Fog depths track the camera (`scene.fog.near = dist`) rather than sitting at
fixed distances. A 24×32 double-wide is framed from much further out than a 6×8
coop, and fixed fog washed the big buildings out to white.

### Scroll → camera

`SHOTS` in `main.js` holds one camera keyframe per section — azimuth, elevation,
distance, look-at height, and a lateral offset. Azimuth climbs monotonically
(38° → 302°), so scrolling the page walks you once around the building. Section
boundaries come from `offsetTop`, and the camera damps toward the target each
frame rather than snapping.

Distances scale off each building's footprint diagonal (`fitFor`), keyed to The
Chateau as 1.0 — otherwise the 6×8 coop and the 24×32 double-wide would frame
completely differently on the same shot.

Two sections drive effects off their own scroll progress, via `envelope()` —
ramp up, hold, ramp down, so both boundaries are seamless:

- **Construction** dissolves the skin to expose framing (`setCutaway`).
- **Dimensions** fades in the measurement lines.

### The cutaway

Framing (studs at 16" O.C., trusses, joists, skids) is built with every model
and kept `visible = false`. Revealing it needs one non-obvious trick: three.js
always draws opaque meshes before transparent ones, so opaque studs get painted
over by the ghosted skin regardless of depth. `setCutaway` pushes the framing
material into the transparent pass with `renderOrder = 20`, so it composites
last, on top, at full strength.

### Dimensions

Lines are `LineSegments` in the scene so they sit in perspective. The numbers are
DOM nodes projected to screen coordinates each frame — text stays crisp at any
angle, which sprite text does not. Both vertical runs live on the +x side
because that's the side the dimensions shot faces.

`scene.setCamera` calls `camera.updateMatrixWorld()` explicitly, because label
projection runs *before* the draw call and would otherwise use the previous
frame's camera.

### The matrix

Old Hickory doesn't sell a list of named models. Their own dealer page describes
"gable, utility, and lofted barn designs with flexible size options" — that's a
**style × size matrix**, which is how the industry actually sells sheds. So the
catalogue generates 3 styles × 8 sizes = 24 buildings from `STYLES` and `SIZES`
in `catalog.js` rather than hand-authoring cells that would be fiction.

The eleven named models stay as the featured line. Both live in the same
overlay, both open the same detail view, and compare works across the two.

Adding a size is one entry in `SIZES` (3 new buildings). Adding a style is one
entry in `STYLES` (8 new buildings).

### Thumbnails

Every matrix cell is a real 3D render of that exact build, from the same
`buildShed` as the main scene — a card can't disagree with the building it
opens. Two dozen live WebGL canvases is not an option (browsers cap contexts
around a dozen and start dropping the oldest), so `thumbnails.js` runs **one**
small offscreen renderer, draws each building in turn, and hands back a PNG data
URL that's then just an `<img>`.

Bakes are cached by a key derived from the build's visual parameters, spread one
per animation frame so the grid fills in progressively, and backed by an instant
SVG elevation so no cell is ever empty.

### Adding a building

Add an object to `MODELS` with a `category`. It becomes a tab automatically.
Roof types are `gable`, `gambrel` and `lean`; adding a fourth means adding a case
to `roofProfile()` in `shed.js` and nothing else — panels, gable ends, ridge cap,
fascia, trusses and the wall infill are all derived from that 2D polyline.

Other switches: `door` (`single` / `barn` / `rollup` / `sauna` / `none`),
`bays`, `frontOpen` (run-in sheds), `walls: 'glass'` (greenhouses), `porch`.

## Why the model is procedural

The building is generated in code — no downloaded geometry, no textures. That
keeps the payload tiny, makes a new building a parameter change instead of an
asset pipeline, and sidesteps the question of whose models these are.

**Swapping in real GLB models.** If the dealer agreement covers Old Hickory's
configurator assets, only one function changes. `makeShed(model)` in `main.js`
is the single place a building gets created:

```js
const loader = new GLTFLoader();
async function makeShed(model) {
  const gltf = await loader.loadAsync(`/models/${model.id}.glb`);
  return gltf.scene;
}
```

`rebuild` would need an `await`, and the camera distances assume 1 unit = 1 foot
so imported models should be scaled to match. Everything else — scroll rig, tab
transitions, lighting, grid — is model-agnostic. Note that imported models
wouldn't carry framing geometry, so the cutaway would need separate assets or
would have to be dropped for those models. Worth confirming the license in
writing first, since it's the manufacturer's IP and this is a dealer site.

## Dev-only bits

- `vite.config.js` adds a `POST /__shot` endpoint that writes a canvas frame to
  `.shots/`. `apply: 'serve'` means it never reaches a build.
- `window.__chateau` exposes the scene, active model, `select()`, `rebuild()`,
  `setCutaway()` and `setDims()` for poking around in the console.
- The renderer runs with `preserveDrawingBuffer: true` so the canvas can be read
  back. Costs a little; drop it if you never want image export.

## Known limits

- ~543 kB of JS (144 kB gzipped), nearly all three.js. Code-splitting the 3D
  layer behind an idle import would get first paint down.
- No WebGL means no building — the copy still renders, the canvas is hidden.
- The quote form has no backend. It hands off to the visitor's mail client.
- The lean-to roof always slopes across the width. A run-in that opens on the
  gable end would need the profile to run along `z` instead.
- Interiors are empty shells — no loft deck, no shelving, no fixtures. The
  gambrel loft is still a roof profile only.
- The catalogue rebuilds its whole grid on every filter or compare click. Fine
  at eleven models; worth diffing if the line reaches fifty.
- No rent-to-own calculator, because it's unclear whether Chateau offers it.
  Nothing on the live site mentions financing, which is unusual for an Old
  Hickory dealer. If they do, that's likely the highest-converting thing missing.
- No snow-load-by-town lookup. Ground snow load is published per municipality
  and they already serve named counties — "Granby, MA: 40 psf, this build clears
  it" is a differentiator no competitor has.

### Deliberately not built

- **Sound effects.** Scroll-triggered audio is reliably disliked, and on a page
  where someone is about to spend five figures it reads as unserious. The one
  defensible case is the sauna — sensory product, muted by default, explicit
  play button. Not autoplay, and never tied to scroll.
- **Easter eggs.** The grass reveal became a labelled button instead. Same work,
  and people actually find a button.

## Not fixed here — bugs on the live Wix site

Worth passing to whoever owns chateaushedsoutdoorstructures.com:

1. Social icons link to **Wix's own accounts** (`youtube.com/user/Wix`,
   `tiktok.com/@wix`, `twitter.com/wix`) — template defaults never replaced.
   Facebook and Instagram are correct.
2. Two phone links both display `413-478-6833`, but one `href` is
   `tel:1-413-478-6948`.
3. Most product pages sit on unedited Wix slugs — Chicken Coops is at
   `/copy-of-dog-kennels`, Old Hickory Sheds at `/copy-of-greenhouses`. Bad for
   search and confusing when shared.
