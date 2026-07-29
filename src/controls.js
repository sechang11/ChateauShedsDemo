// Direct manipulation of the building.
//
// Spin is bound to scroll position rather than to a separate camera state:
// dragging sets where you are on the page, and the existing scroll → camera
// rig does the rest. One source of truth, so a drag and a scrollbar can never
// disagree about where the camera is.
//
// Gesture split:
//   drag             spin, and with it the page position
//   wheel            zoom — over the model only
//   pinch            zoom
//
// The wheel is claimed for zoom over the canvas, so dragging is the primary way
// through the document. Three escape hatches keep that from being a trap:
// the wheel still scrolls normally over the copy panels (those sit above the
// canvas and never reach this listener), the scrollbar works, and keyboard
// paging is untouched because none of it goes through wheel events.
//
// Vertical drag deliberately does nothing — with the wheel zooming, having drag
// zoom as well made the same gesture mean two things depending on direction.

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.0;

// Tuned so a full lap of the building takes a few comfortable drags rather
// than one flick — the page scrolls with it, and a flick threw you two-thirds
// of the way down the document.
const DEG_PER_PX = 0.13;
// A 260px drag used to slam straight into the clamp; this spans about half the
// range over a comfortable pull.
const ZOOM_PER_PX = 0.0018;

export function attachControls(target, { onSpin, onZoom, onActive }) {
  const points = new Map();
  let dragging = false;
  let pinchStart = 0;
  let moved = 0;

  const setActive = (v) => {
    target.classList.toggle('grabbing', v);
    onActive && onActive(v);
  };

  const spread = () => {
    const [a, b] = [...points.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  target.addEventListener('pointerdown', (e) => {
    // Let anything with its own interaction (copy panels, buttons) win.
    if (e.target !== target) return;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    // Capture is an optimisation, not a requirement — it throws for a pointer
    // the browser doesn't consider active, and an exception here would abort
    // the handler before the drag ever starts.
    try {
      target.setPointerCapture(e.pointerId);
    } catch {}
    if (points.size === 2) pinchStart = spread();
    dragging = true;
    moved = 0;
    setActive(true);
  });

  target.addEventListener('pointermove', (e) => {
    const prev = points.get(e.pointerId);
    if (!prev || !dragging) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    moved += Math.abs(dx) + Math.abs(dy);

    if (points.size === 2) {
      const now = spread();
      if (pinchStart > 0) onZoom((now - pinchStart) * ZOOM_PER_PX * 1.6);
      pinchStart = now;
      return;
    }

    // Drag right → building turns toward you, so negate.
    onSpin(-dx * DEG_PER_PX);
  });

  const end = (e) => {
    points.delete(e.pointerId);
    if (points.size < 2) pinchStart = 0;
    if (points.size === 0) {
      dragging = false;
      setActive(false);
    }
  };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);

  target.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // Trackpads report small pixel deltas, mice report large line-ish jumps;
      // normalising stops a mouse wheel crossing the whole zoom range per notch.
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      onZoom(-Math.max(-90, Math.min(90, step)) * 0.0022);
    },
    { passive: false }
  );

  return {
    /** True if the last gesture actually moved — lets callers ignore taps. */
    moved: () => moved > 4,
  };
}
