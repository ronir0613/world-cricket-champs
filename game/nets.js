/* ==========================================================================
   Practice Nets: batting against a pace or spin bowler in 3D.

   startNets({ drill: "pace" | "spin", level, batterKit, batterName, onExit })
   Loaded on demand from features.js, so the menus never pay for Three.js.
   ========================================================================== */
import * as THREE from "three";
import { PITCH, LEVELS, makeRng, planDelivery, releaseFrom, sampleAt, contactPlan, resolveShot, SWING_LEAD } from "./ball.js?v=4";
import { buildWorld, buildBall } from "./world.js?v=7";
import { createBatter } from "./batter.js?v=12";
import { createBowler } from "./bowler.js?v=7";
import { createSquadBatter, createSquadBowler } from "./squad-nets.js?v=1";
import { buildFigure, applyPose, batterPose, strokeFor, batterStride, batterFeet, blendFeet, bowlerPose, bowlerZ, bowlerWalk, BATTER_SPOT, KITS } from "./figure.js?v=5";

const BALLS = 12;
const BEST_KEY = "world-cricket-champs-nets";
const DRILL_NAMES = { pace: "Facing pace", spin: "Facing spin" };

let active = null;

export function startNets(options) {
  if (active) active.destroy();
  active = createSession(options);
  return active;
}

function readSettings() {
  try { return { sfx: true, sfxVolume: 0.6, reduceMotion: false, ...JSON.parse(localStorage.getItem("wcc-settings") || "{}") }; }
  catch (_) { return { sfx: true, sfxVolume: 0.6, reduceMotion: false }; }
}

function readBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || "{}"); } catch (_) { return {}; }
}
function saveBest(all) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (_) { /* storage may be blocked */ }
}

/* ---------- Sound: synthesised, no files ---------- */
function makeAudio(settings) {
  let ctx = null;
  const volume = settings.sfx ? settings.sfxVolume : 0;
  function ensure() {
    if (!volume) return null;
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function noiseBurst(duration, freq, q, gainValue, when = 0) {
    const a = ensure(); if (!a) return;
    const length = Math.floor(a.sampleRate * duration);
    const buffer = a.createBuffer(1, length, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    const src = a.createBufferSource(); src.buffer = buffer;
    const filter = a.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = freq; filter.Q.value = q;
    const gain = a.createGain(); gain.gain.value = gainValue * volume;
    src.connect(filter).connect(gain).connect(a.destination);
    src.start(a.currentTime + when);
  }
  function tone(freq, duration, gainValue, type = "sine", when = 0) {
    const a = ensure(); if (!a) return;
    const osc = a.createOscillator(); osc.type = type; osc.frequency.value = freq;
    const gain = a.createGain();
    const t = a.currentTime + when;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(gainValue * volume, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(a.destination);
    osc.start(t); osc.stop(t + duration + 0.02);
  }
  /* Recorded sounds (CC BY 4.0, see assets/sfx/CREDITS.txt). */
  const SFX = new URL("../assets/sfx/", import.meta.url).href;
  const buffers = {};
  let loading = null, ambience = null;
  function load() {
    const a = ensure(); if (!a || loading) return loading;
    loading = Promise.all(["bat_hit", "cheer_big", "cheer_small", "crowd_ambience"].map((name) =>
      fetch(SFX + name + ".mp3").then((r) => r.arrayBuffer()).then((data) => a.decodeAudioData(data)).then((buf) => { buffers[name] = buf; }).catch(() => {})
    ));
    return loading;
  }
  function play(name, gainValue, rate = 1, when = 0) {
    const a = ensure(); if (!a || !buffers[name]) return null;
    const src = a.createBufferSource(); src.buffer = buffers[name]; src.playbackRate.value = rate;
    const gain = a.createGain(); gain.gain.value = gainValue * volume;
    src.connect(gain).connect(a.destination);
    src.start(a.currentTime + when);
    return { src, gain };
  }
  return {
    unlock() { ensure(); load(); },
    bat(quality) {
      /* sweeter, deeper and louder from the middle of the bat */
      if (!play("bat_hit", 0.55 + quality * 0.5, 1.12 - quality * 0.2)) { noiseBurst(0.09, 1400 + quality * 900, 1.4, 1.1); tone(520 + quality * 260, 0.07, 0.35, "triangle"); }
    },
    edge() { if (!play("bat_hit", 0.3, 1.55)) noiseBurst(0.06, 2600, 3, 0.6); },
    stumps() { noiseBurst(0.22, 700, 0.9, 1); tone(240, 0.18, 0.3, "square"); },
    pad() { noiseBurst(0.08, 380, 1, 0.8); },
    cheer(big) { if (!play(big ? "cheer_big" : "cheer_small", big ? 0.75 : 0.6)) noiseBurst(big ? 2.2 : 1.4, 900, 0.4, big ? 0.55 : 0.35); },
    tick() { tone(880, 0.05, 0.08); },
    startAmbience() {
      const a = ensure(); if (!a) return;
      load().then(() => {
        if (ambience || !buffers.crowd_ambience) return;
        const src = a.createBufferSource(); src.buffer = buffers.crowd_ambience; src.loop = true;
        const gain = a.createGain(); gain.gain.setValueAtTime(0.0001, a.currentTime); gain.gain.linearRampToValueAtTime(0.45 * volume, a.currentTime + 1.5);
        src.connect(gain).connect(a.destination); src.start();
        ambience = { src, gain };
      });
    },
    stop() {
      if (ambience) { try { ambience.src.stop(); } catch (_) { /* already stopped */ } ambience = null; }
      if (ctx) { ctx.close().catch(() => {}); ctx = null; }
    },
    pause(on) { if (ctx) (on ? ctx.suspend() : ctx.resume()).catch(() => {}); }
  };
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function createSession({ drill = "pace", level = "Club", action = "auto", batterKit = "IND", batterName = "You", onExit = () => {} }) {
  const settings = readSettings();
  const audio = makeAudio(settings);
  const levelCfg = LEVELS[level] || LEVELS.Club;
  const html = document.documentElement;
  const host = document.querySelector("#gameScreen");
  host.hidden = false;
  html.classList.add("game-on");
  window.dispatchEvent(new Event("wcc:game-start"));

  /* ---------- HUD ---------- */
  host.innerHTML = "";
  const ui = el(`
    <div class="g-root">
      <canvas class="g-canvas" aria-label="Practice nets, batting"></canvas>
      <div class="g-scorebug" aria-live="polite">
        <span class="g-bug-tag">Nets</span>
        <span class="g-bug-drill">${DRILL_NAMES[drill]} · ${level}</span>
        <span class="g-bug-score"><b data-g="runs">0</b><small>(<span data-g="balls">0</span>/${BALLS})</small></span>
        <span class="g-bug-overs" data-g="over"></span>
      </div>
      <div class="g-delivery" data-g="delivery" hidden></div>
      <div class="g-callout" data-g="callout" hidden><b></b><span></span></div>
      <div class="g-timing" data-g="timing" hidden>
        <div class="g-timing-bar"><i class="z-miss"></i><i class="z-early"></i><i class="z-good"></i><i class="z-perfect"></i><i class="z-good"></i><i class="z-late"></i><i class="z-miss"></i><em></em></div>
        <div class="g-timing-labels"><span>Early</span><span>Perfect</span><span>Late</span></div>
      </div>
      <div class="g-hints" data-g="hints"></div>
      <button class="g-pause-btn" type="button" data-g="pauseBtn" aria-label="Pause"><span></span><span></span></button>
      <div class="g-touch" data-g="touch">
        <div class="g-aimpad" data-g="aimpad" aria-hidden="true"><span class="g-aim-ring"></span><span class="g-aim-knob"></span></div>
        <div class="g-shots">
          <button type="button" data-shot="defend">Defend</button>
          <button type="button" data-shot="ground">Ground</button>
          <button type="button" data-shot="loft">Loft</button>
        </div>
      </div>
      <div class="g-panel g-intro" data-g="intro">
        <p class="g-kicker">Practice Nets</p>
        <h2>${DRILL_NAMES[drill]}</h2>
        <p class="g-sub">${level} · ${BALLS} balls · ${drill === "spin" ? "Spinner" : "Fast bowler"}</p>
        <ul class="g-howto" data-g="howto"></ul>
        <div class="g-actions"><button type="button" class="g-btn g-btn-primary" data-act="start">Start</button><button type="button" class="g-btn" data-act="quit">Back to nets</button></div>
      </div>
      <div class="g-panel g-pause" data-g="pause" hidden role="dialog" aria-modal="true" aria-label="Paused">
        <p class="g-kicker">Paused</p>
        <h2>${DRILL_NAMES[drill]}</h2>
        <div class="g-actions g-actions-stack"><button type="button" class="g-btn g-btn-primary" data-act="resume">Resume</button><button type="button" class="g-btn" data-act="restart">Restart drill</button><button type="button" class="g-btn" data-act="quit">Quit to nets</button></div>
      </div>
      <div class="g-panel g-summary" data-g="summary" hidden role="dialog" aria-modal="true" aria-label="Drill summary"></div>
    </div>`);
  host.append(ui);
  const $ = (name) => ui.querySelector(`[data-g="${name}"]`);
  const canvas = ui.querySelector(".g-canvas");

  /* ---------- Renderer ---------- */
  const coarse = matchMedia("(pointer: coarse)").matches;
  const small = Math.min(innerWidth, innerHeight) < 600;
  const quality = coarse || small
    ? { pixelRatio: Math.min(devicePixelRatio, 1.5), shadows: true, shadowSize: 1024, segments: 56 }
    : { pixelRatio: Math.min(devicePixelRatio, 2), shadows: true, shadowSize: 2048, segments: 96 };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const { scene, strikerStumps, update: updateWorld, cheer: crowdCheer } = buildWorld(renderer, quality);
  const ball = buildBall(scene);

  const kitFor = (code) => KITS[code] || KITS.IND;
  /* Simple figures first; the realistic players replace them once loaded. */
  let batter = buildFigure({ kit: kitFor(batterKit), batter: true, skin: "#a8774f" });
  batter.root.position.set(BATTER_SPOT.x, 0, BATTER_SPOT.z);
  batter.root.rotation.y = -Math.PI / 2;
  scene.add(batter.root);
  let bowler = buildFigure({ kit: KITS.NET, skin: "#c99a76" });
  bowler.root.rotation.y = Math.PI;
  scene.add(bowler.root);
  const rigs = [];
  const lightSkin = ["AUS", "ENG", "NZL", "SA"].includes(batterKit);
  /* The squad rig's batter and bowler (game/squad-nets.js); the older
     recorded models, then the simple figures, are the fallbacks. */
  const rigLod = coarse || small ? 1 : 0;
  let realBowler = null, squadBatter = null;
  const bowlerReady = createSquadBowler({ kit: KITS.NET, skin: "#c99a76", lod: rigLod })
    .catch((error) => { console.warn("Squad bowler unavailable, using the recorded bowler.", error); return createBowler(); })
    .then((b) => {
      if (destroyed) return;
      realBowler = b;
      scene.add(b.root);
    }).catch((error) => { console.warn("Bowler model unavailable, using the simple bowler.", error); });
  const legacyBatter = () => createBatter({ kit: kitFor(batterKit) }).then((batterRig) => {
    if (destroyed) return;
    batterRig.driver.root.position.copy(batter.root.position);
    batterRig.driver.root.rotation.copy(batter.root.rotation);
    scene.remove(batter.root);
    scene.add(batterRig.driver.root);
    batterRig.role = "batter";
    rigs.push(batterRig);
    batter = batterRig.driver;
  }).catch((error) => { console.warn("Realistic batter unavailable, using the simple figure.", error); });
  const rigsReady = createSquadBatter({ kit: kitFor(batterKit), skin: lightSkin ? "#d9a882" : "#a8774f", lod: rigLod, home: BATTER_SPOT })
    .then((sb) => {
      if (destroyed) return;
      squadBatter = sb;
      scene.remove(batter.root);
      scene.add(sb.root);
    }).catch((error) => { console.warn("Squad batter unavailable, using the recorded batter.", error); return legacyBatter(); });
  /* Start waits for both, but never more than 8 s. */
  const playersReady = Promise.race([Promise.all([rigsReady, bowlerReady]), new Promise((r) => setTimeout(r, 8000))]);

  /* Aim arrow on the ground in front of the batter */
  const aimArrow = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.07, 0), new THREE.Vector2(0.07, 0), new THREE.Vector2(0.07, 1.1), new THREE.Vector2(0.2, 1.1), new THREE.Vector2(0, 1.45), new THREE.Vector2(-0.2, 1.1), new THREE.Vector2(-0.07, 1.1)])),
    new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false })
  );
  aimArrow.rotation.x = -Math.PI / 2;
  const aimHolder = new THREE.Group();
  aimHolder.position.set(0.05, 0.02, 1.9);
  aimHolder.add(aimArrow);
  scene.add(aimHolder);

  /* ---------- Camera ---------- */
  const camera = new THREE.PerspectiveCamera(6.2, 16 / 9, 0.5, 1600);
  const BROADCAST = { pos: new THREE.Vector3(0.35, 9, 60), look: new THREE.Vector3(0.12, 0.43, 4) };
  const WICKET_CAM = { pos: new THREE.Vector3(-3.3, 0.8, 3.4), look: new THREE.Vector3(0.05, 0.38, -0.15) };
  const cam = { snap: false, mode: "broadcast", pos: BROADCAST.pos.clone(), look: BROADCAST.look.clone(), fov: 6.2 };
  function baseFov() {
    const aspect = camera.aspect || 16 / 9;
    return Math.min(14, Math.max(5.5, 6.2 * Math.pow(1.78 / aspect, 0.75)));
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (cam.mode === "broadcast") cam.fov = baseFov();
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  /* ---------- Input ---------- */
  const input = { aim: { x: 0, y: 0 }, keys: new Set(), touchAim: null, padAim: { x: 0, y: 0 }, device: coarse ? "touch" : "keyboard" };
  const SHOT_KEYS = { " ": "ground", j: "ground", J: "ground", k: "loft", K: "loft", l: "defend", L: "defend" };
  const AIM_KEYS = { w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
  let clock = { game: 0, frameReal: performance.now() };
  const pressTimeNow = () => clock.game + (performance.now() - clock.frameReal) / 1000;

  function setDevice(kind) {
    if (input.device === kind) return;
    input.device = kind;
    ui.dataset.device = kind;
    renderHints();
  }
  ui.dataset.device = input.device;

  function panelOpen() {
    return ["intro", "pause", "summary"].map($).find((panel) => panel && !panel.hidden) || null;
  }
  function panelButtons(panel) { return [...panel.querySelectorAll("button")]; }
  function moveFocus(panel, step) {
    const buttons = panelButtons(panel);
    const index = buttons.indexOf(document.activeElement);
    buttons[(index + step + buttons.length) % buttons.length].focus();
  }

  function onKeyDown(event) {
    if (!host.isConnected || host.hidden) return;
    event.stopImmediatePropagation();
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (input.device !== "keyboard") setDevice("keyboard");
    const panel = panelOpen();
    if (panel) {
      if (["ArrowDown", "ArrowRight", "s", "d"].includes(event.key)) { event.preventDefault(); moveFocus(panel, 1); }
      else if (["ArrowUp", "ArrowLeft", "w", "a"].includes(event.key)) { event.preventDefault(); moveFocus(panel, -1); }
      else if (event.key === "Escape" && panel === $("pause")) { event.preventDefault(); resume(); }
      else if (event.key === "Escape" && panel === $("intro")) { event.preventDefault(); quit(); }
      return;
    }
    const key = event.key.length === 1 ? event.key : event.key.toLowerCase();
    if (event.key === "Escape" || key === "p" || key === "P") { event.preventDefault(); pause(); return; }
    if (AIM_KEYS[key.toLowerCase()]) { event.preventDefault(); input.keys.add(key.toLowerCase()); return; }
    if (SHOT_KEYS[event.key] && !event.repeat) { event.preventDefault(); playShot(SHOT_KEYS[event.key], pressTimeNow()); }
  }
  function onKeyUp(event) {
    if (host.hidden) return;
    event.stopImmediatePropagation();
    input.keys.delete(event.key.toLowerCase());
  }
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);

  /* Touch: drag on the left pad to aim, tap a shot button. */
  const aimpad = $("aimpad");
  const knob = aimpad.querySelector(".g-aim-knob");
  aimpad.addEventListener("pointerdown", (event) => {
    setDevice(event.pointerType === "mouse" ? "keyboard" : "touch");
    aimpad.setPointerCapture(event.pointerId);
    const r = aimpad.getBoundingClientRect();
    input.touchAim = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2, id: event.pointerId };
    updateTouchAim(event);
  });
  function updateTouchAim(event) {
    if (!input.touchAim || event.pointerId !== input.touchAim.id) return;
    let dx = (event.clientX - input.touchAim.cx) / input.touchAim.r, dy = (input.touchAim.cy - event.clientY) / input.touchAim.r;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    input.touchAim.x = dx; input.touchAim.y = dy;
    knob.style.transform = `translate(${dx * 38}px, ${-dy * 38}px)`;
  }
  aimpad.addEventListener("pointermove", updateTouchAim);
  const endTouchAim = () => { input.touchAim = null; knob.style.transform = ""; };
  aimpad.addEventListener("pointerup", endTouchAim);
  aimpad.addEventListener("pointercancel", endTouchAim);
  ui.querySelector(".g-shots").addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-shot]");
    if (!button) return;
    event.preventDefault();
    setDevice(event.pointerType === "mouse" ? "keyboard" : "touch");
    playShot(button.dataset.shot, pressTimeNow());
  });
  canvas.addEventListener("pointerdown", (event) => { if (event.pointerType !== "mouse") setDevice("touch"); });
  $("pauseBtn").addEventListener("click", () => pause());

  ui.addEventListener("click", (event) => {
    const act = event.target.closest("[data-act]");
    if (!act) return;
    audio.unlock();
    ({ start: begin, resume, restart, quit, again: restart })[act.dataset.act]?.();
  });

  /* Gamepad */
  const padHeld = {};
  function pollPad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (!pads.length) { input.padAim.x = input.padAim.y = 0; return; }
    const pad = pads[0];
    const button = (i) => Boolean(pad.buttons[i] && pad.buttons[i].pressed);
    let ax = pad.axes[0] || 0, ay = -(pad.axes[1] || 0);
    if (button(14)) ax = -1; if (button(15)) ax = 1; if (button(12)) ay = 1; if (button(13)) ay = -1;
    const len = Math.hypot(ax, ay);
    input.padAim.x = len > 0.25 ? ax : 0; input.padAim.y = len > 0.25 ? ay : 0;
    const edge = (i) => { const down = button(i); const was = padHeld[i]; padHeld[i] = down; return down && !was; };
    const anyPress = [0, 1, 2, 3, 9, 12, 13].some((i) => button(i)) || len > 0.5;
    if (anyPress) setDevice(/054c|playstation|dualsense|dualshock|wireless controller/i.test(pad.id) ? "ps" : "xbox");
    const panel = panelOpen();
    if (panel) {
      if (edge(13) || edge(15)) moveFocus(panel, 1);
      if (edge(12) || edge(14)) moveFocus(panel, -1);
      if (edge(0) && panel.contains(document.activeElement)) document.activeElement.click();
      if (edge(9) && panel === $("pause")) resume();
      if (edge(1) && panel === $("pause")) resume();
      edge(2); edge(3);
      return;
    }
    if (edge(9)) { pause(); return; }
    const t = pressTimeNow();
    if (edge(0)) playShot("ground", t);
    if (edge(3)) playShot("loft", t);
    if (edge(2)) playShot("defend", t);
    edge(1); edge(12); edge(13); edge(14); edge(15);
  }

  function currentAim() {
    if (input.touchAim) return { x: input.touchAim.x || 0, y: input.touchAim.y || 0 };
    if (input.padAim.x || input.padAim.y) return { ...input.padAim };
    let x = 0, y = 0;
    for (const key of input.keys) { const v = AIM_KEYS[key]; if (v) { x += v[0]; y += v[1]; } }
    const len = Math.hypot(x, y);
    return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  /* ---------- Hints ---------- */
  const HINTS = {
    keyboard: [["W A S D", "Aim"], ["Space", "Ground shot"], ["K", "Loft"], ["L", "Defend"], ["Esc", "Pause"]],
    xbox: [["Left stick", "Aim"], ["A", "Ground shot"], ["Y", "Loft"], ["X", "Defend"], ["Menu", "Pause"]],
    ps: [["Left stick", "Aim"], ["✕", "Ground shot"], ["△", "Loft"], ["□", "Defend"], ["Options", "Pause"]],
    touch: [["Drag left pad", "Aim"], ["Buttons", "Play a shot"]]
  };
  function renderHints() {
    const list = HINTS[input.device] || HINTS.keyboard;
    $("hints").innerHTML = list.map(([key, label]) => `<span><kbd>${key}</kbd>${label}</span>`).join("");
    $("howto").innerHTML = [
      `<li><b>Aim</b> with ${input.device === "touch" ? "the left pad" : input.device === "keyboard" ? "W A S D or the arrows" : "the left stick"}: up hits it straight, left to the off side, right to the leg side.</li>`,
      `<li><b>Time it:</b> play your shot just before the ball reaches you. Perfect timing finds the rope.</li>`,
      `<li><b>Ground</b> keeps it down, <b>Loft</b> goes for six but can be caught, <b>Defend</b> keeps your wicket.</li>`,
      `<li>Don't play at all to leave the ball, but not if it's hitting the stumps.</li>`
    ].join("");
  }
  renderHints();

  /* ---------- Session state ---------- */
  const rng = makeRng((Date.now() ^ 0x5bd1e995) >>> 0);
  const session = { balls: 0, runs: 0, fours: 0, sixes: 0, outs: 0, grades: { perfect: 0, good: 0, early: 0, late: 0, miss: 0, leave: 0 }, shots: [], over: [] };
  let state = "intro";      /* intro | runup | live | after | summary */
  let paused = false;
  let ballCtx = null;       /* the current delivery and what happened to it */
  let timeouts = [];

  function later(seconds, fn) { timeouts.push({ at: clock.game + seconds, fn }); }

  function begin() {
    $("intro").hidden = true;
    canvas.focus?.();
    audio.unlock();
    audio.startAmbience();
    later(0.6, nextBall);
    state = "between";
  }

  function nextBall() {
    if (session.balls >= BALLS) { showSummary(); return; }
    hideCallout();
    $("timing").hidden = true;
    if (cam.mode !== "broadcast") cam.snap = true;
    cam.mode = "broadcast";
    resetStumps();
    ball.marker.visible = false;
    let delivery = planDelivery(drill, level, rng, action);
    /* Real bowler: place him, then release the ball from his actual hand. */
    if (realBowler) {
      realBowler.prepare(delivery, level);
      realBowler.update(0);
      realBowler.root.updateMatrixWorld(true);
      const hand = new THREE.Vector3();
      realBowler.ballHold.getWorldPosition(hand);
      delivery = releaseFrom(delivery, { x: hand.x, y: Math.max(1.5, hand.y + 0.08), z: hand.z });
      bowler.root.visible = false;
    }
    const spin = delivery.spin;
    const runTime = realBowler ? (spin ? 1.4 : 2.3) : (spin ? 1.15 : 1.75);
    const releaseAt = clock.game + runTime;
    ballCtx = {
      delivery, plan: contactPlan(delivery), releaseAt,
      bowl: { releaseAt, runTime, spin },
      bat: lastBatterPose ? { phase: "recover", t0: clock.game, from: lastBatterPose } : { phase: "stance", t0: clock.game },
      press: null, result: null, resolved: false, contactDone: false, flightStart: null, calloutShown: false, stumpsBroken: false
    };
    ball.resetTrail();
    bowler.root.position.x = delivery.release.x - 0.21;
    state = "runup";
  }

  function playShot(shot, at) {
    if (state !== "runup" && state !== "live") return;
    if (!ballCtx || ballCtx.press) return;
    const tau = at - ballCtx.releaseAt;
    if (tau < -0.15) return;                  /* too early to count: ignore */
    const aim = currentAim();
    ballCtx.press = { shot, tau, aim };
    resolveNow({ pressTime: tau, shot, aim });
    const result = ballCtx.result;
    const contactAt = result.grade === "miss" || result.kind === "beaten" || result.kind === "bowled"
      ? at + SWING_LEAD[shot]
      : ballCtx.releaseAt + ballCtx.plan.t;
    const angle = result.angle != null ? Math.max(-1.3, Math.min(1.3, result.angle)) : 0;
    const stroke = strokeFor(shot, ballCtx.plan.front, angle, ballCtx.plan.at.y);
    ballCtx.bat = { phase: "swing", t0: at, contactAt, front: ballCtx.plan.front, aim: angle, shot, stroke };
  }

  function resolveNow(inputData) {
    ballCtx.result = resolveShot(ballCtx.delivery, inputData, level, rng);
    ballCtx.resolved = true;
  }

  function finishBall() {
    const r = ballCtx.result;
    session.balls += 1;
    session.runs += r.runs || 0;
    if (r.runs === 4) session.fours += 1;
    if (r.runs === 6) session.sixes += 1;
    if (r.out) session.outs += 1;
    session.grades[r.grade] = (session.grades[r.grade] || 0) + 1;
    if (r.flight && r.kind !== "caught") {
      const end = r.flight.overRope || r.flight.end;
      session.shots.push({ x: end.x, z: end.z, runs: r.runs });
    }
    if (session.over.length >= 6) session.over = [];
    session.over.push(r.out ? "W" : String(r.runs || 0));
    updateScore();
    later(1.9, nextBall);
    state = "after";
  }

  /* ---------- HUD helpers ---------- */
  function updateScore() {
    $("runs").textContent = session.runs;
    $("balls").textContent = session.balls;
    $("over").innerHTML = session.over.map((v) => `<i class="${v === "W" ? "is-out" : v === "4" || v === "6" ? "is-boundary" : v === "0" ? "is-dot" : ""}">${v === "0" ? "•" : v}</i>`).join("");
  }
  function showDelivery(d) {
    const box = $("delivery");
    box.innerHTML = `<b>${d.speedKmh} km/h</b><span>${d.style} · ${d.length}</span>`;
    box.hidden = false;
  }
  function showCallout(result) {
    const box = $("callout");
    box.querySelector("b").textContent = result.label;
    box.querySelector("span").textContent = result.detail || "";
    box.className = `g-callout ${result.out ? "is-out" : result.runs >= 4 ? "is-boundary" : ""}`;
    box.hidden = false;
    void box.offsetWidth;
    box.classList.add("is-in");
  }
  function hideCallout() { $("callout").hidden = true; $("delivery").hidden = true; }
  function showTiming(result) {
    if (result.error == null) return;
    const [perfect, good, ok] = levelCfg.windows;
    const box = $("timing");
    const range = ok * 1.25;
    const pct = (v) => `${((v / (range * 2)) * 100).toFixed(2)}%`;
    box.querySelector(".g-timing-bar").style.gridTemplateColumns = [range - ok, ok - good, good - perfect, perfect * 2, good - perfect, ok - good, range - ok].map(pct).join(" ");
    const clamped = Math.max(-1, Math.min(1, result.error / range));
    box.querySelector("em").style.left = `${50 + clamped * 50}%`;
    box.dataset.grade = result.grade;
    box.hidden = false;
  }

  /* ---------- Pause / quit / summary ---------- */
  function pause() {
    if (state === "intro" || state === "summary" || paused) return;
    paused = true;
    audio.pause(true);
    $("pause").hidden = false;
    $("pause").querySelector("button").focus();
  }
  function resume() {
    paused = false;
    audio.pause(false);
    $("pause").hidden = true;
    clock.frameReal = performance.now();
  }
  function restart() {
    destroy(true);
    active = createSession({ drill, level, action, batterKit, batterName, onExit });
  }
  function quit() {
    destroy();
    onExit();
  }

  function showSummary() {
    state = "summary";
    hideCallout();
    $("timing").hidden = true;
    const all = readBest();
    const key = `${drill}:${level}`;
    const previous = all[key] || 0;
    const newBest = session.runs > previous;
    if (newBest) { all[key] = session.runs; saveBest(all); }
    const sr = session.balls ? Math.round((session.runs / session.balls) * 100) : 0;
    const g = session.grades;
    const scale = 52 / PITCH.boundary;
    const lines = session.shots.map((s) => {
      const x = 60 + s.x * scale, y = 60 - s.z * scale;
      const cls = s.runs === 6 ? "w-six" : s.runs === 4 ? "w-four" : s.runs > 0 ? "w-run" : "w-dot";
      return `<line class="${cls}" x1="60" y1="60" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    }).join("");
    $("summary").innerHTML = `
      <p class="g-kicker">Drill complete · ${DRILL_NAMES[drill]} · ${level}</p>
      <h2>${session.runs} <small>off ${session.balls} balls</small></h2>
      ${newBest ? `<p class="g-best">New best for this drill</p>` : previous ? `<p class="g-sub">Best: ${previous}</p>` : ""}
      <div class="g-summary-grid">
        <dl class="g-stats">
          <div><dt>Strike rate</dt><dd>${sr}</dd></div>
          <div><dt>Fours</dt><dd>${session.fours}</dd></div>
          <div><dt>Sixes</dt><dd>${session.sixes}</dd></div>
          <div><dt>Dismissals</dt><dd>${session.outs}</dd></div>
          <div><dt>Perfect</dt><dd>${g.perfect}</dd></div>
          <div><dt>Good</dt><dd>${g.good}</dd></div>
          <div><dt>Early / late</dt><dd>${g.early + g.late}</dd></div>
          <div><dt>Missed / left</dt><dd>${g.miss + g.leave}</dd></div>
        </dl>
        <figure class="g-wagon">
          <svg viewBox="0 0 120 120" role="img" aria-label="Wagon wheel of your scoring shots">
            <circle cx="60" cy="60" r="52" class="w-field"/>
            <rect x="58.5" y="46" width="3" height="14" class="w-pitch"/>
            ${lines}
          </svg>
          <figcaption>Wagon wheel · up is straight</figcaption>
        </figure>
      </div>
      <div class="g-actions"><button type="button" class="g-btn g-btn-primary" data-act="again">Go again</button><button type="button" class="g-btn" data-act="quit">Back to nets</button></div>`;
    $("summary").hidden = false;
    $("summary").querySelector("button").focus();
    try { window.dispatchEvent(new CustomEvent("wcc:nets-complete", { detail: { drill, level, runs: session.runs, balls: session.balls } })); } catch (_) { /* optional */ }
  }

  /* ---------- Frame update ---------- */
  const tmp = new THREE.Vector3();
  let raf = 0;
  let destroyed = false;

  function updateBall(now) {
    const c = ballCtx;
    if (!c) { ball.show(false); return; }
    const tau = now - c.releaseAt;
    if (tau < 0) {
      (realBowler && c.delivery ? realBowler.ballHold : bowler.ballHold).getWorldPosition(tmp);
      ball.show(true);
      ball.place(tmp);
      ball.trail.visible = false;
      return;
    }
    if (!c.trailReset) { c.trailReset = true; ball.resetTrail(); }
    ball.trail.visible = true;
    const r = c.result;
    const hit = r && r.flight && (r.kind === "hit" || r.kind === "edge" || r.kind === "caught");
    if (hit && tau >= c.plan.t) {
      if (!c.contactDone) {
        c.contactDone = true;
        c.flightStart = c.releaseAt + c.plan.t;
        if (r.kind === "hit") audio.bat(r.quality || 0.5); else audio.edge();
        if (r.flight.distance > 14 && r.kind !== "caught") later(0.22, () => { if (ballCtx === c) { cam.mode = "follow"; cam.snap = true; } });
      }
      const p = sampleAt(r.flight.samples, now - c.flightStart);
      ball.place(p);
      return;
    }
    const p = sampleAt(c.delivery.samples, tau);
    ball.place(p);
    /* Bowled: knock the stumps over as the ball arrives. */
    if (r && r.kind === "bowled" && !c.stumpsBroken && c.delivery.stumps && tau >= c.delivery.stumps.t) {
      c.stumpsBroken = true;
      audio.stumps();
      breakStumps(c.delivery.stumps.x);
      later(0.12, () => { if (ballCtx === c) { cam.mode = "wicket"; cam.snap = true; } });
    }
  }

  const flying = [];
  function breakStumps(x) {
    strikerStumps.bails.forEach((bail, i) => flying.push({ obj: bail, v: new THREE.Vector3((i ? 1 : -1) * 1.5 + x * 4, 3.2 + i, -2.5), spin: 12 }));
    strikerStumps.stumps.forEach((stump, i) => {
      const lean = (i - 1) * 0.25 + x * 1.5;
      flying.push({ obj: stump, lean: { x: -0.7 + Math.random() * 0.2, z: lean }, t: 0 });
    });
  }
  function resetStumps() {
    flying.length = 0;
    strikerStumps.stumps.forEach((s, i) => { s.position.copy(strikerStumps.home.stumps[i]); s.rotation.set(0, 0, 0); });
    strikerStumps.bails.forEach((b, i) => { b.position.copy(strikerStumps.home.bails[i]); b.rotation.set(0, 0, 0); });
  }
  function updateFlying(dt) {
    for (const f of flying) {
      if (f.v) {
        f.v.y -= 9.81 * dt;
        f.obj.position.addScaledVector(f.v, dt);
        f.obj.rotation.x += f.spin * dt;
        if (f.obj.position.y < 0.01) { f.obj.position.y = 0.01; f.v.multiplyScalar(0.3); f.v.y = Math.abs(f.v.y); f.spin *= 0.5; }
      } else if (f.lean) {
        f.t = Math.min(1, f.t + dt * 4);
        f.obj.rotation.x = f.lean.x * f.t;
        f.obj.rotation.z = f.lean.z * f.t;
      }
    }
  }

  function updateLogic(now) {
    for (const item of timeouts.filter((t) => t.at <= now)) { timeouts = timeouts.filter((t) => t !== item); item.fn(); }
    const c = ballCtx;
    if (!c) return;
    const tau = now - c.releaseAt;

    if (state === "runup") {
      if (c.bat.phase === "recover" && now - c.bat.t0 > 0.6) c.bat = { phase: "stance", t0: now };
      if (tau > -0.36 && (c.bat.phase === "stance" || c.bat.phase === "recover")) c.bat = { phase: "backlift", t0: now };
      if (tau >= 0) {
        state = "live";
        resetStumps();
        showDelivery(c.delivery);
        if (c.delivery.marker && c.delivery.bounce) {
          ball.marker.position.set(c.delivery.bounce.x, 0.02, c.delivery.bounce.z);
          ball.marker.visible = true;
        }
      }
    }
    if (state === "live") {
      if (c.delivery.bounce && tau > c.delivery.bounce.t + 0.1) ball.marker.visible = false;
      const [, , ok] = levelCfg.windows;
      /* No shot by the end of the window: it's a leave. */
      if (!c.press && tau > c.plan.t + ok + 0.05 && !c.resolved) {
        resolveNow({ pressTime: null });
        c.bat = { phase: "leave", t0: now };
      }
      if (c.resolved && !c.calloutShown) {
        const r = c.result;
        let showAt;
        if (r.flight && (r.kind === "hit" || r.kind === "edge" || r.kind === "caught")) {
          const f = r.flight;
          const decisive = r.kind === "caught" ? (f.firstLanding ? f.firstLanding.t * 0.7 : 0.6)
            : f.overRope ? f.overRope.t
            : Math.min(f.end.t, 2.6);
          showAt = c.plan.t + Math.max(0.35, decisive);
        } else if (r.kind === "bowled" && c.delivery.stumps) {
          showAt = c.delivery.stumps.t + 0.1;
        } else {
          showAt = c.plan.t + 0.3;
        }
        if (tau >= showAt) {
          c.calloutShown = true;
          showCallout(r);
          showTiming(r);
          if (r.runs === 6) { audio.cheer(true); crowdCheer(1); } else if (r.runs === 4) { audio.cheer(false); crowdCheer(0.6); }
          finishBall();
        }
      }
    }
    if (state === "after" && cam.mode === "follow" && c.calloutShown && now - (c.flightStart || now) > 3.2) cam.mode = "broadcast";
  }

  let strideNow = 0, feetNow = null;
  let lastBatterPose = null;
  /* Feet follow the footwork exactly while batting; between balls they step
     back to the stance (the foot with further to go lifts) instead of sliding. */
  function settleFeet(bat, now) {
    const want = batterFeet(bat, now);
    if (!feetNow || !(bat.phase === "stance" || bat.phase === "recover")) { feetNow = want; return feetNow; }
    feetNow = blendFeet(feetNow, want, 0.08);
    const left = Math.hypot(feetNow.L.dx - want.L.dx, feetNow.L.dz - want.L.dz);
    const right = Math.hypot(feetNow.R.dx - want.R.dx, feetNow.R.dz - want.R.dz);
    const foot = left >= right ? feetNow.L : feetNow.R;
    foot.lift = Math.max(foot.lift, Math.min(0.06, Math.max(left, right) * 0.5));
    return feetNow;
  }
  function updateFigures(now, dt = 0) {
    const c = ballCtx;
    const bat = c ? c.bat : { phase: "stance", t0: 0 };
    lastBatterPose = batterPose(bat, now);
    applyPose(batter, lastBatterPose);
    const stride = batterStride(bat, now);
    strideNow += (stride - strideNow) * (bat.phase === "swing" ? 1 : 0.08);
    batter.root.position.z = BATTER_SPOT.z + strideNow;
    const feet = settleFeet(bat, now);
    if (c) {
      applyPose(bowler, bowlerPose(c.bowl, now));
      bowler.root.position.z = bowlerZ(c.bowl, now);
      const walk = bowlerWalk(c.bowl, now);
      bowler.root.position.x = c.delivery.release.x - 0.21 + walk.dx;
      bowler.root.rotation.y = walk.yaw;
    } else {
      applyPose(bowler, bowlerPose({ releaseAt: now + 10, runTime: 1, spin: false }, now));
      bowler.root.position.set(0.3, 0, 30);
    }
    if (realBowler) realBowler.update(c ? now - c.releaseAt : -99);
    const bowlLayer = bowlerLayer(c, now, dt);
    for (const rig of rigs) rig.update(rig.role === "bowler" ? bowlLayer : { dt, feet, stride: strideNow });
    if (squadBatter) squadBatter.update(dt, c, now);
  }

  /* Real animation for the bowler's run-up, walk back and idle; the
     hand-built delivery stride takes over in between. */
  function bowlerLayer(c, now, dt) {
    if (!c) return { clip: "Idle_Loop", weight: 1, dt };
    const t = now - c.releaseAt;
    const gather = c.bowl.spin ? 0.32 : 0.42;
    const run = c.bowl.spin ? "Jog_Fwd_Loop" : "Sprint_Loop";
    const runScale = c.bowl.spin ? 1.15 : 1.05;
    if (t < -gather - 0.12) return { clip: run, weight: 1, timeScale: runScale, dt, fade: 0.2 };
    if (t < -gather) return { clip: run, weight: (-gather - t) / 0.12, timeScale: runScale, dt };
    if (t < 0.7) return { clip: "Walk_Loop", weight: 0, dt, fade: 0.1 };
    const walking = bowlerWalk(c.bowl, now).dx < 3.15;
    if (walking) return { clip: "Walk_Loop", weight: Math.min(1, (t - 0.7) / 0.3), timeScale: 1, dt, fade: 0.3 };
    return { clip: "Idle_Loop", weight: 1, dt, fade: 0.5 };
  }

  function updateAimArrow(dt) {
    const aim = currentAim();
    const live = state === "runup" || state === "live";
    const show = live && (Math.hypot(aim.x, aim.y) > 0.3) && !(ballCtx && ballCtx.press);
    const target = show ? 0.7 : 0;
    aimArrow.material.opacity += (target - aimArrow.material.opacity) * Math.min(1, dt * 10);
    if (show) aimHolder.rotation.y = -Math.atan2(aim.x, aim.y) + Math.PI;
  }

  function updateCamera(dt, now) {
    let targetPos, targetLook, targetFov;
    if (cam.mode === "follow" && ballCtx) {
      const b = ball.ball.position;
      targetLook = new THREE.Vector3(b.x, Math.max(0.3, b.y * 0.8), b.z);
      targetPos = new THREE.Vector3(b.x * 0.3, 22 + Math.max(0, b.y) * 0.4, 52 + b.z * 0.12);
      const radial = Math.hypot(targetPos.x, targetPos.z);
      if (radial > 58) { targetPos.x *= 58 / radial; targetPos.z *= 58 / radial; }
      const reach = targetPos.distanceTo(targetLook);
      targetFov = THREE.MathUtils.radToDeg(2 * Math.atan((9 + Math.max(0, b.y) * 0.5) / reach));
    } else if (cam.mode === "wicket") {
      /* low, side-on close-up of the broken stumps */
      targetPos = WICKET_CAM.pos; targetLook = WICKET_CAM.look; targetFov = 30;
    } else {
      targetPos = BROADCAST.pos; targetLook = BROADCAST.look; targetFov = baseFov();
      /* small push-in as the bowler reaches the crease */
      if (ballCtx && state !== "after") {
        const tau = now - ballCtx.releaseAt;
        const k = Math.max(0, Math.min(1, (tau + 1.2) / 1.2));
        targetFov = baseFov() * (1 - 0.07 * k);
      }
    }
    let rate = settings.reduceMotion ? 1 : Math.min(1, dt * (cam.mode === "follow" ? 2.6 : 5));
    let lookRate = settings.reduceMotion ? 1 : Math.min(1, dt * (cam.mode === "follow" ? 7 : 5));
    if (cam.mode === "wicket") { rate = Math.min(1, dt * 0.6); lookRate = 1; }
    if (cam.snap) { rate = lookRate = 1; cam.snap = false; }
    cam.pos.lerp(targetPos, rate);
    cam.look.lerp(targetLook, lookRate);
    cam.fov += (targetFov - cam.fov) * (cam.mode === "wicket" ? 1 : rate);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    /* Keep the ball readable on screen: never smaller than ~0.7% of the height. */
    const d = camera.position.distanceTo(ball.ball.position);
    const minSize = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.007;
    ball.ball.scale.setScalar(Math.max(1, minSize / 0.104));
  }

  function frame(real) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dtReal = Math.min(0.05, (real - clock.frameReal) / 1000);
    clock.frameReal = real;
    tick(dtReal);
  }
  function tick(dtReal) {
    pollPad();
    if (!paused) clock.game += dtReal;
    const now = clock.game;
    const dt = paused ? 0 : dtReal;
    if (!paused) {
      updateLogic(now);
      updateFigures(now, dt);
      updateBall(now);
      updateFlying(dt);
      updateWorld(now, dt);
    }
    updateAimArrow(dtReal);
    updateCamera(dtReal, now);
    renderer.render(scene, camera);
  }

  /* Pause when the tab is hidden. */
  function onVisibility() { if (document.hidden) pause(); }
  document.addEventListener("visibilitychange", onVisibility);

  function destroy(restarting = false) {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    audio.stop();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    document.removeEventListener("visibilitychange", onVisibility);
    resizeObserver.disconnect();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) [].concat(obj.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    renderer.dispose();
    host.innerHTML = "";
    host.hidden = true;
    html.classList.remove("game-on");
    if (!restarting) window.dispatchEvent(new Event("wcc:game-end"));
    if (active && active.destroy === destroy) active = null;
  }

  updateScore();
  clock.frameReal = performance.now();
  raf = requestAnimationFrame(frame);
  const startButton = ui.querySelector('[data-act="start"]');
  startButton.disabled = true;
  startButton.textContent = "Loading players…";
  playersReady.finally(() => {
    if (destroyed) return;
    startButton.disabled = false;
    startButton.textContent = "Start";
    if (!panelOpen() || panelOpen() === $("intro")) startButton.focus();
  });
  startButton.focus();

  return { ready: playersReady, destroy, freeze(on) { paused = on; clock.frameReal = performance.now(); }, advance(seconds) { const p = paused; paused = false; for (let t = 0; t < seconds; t += 1 / 60) tick(1 / 60); paused = p; clock.frameReal = performance.now(); }, begin, playShot: (shot) => playShot(shot, pressTimeNow()), shotPerfect(shot, offset = 0, aim) { if (aim) { input.padAim.x = aim.x; input.padAim.y = aim.y; } playShot(shot, ballCtx.releaseAt + ballCtx.plan.t - SWING_LEAD[shot] + offset); input.padAim.x = input.padAim.y = 0; }, debug: { session, get state() { return state; }, get ballCtx() { return ballCtx; }, camera, scene, renderer, get batter() { return batter; }, get bowler() { return bowler; }, get realBowler() { return realBowler; }, get squadBatter() { return squadBatter; }, rigs } };
}
