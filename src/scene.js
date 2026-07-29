import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// The stage: a white void with a receding ground grid, lit like a product shot.
// The renderer is transparent and the fog is white, so the 3D grid dissolves
// into the flat CSS grid on the page -- one continuous surface.

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 30, 82);

  // far must sit well beyond the fog's far plane. At 260 the ground disc and
  // the treeline were being clipped while still partly opaque, which drew a
  // hard edge across the sky -- the "second horizon". Fog should be what hides
  // distance, never the clip plane.
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 900);

  // --- light ----------------------------------------------------------------
  // A light-box environment: gives the metal roof and the window glass
  // something to reflect, so they read as material instead of flat black.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xffffff, 0xdcd8cd, 0.65);
  scene.add(hemi);

  // Only on inside the building -- an interior lit purely from outside reads as
  // a black box, because the walls are doing their job.
  const interior = new THREE.PointLight(0xffe9c9, 0, 40, 1.6);
  interior.position.set(0, 6, 0);
  scene.add(interior);

  const key = new THREE.DirectionalLight(0xfff4e6, 2.1);
  key.position.set(16, 20, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 3;
  // normalBias is what kills the acne banding across the large flat walls;
  // a depth bias alone can't cover a 24ft surface at this shadow-map density.
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.25;
  const s = key.shadow.camera;
  s.left = -26;
  s.right = 26;
  s.top = 26;
  s.bottom = -26;
  s.near = 1;
  s.far = 70;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xe4edf5, 0.55);
  fill.position.set(-14, 9, -11);
  scene.add(fill);

  // --- ground ---------------------------------------------------------------
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260),
    new THREE.ShadowMaterial({ opacity: 0.15 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  const minor = new THREE.GridHelper(180, 180, 0xd9d7d1, 0xe6e4de);
  minor.material.transparent = true;
  minor.material.opacity = 0.75;
  minor.position.y = 0.004;
  scene.add(minor);

  const major = new THREE.GridHelper(180, 18, 0xbdbab2, 0xc9c6bf);
  major.material.transparent = true;
  major.material.opacity = 0.85;
  major.position.y = 0.006;
  scene.add(major);

  // --- camera rig -----------------------------------------------------------
  const target = new THREE.Vector3(0, 4, 0);

  /**
   * Place the camera on a sphere around the target. Angles in radians.
   * `panX` dollies the whole rig sideways, which slides the building across the
   * frame without moving it in world space -- that's how the copy column and
   * the shed stay out of each other's way.
   */
  // How far past the subject the fog reaches. The studio derives it from the
  // camera so the grid fades identically whatever the building's size.
  let fogFar = 2.6;
  const setFogFar = (v) => {
    fogFar = v;
  };

  // ...but once the world contains fixed-scale scenery (a treeline at a set
  // distance), camera-derived fog makes that scenery fade in and out as you
  // zoom and scroll. A fixed range pins it. null = fall back to camera-derived.
  let fogFixed = null;
  const setFogRange = (near, far) => {
    fogFixed = near === null ? null : { near, far };
  };

  function setCamera({ az, el, dist, targetY, panX = 0, fov = 32, fogDist = dist }) {
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // Fog tracks the camera rather than sitting at fixed depths. A 24x32
    // double-wide is framed from much further out than a 6x8 coop, and fixed
    // fog would wash the big buildings out to white before you ever saw them.
    // Start the fog at the subject rather than in front of it, so the building
    // itself stays crisp (the cutaway framing is faint and fog eats it) and
    // only the ground recedes. fogDist is passed separately from dist because
    // standing *inside* a building puts the camera 3ft from the subject, and
    // deriving fog from that whites out the far wall.
    if (fogFixed) {
      scene.fog.near = fogFixed.near;
      scene.fog.far = fogFixed.far;
    } else {
      scene.fog.near = fogDist;
      scene.fog.far = fogDist * fogFar;
    }

    target.set(0, targetY, 0);
    camera.position.set(
      dist * Math.cos(el) * Math.sin(az),
      targetY + dist * Math.sin(el),
      dist * Math.cos(el) * Math.cos(az)
    );
    camera.lookAt(target);
    // Slide sideways in view space *after* aiming, so the offset is the same
    // on screen no matter which way around the building we are.
    camera.translateX(panX);
    // Flush the matrices here rather than letting render() do it. Anything that
    // projects a world point to the screen (the dimension labels) runs before
    // the draw call and would otherwise be working off last frame's camera.
    camera.updateMatrixWorld(true);
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    scene,
    camera,
    renderer,
    setCamera,
    setFogFar,
    setFogRange,
    resize,
    grids: [minor, major],
    lights: { hemi, key, fill, interior },
    render: () => renderer.render(scene, camera),
  };
}
