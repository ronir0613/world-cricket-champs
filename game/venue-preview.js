/* ==========================================================================
   A look at the game's own stadium for the Venue guide: a still for the
   venue card, and a live view that slowly circles the ground and can be
   dragged to look around.
   ========================================================================== */
import * as THREE from "three";
import { buildWorld } from "./world.js?v=7";

const QUALITY = { pixelRatio: 1, shadows: false, shadowSize: 1024, segments: 64 };
const CENTRE = new THREE.Vector3(0, 6, 10);

function makeView(width, height) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const world = buildWorld(renderer, QUALITY);
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 1500);
  return { renderer, world, camera };
}

/* angle 0 looks down the pitch from behind the bowler; height in metres */
function place(camera, angle, height, distance) {
  camera.position.set(Math.sin(angle) * distance, height, CENTRE.z + Math.cos(angle) * distance);
  camera.lookAt(CENTRE);
}

function dispose(view) {
  view.world.scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
    for (const m of mats) { for (const key of ["map", "emissiveMap"]) if (m[key]) m[key].dispose(); m.dispose(); }
  });
  view.renderer.dispose();
  view.renderer.forceContextLoss();
}

let stillPromise = null;
/* A JPEG of the ground from high in the corner of the stand. */
export function stadiumStill() {
  if (!stillPromise) stillPromise = new Promise((resolve) => {
    const view = makeView(960, 540);
    place(view.camera, 2.5, 22, 74);
    view.world.update(3, 0);
    view.renderer.render(view.world.scene, view.camera);
    const url = view.renderer.domElement.toDataURL("image/jpeg", 0.86);
    dispose(view);
    resolve(url);
  });
  return stillPromise;
}

/* Live view inside `host`. Returns { destroy }. */
export function mountStadiumView(host) {
  const rect = host.getBoundingClientRect();
  const view = makeView(Math.max(320, rect.width), Math.max(200, rect.height));
  const canvas = view.renderer.domElement;
  canvas.className = "venue-3d-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "3D view of the WCC Arena. Drag to look around.");
  host.appendChild(canvas);

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let angle = 2.5, height = 22, drag = null, idleSince = 0, running = true, last = performance.now(), clock = 0;

  const onDown = (event) => { drag = { x: event.clientX, y: event.clientY, angle, height }; canvas.setPointerCapture(event.pointerId); };
  const onMove = (event) => {
    if (!drag) return;
    angle = drag.angle - (event.clientX - drag.x) * 0.008;
    height = THREE.MathUtils.clamp(drag.height + (event.clientY - drag.y) * 0.15, 4, 60);
  };
  const onUp = () => { drag = null; idleSince = clock; };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  const resize = () => {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    view.renderer.setSize(r.width, r.height, false);
    view.camera.aspect = r.width / r.height;
    view.camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  function frame(now) {
    if (!running) return;
    if (!canvas.isConnected) { api.destroy(); return; }   /* page left without cleanup */
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    /* drift round the ground unless the viewer is looking around */
    if (!drag && !reduceMotion && clock - idleSince > 2) angle += dt * 0.08;
    place(view.camera, angle, height, 74);
    view.world.update(clock, dt);
    view.renderer.render(view.world.scene, view.camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const api = {
    destroy() {
      if (!running) return;
      running = false;
      observer.disconnect();
      canvas.remove();
      dispose(view);
    }
  };
  return api;
}
