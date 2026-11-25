/* ==========================================================================
   Player movement lab: play any batting stroke or bowling action on the
   real player models, slow it down, scrub through it frame by frame and
   look at it from any angle. This is where player movements get worked on.
   ========================================================================== */
import * as THREE from "three";
import { buildWorld } from "./world.js?v=7";
import { applyPose, batterPose, batterStride, BATTER_SPOT, KITS } from "./figure.js?v=4";
import { createBatter } from "./batter.js?v=11";
import { createBowler } from "./bowler.js?v=7";

/* Batting moves: the swing starts at 0.8 s and meets the ball at 1.05 s. */
export const BATTING_MOVES = [
  { id: "drive", label: "Straight drive", front: true, aim: 0, shot: "ground", stroke: "drive" },
  { id: "cover", label: "Cover drive", front: true, aim: -0.9, shot: "ground", stroke: "drive" },
  { id: "on", label: "On drive", front: true, aim: 0.6, shot: "ground", stroke: "drive" },
  { id: "flick", label: "Flick", front: true, aim: 1.2, shot: "ground", stroke: "flick" },
  { id: "loft", label: "Lofted drive", front: true, aim: 0, shot: "loft", stroke: "drive" },
  { id: "fdef", label: "Forward defence", front: true, aim: 0, shot: "defend", stroke: "defend" },
  { id: "pull", label: "Pull", front: false, aim: 1.0, shot: "ground", stroke: "pull" },
  { id: "cut", label: "Cut", front: false, aim: -1.0, shot: "ground", stroke: "cut" },
  { id: "punch", label: "Back-foot punch", front: false, aim: 0, shot: "ground", stroke: "punch" },
  { id: "bdef", label: "Back defence", front: false, aim: 0, shot: "defend", stroke: "defend" },
  { id: "leave", label: "Leave", leave: true }
];
export const BOWLING_MOVES = [
  { id: "fast", label: "Fast", run: 3.2, spin: false },
  { id: "medium", label: "Medium-fast", run: 2.6, spin: false },
  { id: "off", label: "Off-spin", run: 1.6, spin: true, style: "Off-spin" },
  { id: "leg", label: "Leg-spin", run: 1.6, spin: true, style: "Leg-spin" }
];
const BAT_LENGTH = 3.0, SWING_AT = 0.8, CONTACT_AT = 1.05, FOLLOW = 1.6;

function batterState(move, t) {
  if (t < 0.4) return { phase: "stance", t0: 0 };
  if (t < SWING_AT) return { phase: "backlift", t0: 0.4 };
  if (move.leave) return { phase: "leave", t0: SWING_AT };
  return { phase: "swing", t0: SWING_AT, contactAt: CONTACT_AT, front: move.front, aim: move.aim, shot: move.shot, stroke: move.stroke };
}
function batterPhase(move, t) {
  if (t < 0.4) return "Stance";
  if (t < SWING_AT) return "Backlift";
  if (move.leave) return t < SWING_AT + 0.9 ? "Leave" : "Recover";
  if (Math.abs(t - CONTACT_AT) < 0.03) return "Contact";
  if (t < CONTACT_AT) return "Downswing";
  return t < CONTACT_AT + FOLLOW - 0.6 ? "Follow-through" : "Settle";
}
function bowlerPhase(tau) {
  if (Math.abs(tau) < 0.04) return "Release";
  if (tau < -0.45) return "Run-up";
  if (tau < -0.15) return "Gather and jump";
  if (tau < 0) return "Delivery stride";
  return tau < 0.6 ? "Follow-through" : "Peel away";
}

/* Camera views around the player. Angles are relative to the player's
   facing; drag adds to them. */
const VIEWS = {
  batter: { front: [-Math.PI / 2, 1.35, 4.6], side: [0, 1.4, 5.6], behind: [Math.PI, 1.6, 5.2] },
  bowler: { front: [Math.PI, 1.7, 9], side: [Math.PI / 2, 1.6, 7.5], behind: [0, 2.2, 9] }
};

/* Build the lab inside `host` (an element sized by CSS). Returns an API
   the page drives: setPlayer, setMove, play, pause, setSpeed, seek, setView,
   onTick(callback) and destroy. */
export async function startLab(host, { kit = "IND" } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "lab-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Player movement preview. Drag to turn the camera.");
  host.appendChild(canvas);

  const quality = { pixelRatio: 1, shadows: true, shadowSize: 2048, segments: 64 };
  const world = buildWorld(renderer, quality);
  const scene = world.scene;
  /* keep the bowler's end in the sun's shadow box too */
  world.sun.shadow.camera.top = 30; world.sun.shadow.camera.bottom = -14;
  world.sun.target.position.set(0, 0, 10);
  world.sun.shadow.camera.updateProjectionMatrix();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 1500);

  const [batter, bowler] = await Promise.all([createBatter({ kit: KITS[kit] || KITS.IND }), createBowler()]);
  batter.driver.root.position.set(BATTER_SPOT.x, 0, BATTER_SPOT.z);
  batter.driver.root.rotation.y = -Math.PI / 2;
  scene.add(batter.driver.root, bowler.root);

  const state = { player: "batter", move: BATTING_MOVES[0], t: 0, speed: 0.5, playing: true, view: "front", yaw: 0, pitch: 0 };
  let listeners = [], running = true, visible = true, last = performance.now(), hold = 0;
  const duration = () => (state.player === "batter" ? BAT_LENGTH : state.move.run + 1.6);

  function prepareBowler() {
    const move = state.player === "bowler" ? state.move : BOWLING_MOVES[1];
    bowler.prepare({ spin: move.spin, style: move.style, action: move.id, release: { x: -0.1, y: 2.1, z: 18.6 } }, "Club");
  }
  prepareBowler();

  const focus = new THREE.Vector3(), hips = new THREE.Vector3();
  function pose() {
    const t = state.t;
    if (state.player === "batter") {
      const s = batterState(state.move, t);
      applyPose(batter.driver, batterPose(s, t));
      batter.driver.root.position.z = BATTER_SPOT.z + batterStride(s, t);
      batter.update();
      bowler.root.visible = false;
      focus.set(BATTER_SPOT.x, 1.0, batter.driver.root.position.z);
    } else {
      const tau = t - state.move.run;
      bowler.update(tau);
      bowler.root.visible = true;
      applyPose(batter.driver, batterPose({ phase: "stance", t0: 0 }, t));
      batter.driver.root.position.z = BATTER_SPOT.z;
      batter.update();
      bowler.root.updateMatrixWorld(true);
      (bowler.root.getObjectByName("Hips") || bowler.root).getWorldPosition(hips);
      focus.set(hips.x, 1.1, hips.z);
    }
  }
  function placeCamera() {
    const [angle, height, dist] = VIEWS[state.player][state.view];
    /* batter faces -x (yaw -PI/2 is his front); bowler runs towards -z */
    const a = angle + state.yaw;
    const h = Math.max(0.3, height + state.pitch);
    camera.position.set(focus.x + Math.sin(a) * dist, h, focus.z + Math.cos(a) * dist);
    camera.lookAt(focus.x, state.player === "batter" ? 0.95 : 1.1, focus.z);
  }
  function phase() {
    return state.player === "batter" ? batterPhase(state.move, state.t) : bowlerPhase(state.t - state.move.run);
  }
  function emit() { for (const fn of listeners) fn({ t: state.t, duration: duration(), phase: phase(), playing: state.playing }); }

  /* drag to turn the camera round the player, up/down to raise it */
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    state.yaw = drag.yaw - (e.clientX - drag.x) * 0.01;
    state.pitch = THREE.MathUtils.clamp(drag.pitch + (e.clientY - drag.y) * 0.01, -1, 4);
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  const resize = () => {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(host);
  const seenObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
  seenObserver.observe(host);
  resize();

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = THREE.MathUtils.clamp((now - last) / 1000, 0, 0.05);
    last = now;
    if (!visible || !canvas.isConnected) return;
    if (state.playing) {
      if (hold > 0) { hold -= dt; if (hold <= 0) state.t = 0; }
      else {
        state.t += dt * state.speed;
        if (state.t >= duration()) { state.t = duration(); hold = 0.8; }
      }
    }
    pose();
    placeCamera();
    world.update(now / 1000, dt);
    renderer.render(scene, camera);
    emit();
  }
  requestAnimationFrame(frame);

  return {
    moves: { batter: BATTING_MOVES, bowler: BOWLING_MOVES },
    duration,
    setPlayer(player) {
      state.player = player;
      state.move = (player === "batter" ? BATTING_MOVES : BOWLING_MOVES)[player === "batter" ? 0 : 1];
      state.t = 0; hold = 0; state.yaw = 0; state.pitch = 0;
      prepareBowler();
    },
    setMove(id) {
      const list = state.player === "batter" ? BATTING_MOVES : BOWLING_MOVES;
      state.move = list.find((m) => m.id === id) || list[0];
      state.t = 0; hold = 0;
      prepareBowler();
    },
    play() { state.playing = true; if (state.t >= duration()) state.t = 0; },
    pause() { state.playing = false; hold = 0; },
    setSpeed(speed) { state.speed = speed; },
    seek(t) { state.t = THREE.MathUtils.clamp(t, 0, duration()); hold = 0; },
    step(frames) { state.playing = false; hold = 0; state.t = THREE.MathUtils.clamp(state.t + frames / 60, 0, duration()); },
    setView(view) { state.view = view; state.yaw = 0; state.pitch = 0; },
    onTick(fn) { listeners.push(fn); },
    destroy() {
      running = false;
      listeners = [];
      sizeObserver.disconnect();
      seenObserver.disconnect();
      canvas.remove();
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}
