/* ==========================================================================
   Practice match (2 overs a side, from the nets) and Quick Match (India v
   Australia, 5 overs a side, full XIs, commentary) in the nets' stadium.

   You bat one innings and bowl the other against a CPU side. Batting works
   as in the nets, plus calling runs; bowling is aiming a spot on the pitch,
   picking the delivery and timing the release. Fielders chase, catch and
   throw; run-outs happen at either end.

   startPracticeMatch({ level, teamCode, onExit })
   startPracticeMatch({ mode: "quick", teamCode, oppCode, overs, level, onExit })
     Quick Match opens on the stadium with the intro commentary, then the toss.
   Rules: game/match-rules.js. Fielding and running: game/fielding.js.
   ========================================================================== */
import * as THREE from "three";
import { PITCH, LEVELS, VARIATIONS, makeRng, planDelivery, planCustomDelivery, releaseFrom, sampleAt, contactPlan, resolveShot, SWING_LEAD, timeAtZ } from "./ball.js?v=5";
import { buildWorld, buildBall } from "./world.js?v=10";
import { loadRig } from "./rig.js";
import { createSquadBatter, createSquadBowler, rigKit } from "./squad-nets.js?v=2";
import { strokeFor, BATTER_SPOT, KITS } from "./figure.js?v=5";
import { makeAudio, el, readSettings } from "./nets.js?v=25";
import { ENDS, RUN_TIME, RUN_DELAY, fieldPositions, playOut, ballAtEnd, runnerZ, outOfGround, chooseRuns, throwEnd, bestGap } from "./fielding.js?v=3";
import { createMatch } from "./match-rules.js?v=2";
import { createCommentary, SPECIALS } from "./commentary.js?v=1";
import { SQUADS, shortName } from "./squads.js?v=1";

const USER = 0, CPU = 1;
const NAMES = {
  user: ["A. Mehra", "J. Okoro", "R. Sato", "T. Byrne", "K. Desai"],
  cpu: ["L. Varga", "O. Mensah", "P. Laine", "H. Duarte", "C. Ives"]
};
const SKINS = ["#a8774f", "#d9a882", "#8a5a3c", "#c99a76", "#6f4a33", "#e0b48f"];
const CPU_SKILL = { Club: 0.25, Domestic: 0.55, International: 0.85 };
const AI_SIGMA = { Club: 0.06, Domestic: 0.045, International: 0.034 };
const WIDE_OFF = -0.92, WIDE_LEG = 0.5, WIDE_HIGH = 1.85;

let active = null;

/* the running session (for tests and tools) */
export function currentPracticeMatch() { return active; }

export function startPracticeMatch(options) {
  if (active) active.destroy();
  active = createSession(options);
  return active;
}

function createSession(options) {
  const { mode = "practice", level = "Club", teamCode = "IND", oppCode = null, skipIntro = false, onExit = () => {} } = options;
  const quick = mode === "quick";
  const OVERS = options.overs || (quick ? 5 : 2);
  const WICKETS = options.wickets || (quick ? 10 : 3);
  const settings = readSettings();
  const audio = makeAudio(settings);
  const levelCfg = LEVELS[level] || LEVELS.Club;
  const html = document.documentElement;
  const host = document.querySelector("#gameScreen");
  host.hidden = false;
  html.classList.add("game-on");
  window.dispatchEvent(new Event("wcc:game-start"));

  const cpuCode = oppCode || (teamCode === "AUS" ? (quick ? "IND" : "ENG") : "AUS");
  const squadTeam = (code) => ({ ...SQUADS[code], short: code, kit: KITS[code] });
  const teams = quick
    ? [squadTeam(teamCode), squadTeam(cpuCode)]
    : [
      { name: teamCode, short: teamCode, code: teamCode, players: NAMES.user, kit: KITS[teamCode] || KITS.IND },
      { name: cpuCode, short: cpuCode, code: cpuCode, players: NAMES.cpu, kit: KITS[cpuCode] }
    ];
  let match = null;
  const commentary = quick ? createCommentary({ volume: Math.min(1, (settings.sfxVolume ?? 0.6) * 1.5), enabled: settings.sfx !== false }) : null;
  const quitLabel = quick ? "Quit to home" : "Quit to nets";
  const title = quick ? `${teams[0].name} <small>v</small> ${teams[1].name}` : `${teamCode} v ${cpuCode}`;

  /* ---------- HUD ---------- */
  host.innerHTML = "";
  const ui = el(`
    <div class="g-root m-root" data-stage="${quick ? "pre" : "play"}">
      <canvas class="g-canvas" aria-label="${quick ? "Quick Match" : "Practice match"}"></canvas>
      <div class="g-scorebug" aria-live="polite">
        <span class="g-bug-tag">${quick ? "Live" : "Match"}</span>
        <span class="g-bug-drill" data-g="team">${teams[0].short}</span>
        <span class="g-bug-score"><b data-g="runs">0/0</b><small>(<span data-g="overs">0.0</span>/${OVERS})</small></span>
        <span class="g-bug-overs" data-g="over"></span>
        <span class="m-need" data-g="need" hidden></span>
      </div>
      <div class="m-players" data-g="players" hidden><span data-g="striker"></span><span data-g="bowlerName"></span></div>
      <div class="m-freehit" data-g="freehit" hidden>Free hit</div>
      <div class="g-delivery" data-g="delivery" hidden></div>
      <div class="g-callout" data-g="callout" hidden><b></b><span></span></div>
      <div class="m-run" data-g="run" hidden></div>
      <div class="m-bowl" data-g="bowl" hidden>
        <div class="m-bowl-head"><b data-g="bowlType"></b><span data-g="bowlSpeed"></span></div>
        <div class="m-meter" data-g="meter" hidden><i class="m-meter-bad"></i><i class="m-meter-ok"></i><i class="m-meter-good"></i><i class="m-meter-ok"></i><i class="m-meter-bad"></i><em></em></div>
        <p class="m-bowl-tip" data-g="bowlTip"></p>
      </div>
      <div class="g-hints" data-g="hints"></div>
      <button class="g-pause-btn" type="button" data-g="pauseBtn" aria-label="Pause"><span></span><span></span></button>
      <div class="g-touch" data-g="touch">
        <div class="g-aimpad" data-g="aimpad" aria-hidden="true"><span class="g-aim-ring"></span><span class="g-aim-knob"></span></div>
        <div class="g-shots" data-g="batButtons">
          <button type="button" data-run="back" class="m-run-btn">Back</button>
          <button type="button" data-run="run" class="m-run-btn">Run</button>
          <button type="button" data-shot="defend">Defend</button>
          <button type="button" data-shot="ground">Ground</button>
          <button type="button" data-shot="loft">Loft</button>
        </div>
        <div class="g-shots" data-g="bowlButtons" hidden>
          <button type="button" data-bowl="kind">Pace / spin</button>
          <button type="button" data-bowl="type">Delivery</button>
          <button type="button" data-bowl="go">Bowl</button>
        </div>
      </div>
      <div class="m-cine" data-g="cine" hidden>
        <p class="g-kicker">Quick Match · ${OVERS} overs a side</p>
        <h2>${title}</h2>
        <button type="button" class="g-btn" data-act="skipIntro">Skip intro</button>
      </div>
      <div class="g-panel m-toss" data-g="toss" hidden role="dialog" aria-modal="true" aria-label="The toss">
        <p class="g-kicker">The toss</p>
        <h2>${title}</h2>
        <div class="m-coin-row"><div class="qm-coin-stage"><div class="qm-coin" data-g="coin"><span class="qm-coin-face qm-coin-heads">H</span><span class="qm-coin-face qm-coin-tails">T</span></div></div></div>
        <p class="g-sub m-toss-status" data-g="tossStatus" role="status">${quick ? `${teams[0].captain} calls for ${teams[0].name}. Heads or tails?` : ""}</p>
        <div class="g-actions" data-g="tossCall"><button type="button" class="g-btn g-btn-primary" data-act="callHeads">Heads</button><button type="button" class="g-btn g-btn-primary" data-act="callTails">Tails</button></div>
        <div class="g-actions" data-g="tossDecide" hidden><button type="button" class="g-btn g-btn-primary" data-act="batFirst">Bat first</button><button type="button" class="g-btn g-btn-primary" data-act="bowlFirst">Bowl first</button></div>
        <div class="g-actions" data-g="tossGo" hidden><button type="button" class="g-btn g-btn-primary" data-act="tossStart">Start match</button></div>
      </div>
      <div class="g-panel g-intro" data-g="intro"${quick ? " hidden" : ""}>
        <p class="g-kicker">Practice Nets · Practice match</p>
        <h2>${teamCode} v ${cpuCode}</h2>
        <p class="g-sub">${level} · ${OVERS} overs a side · ${WICKETS} wickets</p>
        <ul class="g-howto" data-g="howto"></ul>
        <div class="g-actions">${quick ? "" : `<button type="button" class="g-btn g-btn-primary" data-act="batFirst">Bat first</button><button type="button" class="g-btn g-btn-primary" data-act="bowlFirst">Bowl first</button>`}<button type="button" class="g-btn" data-act="quit">Back to nets</button></div>
      </div>
      <div class="g-panel g-pause" data-g="pause" hidden role="dialog" aria-modal="true" aria-label="Paused">
        <p class="g-kicker">Paused</p>
        <h2>${title}</h2>
        <div class="g-actions g-actions-stack"><button type="button" class="g-btn g-btn-primary" data-act="resume">Resume</button><button type="button" class="g-btn" data-act="restart">Restart match</button><button type="button" class="g-btn" data-act="quit">${quitLabel}</button></div>
      </div>
      <div class="g-panel m-break" data-g="break" hidden role="dialog" aria-modal="true" aria-label="Innings break"></div>
      <div class="g-panel g-summary m-result" data-g="result" hidden role="dialog" aria-modal="true" aria-label="Match result"></div>
    </div>`);
  host.append(ui);
  const $ = (name) => ui.querySelector(`[data-g="${name}"]`);
  const canvas = ui.querySelector(".g-canvas");

  /* ---------- Renderer and scene ---------- */
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
  const labels = quick ? { title: `${teams[0].short} v ${teams[1].short}`, board: [["WORLD CRICKET CHAMPS", 70, "#ffffff", 0.22], [`${teams[0].name.toUpperCase()} v ${teams[1].name.toUpperCase()}`, 96, "#f2c230", 0.52], [`${OVERS} OVERS A SIDE`, 46, "#ffffff", 0.93]] } : {};
  const { scene, strikerStumps, bowlerStumps, update: updateWorld, cheer: crowdCheer } = buildWorld(renderer, quality, labels);
  const ball = buildBall(scene);
  const stumpsAt = { A: strikerStumps, B: bowlerStumps };

  /* bowling target: a ring on the pitch */
  const target = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: "#ffe14d", transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), ringMat);
  dot.rotation.x = -Math.PI / 2;
  /* a faint line across the pitch at the same length helps judge it */
  const lengthLine = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 0.05), new THREE.MeshBasicMaterial({ color: "#ffe14d", transparent: true, opacity: 0.45, depthWrite: false }));
  lengthLine.rotation.x = -Math.PI / 2;
  target.add(ring, dot, lengthLine);
  target.position.y = 0.02;
  target.visible = false;
  scene.add(target);

  /* ---------- Players ---------- */
  const rigLod = coarse || small ? 1 : 0;
  const farLod = coarse || small ? 2 : 1;
  let batters = [], bowlerW = null, umpire = null;
  const fielders = [];                  /* entities: { id, name, role, player, base, pos, yaw, ... } */
  const loading = (async () => {
    const rig = await loadRig(["batting", "bowling", "fielding", "umpire"]);
    const kitOf = (team, i) => rigKit(team.kit, SKINS[i % SKINS.length]);
    [batters, bowlerW] = await Promise.all([
      Promise.all([0, 1].map((i) => createSquadBatter({ kit: teams[0].kit, skin: SKINS[i], lod: rigLod, home: BATTER_SPOT }))),
      createSquadBowler({ kit: teams[1].kit, skin: SKINS[3], lod: rigLod })
    ]);
    const field = fieldPositions(false);
    const made = await Promise.all(field.map((f, i) => f.role === "bowler" ? bowlerW.player
      : rig.createPlayer(f.role === "keeper" ? "keeper" : "fielder", { kit: kitOf(teams[1], i + 2), lod: f.role === "keeper" ? rigLod : farLod })));
    for (let i = 0; i < field.length; i++) {
      const f = field[i];
      const player = made[i];
      const e = { id: f.id, name: f.name, role: f.role, player, base: { x: f.x, z: f.z }, pos: new THREE.Vector3(f.x, 0, f.z), yaw: 0, clip: null, action: null, move: null, timed: null, face: null };
      fielders.push(e);
      if (f.role !== "bowler") scene.add(player.root);
    }
    umpire = await rig.createPlayer("umpire", { kit: { ...rigKit({ shirt: "#f4f2ea", trousers: "#2b2f36", helmet: "#f2efe6", trim: "#f4f2ea" }, SKINS[5]), hat: "#f2efe6", sleeve: "#f4f2ea" }, lod: rigLod });
    umpire.root.position.set(0.8, 0, PITCH.length + 2.0);
    umpire.root.rotation.y = Math.PI;
    umpire.play("umpire_idle", { fade: 0 });
    scene.add(umpire.root, bowlerW.root, ...batters.map((b) => b.root));
    placeField(false);
    batters[1].setManual(true);
    batters[1].player.play("bat_idle", { fade: 0 });
    batters[1].root.position.set(ENDS.B.ground.x, 0, ENDS.B.ground.z);
    batters[1].root.rotation.y = Math.PI;
  })();
  const playersReady = Promise.race([loading, new Promise((r) => setTimeout(r, 15000))]);
  loading.catch((error) => console.error("Practice match players failed to load", error));

  function setTeamKits() {
    const batTeam = teams[match.current.bat], fieldTeam = teams[match.current.bowl];
    batters.forEach((b, i) => b.player.setKit(rigKit(batTeam.kit, SKINS[i])));
    fielders.forEach((e, i) => e.player.setKit(rigKit(fieldTeam.kit, SKINS[(i + 2) % SKINS.length])));
  }

  /* ---------- Camera ---------- */
  const camera = new THREE.PerspectiveCamera(6.2, 16 / 9, 0.5, 1600);
  const BROADCAST = { pos: new THREE.Vector3(0.35, 9, 60), look: new THREE.Vector3(0.12, 0.43, 4) };
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
  const input = { keys: new Set(), touchAim: null, padAim: { x: 0, y: 0 }, device: coarse ? "touch" : "keyboard" };
  const AIM_KEYS = { w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
  const clock = { game: 0, frameReal: performance.now() };
  const pressTimeNow = () => clock.game + (performance.now() - clock.frameReal) / 1000;
  const userBatting = () => match && match.current && match.current.bat === USER;

  function setDevice(kind) {
    if (input.device === kind) return;
    input.device = kind;
    ui.dataset.device = kind;
    renderHints();
  }
  ui.dataset.device = input.device;
  function panelOpen() { return ["intro", "toss", "pause", "break", "result"].map($).find((p) => p && !p.hidden) || null; }
  function moveFocus(panel, step) {
    const buttons = [...panel.querySelectorAll("button")];
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
      if (["ArrowDown", "ArrowRight"].includes(event.key)) { event.preventDefault(); moveFocus(panel, 1); }
      else if (["ArrowUp", "ArrowLeft"].includes(event.key)) { event.preventDefault(); moveFocus(panel, -1); }
      else if (event.key === "Escape" && panel === $("pause")) { event.preventDefault(); resume(); }
      return;
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
    if (event.key === "Escape" || key === "p") { event.preventDefault(); pause(); return; }
    if (AIM_KEYS[key]) { event.preventDefault(); input.keys.add(key); return; }
    if (event.repeat) return;
    if (userBatting()) {
      if (key === " " || key === "j") { event.preventDefault(); playShot("ground", pressTimeNow()); }
      else if (key === "k") playShot("loft", pressTimeNow());
      else if (key === "l") playShot("defend", pressTimeNow());
      else if (key === "r") callRun();
      else if (key === "t") sendBack();
    } else {
      if (key === " ") { event.preventDefault(); bowlPress(); }
      else if (key === "q") cycleVariation(-1);
      else if (key === "e") cycleVariation(1);
      else if (key === "c") switchKind();
    }
  }
  function onKeyUp(event) {
    if (host.hidden) return;
    event.stopImmediatePropagation();
    input.keys.delete(event.key.toLowerCase());
  }
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);

  /* touch */
  const aimpad = $("aimpad");
  const knob = aimpad.querySelector(".g-aim-knob");
  aimpad.addEventListener("pointerdown", (event) => {
    setDevice(event.pointerType === "mouse" ? "keyboard" : "touch");
    aimpad.setPointerCapture(event.pointerId);
    const r = aimpad.getBoundingClientRect();
    input.touchAim = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2, id: event.pointerId, x: 0, y: 0 };
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
  ui.querySelector(".g-touch").addEventListener("pointerdown", (event) => {
    const b = event.target.closest("button");
    if (!b) return;
    event.preventDefault();
    setDevice(event.pointerType === "mouse" ? "keyboard" : "touch");
    if (b.dataset.shot) playShot(b.dataset.shot, pressTimeNow());
    else if (b.dataset.run === "run") callRun();
    else if (b.dataset.run === "back") sendBack();
    else if (b.dataset.bowl === "go") bowlPress();
    else if (b.dataset.bowl === "type") cycleVariation(1);
    else if (b.dataset.bowl === "kind") switchKind();
  });
  $("pauseBtn").addEventListener("click", () => pause());
  ui.addEventListener("click", (event) => {
    const act = event.target.closest("[data-act]");
    if (!act) return;
    audio.unlock();
    ({ batFirst: () => begin(USER), bowlFirst: () => begin(CPU), resume, restart, quit, again: restart, next: startSecondInnings,
      skipIntro: () => commentary && commentary.skip(), callHeads: () => runToss("Heads"), callTails: () => runToss("Tails"),
      tossStart: () => begin(tossFirst) })[act.dataset.act]?.();
  });

  /* gamepad */
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
    if ([0, 1, 2, 3, 4, 5, 9].some((i) => button(i)) || len > 0.5) setDevice(/054c|playstation|dualsense|dualshock|wireless controller/i.test(pad.id) ? "ps" : "xbox");
    const panel = panelOpen();
    if (panel) {
      if (edge(13) || edge(15)) moveFocus(panel, 1);
      if (edge(12) || edge(14)) moveFocus(panel, -1);
      if (edge(0) && panel.contains(document.activeElement)) document.activeElement.click();
      if ((edge(9) || edge(1)) && panel === $("pause")) resume();
      [2, 3, 4, 5].forEach(edge);
      return;
    }
    if (edge(9)) { pause(); return; }
    const t = pressTimeNow();
    if (userBatting()) {
      if (edge(0)) playShot("ground", t);
      if (edge(3)) playShot("loft", t);
      if (edge(2)) playShot("defend", t);
      if (edge(5)) callRun();
      if (edge(4)) sendBack();
      edge(1);
    } else {
      if (edge(0)) bowlPress();
      if (edge(5)) cycleVariation(1);
      if (edge(4)) cycleVariation(-1);
      if (edge(3)) switchKind();
      edge(1); edge(2);
    }
    [12, 13, 14, 15].forEach(edge);
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
    bat: {
      keyboard: [["W A S D", "Aim"], ["Space", "Ground"], ["K", "Loft"], ["L", "Defend"], ["R", "Run"], ["T", "Back"], ["Esc", "Pause"]],
      xbox: [["Left stick", "Aim"], ["A", "Ground"], ["Y", "Loft"], ["X", "Defend"], ["RB", "Run"], ["LB", "Back"], ["Menu", "Pause"]],
      ps: [["Left stick", "Aim"], ["✕", "Ground"], ["△", "Loft"], ["□", "Defend"], ["R1", "Run"], ["L1", "Back"], ["Options", "Pause"]],
      touch: []
    },
    bowl: {
      keyboard: [["W A S D", "Move target"], ["Q / E", "Delivery"], ["C", "Pace / spin"], ["Space", "Bowl, then release"], ["Esc", "Pause"]],
      xbox: [["Left stick", "Move target"], ["LB / RB", "Delivery"], ["Y", "Pace / spin"], ["A", "Bowl, then release"], ["Menu", "Pause"]],
      ps: [["Left stick", "Move target"], ["L1 / R1", "Delivery"], ["△", "Pace / spin"], ["✕", "Bowl, then release"], ["Options", "Pause"]],
      touch: []
    }
  };
  function renderHints() {
    const role = match && match.current ? (userBatting() ? "bat" : "bowl") : "bat";
    const list = HINTS[role][input.device] || HINTS[role].keyboard;
    $("hints").innerHTML = list.map(([key, label]) => `<span><kbd>${key}</kbd>${label}</span>`).join("");
    $("batButtons").hidden = role !== "bat";
    $("bowlButtons").hidden = role !== "bowl";
    const kb = input.device === "keyboard", tp = input.device === "touch";
    $("howto").innerHTML = [
      `<li><b>Batting:</b> aim with ${tp ? "the left pad" : kb ? "W A S D" : "the left stick"} and time your shot as in the nets. Lofted shots can be caught.</li>`,
      `<li><b>Running:</b> press ${tp ? "Run" : kb ? "R" : "RB / R1"} to call a run, again while running to go for another, and ${tp ? "Back" : kb ? "T" : "LB / L1"} early in a run to send your partner back. Short of the crease when the ball hits the stumps is out.</li>`,
      `<li><b>Bowling:</b> move the yellow target to where the ball should pitch, pick pace or spin and a delivery, press ${tp ? "Bowl" : kb ? "Space" : "A / ✕"} to run in, then press again with the marker in the green to release. Way off is a wide or a no-ball.</li>`
    ].join("");
  }
  renderHints();

  /* ---------- Match state ---------- */
  const rng = makeRng((Date.now() ^ 0x2545f491) >>> 0);
  let phase = "intro";       /* intro | setup | runup | live | field | dead | break | result */
  let paused = false;
  let destroyed = false;
  let ballCtx = null;
  let timeouts = [];
  const bowlPlan = { kind: "pace", variation: 0, x: -0.08, z: 4.6 };
  const modelOf = new Map();     /* batter index -> squad batter wrapper */
  function later(seconds, fn) { timeouts.push({ at: clock.game + seconds, fn }); }

  /* ---------- Quick Match: stadium intro and toss ---------- */
  let tossFirst = USER, cineStart = 0;
  const usedSpecials = new Set();
  let ballsBowled = 0, lastSpecialAt = -99;

  function startIntro() {
    phase = "cinematic";
    cam.mode = "cine"; cam.snap = true;
    cineStart = clock.game;
    $("cine").hidden = false;
    audio.unlock();
    audio.startAmbience();
    const shown = Date.now();
    commentary.intro().then((played) => {
      if (destroyed) return;
      /* show the ground for a few seconds even if the clip could not play */
      const wait = played ? 0 : Math.max(0, 4000 - (Date.now() - shown));
      setTimeout(() => { if (!destroyed) showToss(); }, wait);
    });
  }
  function showToss() {
    if (phase !== "cinematic") return;
    phase = "toss";
    $("cine").hidden = true;
    $("toss").hidden = false;
    playersReady.finally(() => {
      if (destroyed) return;
      $("tossCall").querySelectorAll("button").forEach((b) => { b.disabled = false; });
      if (!$("tossCall").hidden) $("tossCall").querySelector("button").focus();
    });
  }
  function runToss(call) {
    const result = rng() < 0.5 ? "Heads" : "Tails";
    const coin = $("coin");
    $("tossCall").hidden = true;
    $("tossStatus").textContent = `${teams[USER].captain} calls ${call.toLowerCase()}…`;
    coin.className = "qm-coin";
    void coin.offsetWidth;
    coin.classList.add("is-flipping", result === "Heads" ? "lands-heads" : "lands-tails");
    setTimeout(() => {
      if (destroyed) return;
      if (result === call) {
        $("tossStatus").textContent = `It's ${result.toLowerCase()}. ${teams[USER].name} won the toss. Bat or bowl?`;
        $("tossDecide").hidden = false;
        $("tossDecide").querySelector("button").focus();
      } else {
        const bat = rng() < 0.55;
        tossFirst = bat ? CPU : USER;
        $("tossStatus").textContent = `It's ${result.toLowerCase()}. ${teams[CPU].name} won the toss and chose to ${bat ? "bat" : "bowl"} first.`;
        $("tossGo").hidden = false;
        $("tossGo").querySelector("button").focus();
      }
    }, settings.reduceMotion ? 200 : 1250);
  }

  /* now and then the commentators drift into a longer story about a player on
     the field; nothing interrupts it, ball calls wait until it is over */
  function maybeSpecial() {
    if (!commentary || commentary.busy || !match.current) return;
    if (ballsBowled - lastSpecialAt < 5 || ballsBowled < 3 || rng() > 0.22) return;
    const inn = match.current;
    const bat = teams[inn.bat].code, bowl = teams[inn.bowl].code;
    const options = Object.entries(SPECIALS).filter(([name, sp]) => !usedSpecials.has(name) && (sp.role === "bat" ? sp.team === bat : sp.team === bowl));
    if (!options.length) return;
    const [name] = options[Math.floor(rng() * options.length)];
    if (commentary.special(name)) { usedSpecials.add(name); lastSpecialAt = ballsBowled; }
  }
  /* Live commentary: called at the moment something happens (bat on ball, the
     stumps going, a run being called, the throw hitting). A later line for the
     same ball cuts off an earlier one, so a "1" becomes "runout" if it goes wrong. */
  function sayNow(c, line) {
    if (!commentary || !line || ballCtx !== c || c.said === line) return;
    c.said = line;
    commentary.say(line);
  }
  function commentaryFor(event, c) {
    if (event.wicket) return { bowled: "bowled", caught: "catch", "run out": "runout" }[event.wicket.how];
    if (event.extra === "wide") return null;
    if (event.boundary) return String(event.boundary);
    if (event.runs >= 1 && event.runs <= 3) return String(event.runs);
    if (event.runs > 3) return null;
    const kind = c.result && c.result.kind;
    return kind === "leave" || kind === "beaten" ? "miss-and-leave" : "0";
  }

  function begin(first) {
    match = createMatch({ overs: OVERS, wickets: WICKETS, teams, first });
    $("intro").hidden = true;
    $("toss").hidden = true;
    $("players").hidden = false;
    $("cine").hidden = true;
    ui.dataset.stage = "play";
    audio.unlock();
    audio.startAmbience();
    startInnings();
  }
  function startInnings() {
    const inn = match.current;
    modelOf.clear();
    modelOf.set(inn.striker, batters[0]);
    modelOf.set(inn.nonStriker, batters[1]);
    setTeamKits();
    bowlerW.player.setKit(rigKit(teams[inn.bowl].kit, SKINS[3]));
    renderHints();
    updateScore();
    toSetup();
  }
  function startSecondInnings() {
    $("break").hidden = true;
    startInnings();
  }

  function toSetup() {
    phase = "setup";
    const innNow = match.current;
    if (quick && innNow.bowl === USER && bowlPlan.over !== `${match.innings.length}:${innNow.overs.length}`) {
      /* each over is bowled by the next bowler in the list, pace or spin */
      bowlPlan.over = `${match.innings.length}:${innNow.overs.length}`;
      bowlPlan.kind = innNow.bowler.kind;
      bowlPlan.variation = 0;
      if (bowlPlan.kind === "spin") bowlPlan.z = Math.min(bowlPlan.z, 4.2);
    }
    hideCallout();
    cam.mode = "broadcast"; cam.snap = true;
    resetStumps();
    ball.marker.visible = false;
    placeField(bowlKind() === "spin");
    placeBatters();
    ballCtx = null;
    const inn = match.current;
    $("freehit").hidden = !inn.freeHit;
    maybeSpecial();
    if (userBatting()) {
      target.visible = false;
      $("bowl").hidden = true;
      later(1.0, () => { if (phase === "setup") startRunup(); });
    } else {
      target.visible = true;
      $("meter").hidden = true;
      showBowlPanel();
    }
  }
  function bowlKind() {
    if (userBatting()) return quick ? match.current.bowler.kind : match.current.overs.length >= 2 ? "spin" : "pace";
    return bowlPlan.kind;
  }

  /* ---------- positions between balls ---------- */
  function placeField(spin) {
    const spots = fieldPositions(spin);
    fielders.forEach((e, i) => {
      const s = spots[i];
      e.base = { x: s.x, z: s.z };
      e.pos.set(s.x, 0, s.z);
      e.move = null; e.timed = null; e.face = null; e.override = false;
      e.yaw = Math.atan2(BATTER_SPOT.x - s.x, BATTER_SPOT.z - s.z);
    });
  }
  function placeBatters() {
    const inn = match.current;
    const striker = modelOf.get(inn.striker), other = modelOf.get(inn.nonStriker);
    striker.setManual(false);
    other.setManual(true);
    other.player.play("bat_idle", { fade: 0 });
    other.root.position.set(ENDS.B.ground.x, 0, ENDS.B.ground.z);
    other.root.rotation.y = Math.PI;
  }

  /* ---------- bowling (the user) ---------- */
  const variations = () => VARIATIONS[bowlPlan.kind];
  function speedFor(kind, variation) {
    if (kind === "spin") return 84;
    return variation === "slower" ? 111 : 134;
  }
  function showBowlPanel() {
    const v = variations()[bowlPlan.variation % variations().length];
    $("bowl").hidden = false;
    $("bowlType").textContent = `${quick ? shortName(match.current.bowler.name) + " · " : ""}${bowlPlan.kind === "spin" ? "Spin" : "Pace"} · ${v.label}`;
    $("bowlSpeed").textContent = `${speedFor(bowlPlan.kind, v.id)} km/h`;
    $("bowlTip").textContent = phase === "runup" ? "Release in the green" : "Aim the target, then bowl";
  }
  function cycleVariation(step) {
    if (userBatting() || phase !== "setup") return;
    const n = variations().length;
    bowlPlan.variation = (bowlPlan.variation + step + n) % n;
    showBowlPanel();
  }
  function switchKind() {
    if (userBatting() || phase !== "setup") return;
    bowlPlan.kind = bowlPlan.kind === "pace" ? "spin" : "pace";
    bowlPlan.variation = 0;
    if (bowlPlan.kind === "spin") bowlPlan.z = Math.min(bowlPlan.z, 4.2);
    placeField(bowlPlan.kind === "spin");
    showBowlPanel();
  }
  function bowlPress() {
    if (userBatting()) return;
    if (phase === "setup") { startRunup(); return; }
    if (phase === "runup" && ballCtx && !ballCtx.delivery) lockRelease(meterValue(clock.game));
  }
  function meterValue(now) {
    const c = ballCtx;
    const period = 0.9;
    const k = ((now - c.runStart) / period) % 1;
    return k < 0.5 ? -1 + 4 * k : 3 - 4 * k;      /* -1 .. 1 .. -1, 0 is perfect */
  }
  function lockRelease(m) {
    const c = ballCtx;
    c.meter = m;
    const v = variations()[bowlPlan.variation % variations().length];
    const err = Math.abs(m);
    const spread = err < 0.2 ? 0.05 : err < 0.55 ? 0.35 : 0.9;
    const ang = rng() * Math.PI * 2;
    const tz = THREE.MathUtils.clamp(bowlPlan.z + Math.sin(ang) * spread * (bowlPlan.kind === "spin" ? 0.9 : 1.6), 0.2, 11);
    const tx = THREE.MathUtils.clamp(bowlPlan.x + Math.cos(ang) * spread * 0.32, -1.3, 1.0);
    const speed = speedFor(bowlPlan.kind, v.id) + (err < 0.2 ? 3 : 0) + Math.round(rng.range(-3, 3));
    let d = planCustomDelivery({ spin: bowlPlan.kind === "spin", variation: v.id, speedKmh: speed, targetX: tx, targetZ: tz, levelName: level, rng });
    d = releaseFrom(d, c.hand);
    c.delivery = d;
    c.plan = contactPlan(d);
    c.noBall = m > 0.88;
    $("meter").querySelector("em").style.left = `${50 + m * 50}%`;
    $("meter").dataset.locked = "1";
  }

  /* ---------- a delivery ---------- */
  function startRunup() {
    const spin = bowlKind() === "spin";
    bowlerW.prepare({ spin });
    bowlerW.update(0);
    bowlerW.root.updateMatrixWorld(true);
    const hand = new THREE.Vector3();
    bowlerW.ballHold.getWorldPosition(hand);
    const runTime = spin ? 1.4 : 2.3;
    const now = clock.game;
    const inn = match.current;
    ballCtx = {
      spin, hand: { x: hand.x, y: Math.max(1.5, hand.y + 0.08), z: hand.z }, runStart: now, releaseAt: now + runTime,
      bowl: { releaseAt: now + runTime, runTime, spin },
      bat: { phase: "stance", t0: now }, press: null, result: null, resolved: false, delivery: null, plan: null,
      strikerIdx: inn.striker, nonStrikerIdx: inn.nonStriker, modelA: modelOf.get(inn.striker), modelB: modelOf.get(inn.nonStriker),
      freeHit: inn.freeHit, runner: { p: 0, target: 0 }, outcome: null
    };
    if (userBatting()) {
      let d = planDelivery(spin ? "spin" : "pace", level, rng, "auto");
      d = releaseFrom(d, ballCtx.hand);
      ballCtx.delivery = d;
      ballCtx.plan = contactPlan(d);
    } else {
      target.visible = true;
      $("meter").hidden = false;
      $("meter").dataset.locked = "";
      showBowlPanel();
      $("bowlTip").textContent = "Release in the green";
    }
    ball.resetTrail();
    phase = "runup";
  }

  /* the user plays a shot */
  function playShot(shot, at) {
    const c = ballCtx;
    if (!userBatting() || !c || !c.delivery || (phase !== "runup" && phase !== "live") || c.press) return;
    const tau = at - c.releaseAt;
    if (tau < -0.15) return;
    const aim = currentAim();
    c.press = { shot, tau, aim };
    c.result = resolveShot(c.delivery, { pressTime: tau, shot, aim }, level, rng, { field: true });
    c.resolved = true;
    swingFor(c, shot, at);
  }
  function swingFor(c, shot, at) {
    const r = c.result;
    const contactAt = r.grade === "miss" || r.kind === "beaten" || r.kind === "bowled" ? at + SWING_LEAD[shot] : c.releaseAt + c.plan.t;
    const angle = r.angle != null ? Math.max(-1.3, Math.min(1.3, r.angle)) : 0;
    c.bat = { phase: "swing", t0: at, contactAt, front: c.plan.front, aim: angle, shot, stroke: strokeFor(shot, c.plan.front, angle, c.plan.at.y) };
  }

  /* the CPU batter decides at release */
  function gauss() { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function cpuBat(c) {
    const d = c.delivery, plan = c.plan, at = plan.at;
    const inn = match.current;
    const short = d.bounce && d.bounce.z > (d.spin ? 4.6 : 6.6);
    const ballsLeft = OVERS * 6 - inn.legal;
    const need = inn.target != null ? inn.target - inn.runs : null;
    const chasing = need != null ? need / Math.max(1, ballsLeft) : 1.2;
    if (at.x < -0.42 && !d.stumps && rng() < 0.6) { c.result = resolveShot(d, { pressTime: null }, level, rng, { field: true }); c.resolved = true; c.bat = { phase: "leave", t0: c.releaseAt + plan.t }; c.cpuLeave = true; return; }
    let shot = "ground";
    /* play with the line of the ball, into the widest gap on that side */
    const field = fielders.map((e) => ({ x: e.pos.x, z: e.pos.z, role: e.role }));
    let a;
    if (short && at.y > 0.85) a = bestGap(field, 0.9, 1.7);
    else if (at.x < -0.2) a = bestGap(field, -1.7, -0.3);
    else if (at.x > 0.12) a = bestGap(field, 0.3, 1.5);
    else a = bestGap(field, -0.6, 0.6);
    const aim = { x: Math.sin(a), y: Math.cos(a) };
    const good = Math.abs(at.x) < 0.16 && d.bounce && d.bounce.z > 3.5 && d.bounce.z < 6.6 && !d.spin;
    if (good && chasing < 1.3 && rng() < 0.35) shot = "defend";
    else if (rng() < 0.12 + Math.max(0, chasing - 1.2) * 0.25) shot = "loft";
    let hard = 1;
    if (d.bounce && d.bounce.z < 1.2) hard = 1.55;                        /* yorker */
    else if (good) hard = 1.25;
    else if (!d.bounce || (d.bounce.z > 1.4 && d.bounce.z < 2.6) || (short && at.x < -0.3)) hard = 0.75;
    if (d.style === "Slower ball") hard *= 1.3;
    if (c.meter != null && Math.abs(c.meter) < 0.2) hard *= 1.1;
    const error = gauss() * AI_SIGMA[level] * hard;
    const pressTime = plan.t - SWING_LEAD[shot] + error;
    c.result = resolveShot(d, { pressTime, shot, aim }, level, rng, { field: true });
    c.resolved = true;
    later(Math.max(0, c.releaseAt + pressTime - clock.game), () => { if (ballCtx === c) swingFor(c, shot, c.releaseAt + pressTime); });
  }

  /* ---------- running ---------- */
  function callRun() {
    const c = ballCtx;
    if (!userBatting() || !c || phase !== "field" || c.ballBack || c.outcome) return;
    if (!c.fielding || c.fielding.kind !== "fielded") return;
    const r = c.runner;
    if (r.p > r.target) r.target = Math.ceil(r.p - 1e-6);                 /* turning back: go again */
    else if (r.p === r.target) r.target = Math.min(4, r.target + 1);      /* home: set off */
    else if (r.target === Math.ceil(r.p - 1e-6)) r.target = Math.min(4, r.target + 1);   /* running: commit to the next */
    if (r.target >= 1 && r.target <= 3) sayNow(c, String(r.target));
    showRunPrompt();
  }
  function sendBack() {
    const c = ballCtx;
    if (!userBatting() || !c || phase !== "field" || c.outcome) return;
    const r = c.runner;
    const k = Math.floor(r.p);
    if (r.p > k && r.p - k < 0.55) r.target = k;
    else if (r.target > Math.ceil(r.p)) r.target = Math.ceil(r.p);
    showRunPrompt();
  }
  function showRunPrompt() {
    const c = ballCtx;
    const box = $("run");
    if (!c || phase !== "field" || !c.fielding || c.fielding.kind !== "fielded" || c.outcome) { box.hidden = true; return; }
    const r = c.runner;
    const done = Math.floor(r.p + 1e-6);
    let text;
    if (!userBatting()) text = r.target ? `Running ${r.target}` : "No run";
    else if (c.ballBack) text = done ? `${done} run${done > 1 ? "s" : ""} · ball's back` : "Ball's back";
    else if (r.target === 0) text = input.device === "touch" ? "Tap Run to run" : `Press ${input.device === "keyboard" ? "R" : input.device === "ps" ? "R1" : "RB"} to run`;
    else if (r.target > r.p) text = `Running ${r.target}${r.target - done > 1 ? "" : ""}`;
    else text = `${done} run${done > 1 ? "s" : ""} · run again?`;
    box.textContent = text;
    box.dataset.danger = c.throwInfo && !c.throwInfo.done ? "1" : "";
    box.hidden = false;
  }

  /* ---------- per frame: the delivery and what follows ---------- */
  function updateLogic(now) {
    for (const item of timeouts.filter((t) => t.at <= now)) { timeouts = timeouts.filter((t) => t !== item); item.fn(); }
    const c = ballCtx;
    if (!c) return;
    const tau = now - c.releaseAt;

    if (phase === "runup") {
      if (!userBatting()) {
        if (!c.delivery) {
          $("meter").querySelector("em").style.left = `${50 + meterValue(now) * 50}%`;
          if (tau > -0.22) lockRelease((rng() < 0.5 ? -1 : 1) * rng.range(0.5, 1));
        }
      } else if (tau > -0.36 && c.bat.phase === "stance") c.bat = { phase: "backlift", t0: now };
      if (tau >= 0 && c.delivery) {
        phase = "live";
        $("delivery").innerHTML = `<b>${c.delivery.speedKmh} km/h</b><span>${c.delivery.style} · ${c.delivery.length}</span>`;
        $("delivery").hidden = false;
        if (!userBatting()) { cpuBat(c); target.visible = false; $("meter").hidden = true; $("bowl").hidden = true; }
        if (!userBatting() && c.bat.phase === "stance") c.bat = { phase: "backlift", t0: now };
        if (c.noBall) { umpireSignal("umpire_noball"); }
      }
    }
    if (phase === "live") {
      const [, , ok] = levelCfg.windows;
      if (userBatting() && !c.press && tau > c.plan.t + ok + 0.05 && !c.resolved) {
        c.result = resolveShot(c.delivery, { pressTime: null }, level, rng, { field: true });
        c.resolved = true;
        c.bat = { phase: "leave", t0: now };
      }
      if (!c.resolved) return;
      const r = c.result;
      const hit = r.flight && (r.kind === "hit" || r.kind === "edge" || r.kind === "caught");
      if (hit && tau >= c.plan.t) { startField(c, now); return; }
      if (!hit) {
        if (r.kind === "bowled" && c.delivery.stumps && tau >= c.delivery.stumps.t && !c.stumpsBroken) {
          c.stumpsBroken = true;
          audio.stumps();
          breakStumps("A", c.delivery.stumps.x);
          const out = !c.freeHit && !c.noBall;
          if (out) sayNow(c, "bowled");
          finish(c, { runs: 0, wicket: out ? { how: "bowled", index: c.strikerIdx } : null, extra: c.noBall ? "noball" : null },
            out ? "Bowled" : c.noBall ? "No ball" : "Not out", out ? "Through the gate" : "Free hit: bowled, but not out", out, 0.2);
          return;
        }
        if (!c.said && tau >= c.plan.t + 0.05 && r.kind !== "bowled" && !c.noBall && !(!userBatting() && isWide(c))) sayNow(c, "miss-and-leave");
        const take = keeperTakeTime(c);
        if (tau >= take + 0.35 && !c.outcome) {
          const cr = c.delivery.crossed;
          const wide = !userBatting() && isWide(c);
          if (c.noBall) finish(c, { runs: 0, extra: "noball" }, "No ball", "Overstepped · free hit next", false, 0);
          else if (wide) { umpireSignal("umpire_wide"); finish(c, { runs: 0, extra: "wide" }, "Wide", cr && cr.y > WIDE_HIGH ? "Over head height" : "Too far from the stumps", false, 0); }
          else finish(c, { runs: 0 }, r.kind === "leave" ? "Left" : "Beaten", r.kind === "leave" ? "Good leave" : r.detail || "Past the edge", false, 0);
        }
      }
    }
    if (phase === "field") updateField(c, now);
    /* safety net: no ball stays live forever */
    if ((phase === "live" || phase === "field") && tau > 14 && !c.outcome) {
      finish(c, { runs: Math.floor(c.runner.p + 1e-6) }, "Dead ball", "", false, 0);
    }
  }

  function isWide(c) {
    const cr = c.delivery.crossed;
    if (!cr || c.delivery.stumps) return false;
    return cr.x < WIDE_OFF || cr.x > WIDE_LEG || cr.y > WIDE_HIGH;
  }
  function keeperTakeTime(c) {
    const k = fielders[0];
    const s = c.delivery.samples;
    const last = s[s.length - 1], prev = s[s.length - 2];
    const kz = k.pos.z + 0.45;
    if (last.z <= kz) return timeAtZ(s, kz);
    const vz = (last.z - prev.z) / (last.t - prev.t || 1);
    return last.t + (kz - last.z) / (vz || -20);
  }

  function startField(c, now) {
    phase = "field";
    c.contactAbs = c.releaseAt + c.plan.t;
    const r = c.result;
    audio[r.kind === "hit" ? "bat" : "edge"](r.quality || 0.5);
    const field = fielders.map((e) => ({ x: e.pos.x, z: e.pos.z, role: e.role }));
    const skill = userBatting() ? CPU_SKILL[level] : 0.6;
    c.field = field;
    c.fielding = playOut(r.flight, field, rng, skill);
    const F = c.fielding;
    if (r.flight.distance > 9 || F.kind !== "fielded" || F.t > 1.2) later(0.2, () => { if (ballCtx === c) { cam.mode = "follow"; cam.snap = true; } });
    planFielders(c, now);
    if (!userBatting() && F.kind === "fielded") {
      const inn = match.current;
      const need = inn.target != null ? inn.target - inn.runs : 99;
      const left = OVERS * 6 - inn.legal;
      const risk = rng.range(-0.35, 0.15) + (need / Math.max(1, left) > 1.6 ? 0.35 : 0);
      c.runner.target = Math.min(need > 0 ? 4 : 0, chooseRuns(F, field, risk));
    }
    if (commentary) {
      const notOut = c.freeHit || c.noBall;
      if (F.kind === "boundary") later(0.25, () => sayNow(c, F.six ? "6" : "4"));
      else if (F.kind === "caught") later(Math.min(0.6, F.t * 0.5), () => sayNow(c, notOut ? "0" : "catch"));
      else if (!userBatting()) later(0.3, () => sayNow(c, c.runner.target ? (c.runner.target <= 3 ? String(c.runner.target) : null) : "0"));
      /* your own batting: the call comes when you call the run, or a dot
         ball when the fielder gathers it and nobody has moved */
      else later(Math.max(0.4, F.collect), () => { if (!c.runner.target && !c.outcome) sayNow(c, "0"); });
    }
    showRunPrompt();
  }

  function planFielders(c, now) {
    const F = c.fielding, t0 = c.contactAbs;
    fielders.forEach((e) => { e.override = e.role === "bowler" ? false : e.override; });
    const keeper = fielders[0], bowlerE = fielders[fielders.length - 1];
    if (F.kind === "caught") {
      const e = fielders[F.fielder];
      e.override = true;
      e.move = { from: e.pos.clone(), to: new THREE.Vector3(F.at.x, 0, F.at.z), t0: t0 + 0.28, t1: t0 + Math.max(0.3, F.t - 0.1) };
      e.timed = { name: F.dive ? "dive_left" : e.role === "keeper" ? "keeper_take" : "catch_high", at: t0 + F.t - (F.dive ? 0.6 : e.role === "keeper" ? 0.4 : 0.467) };
      e.face = () => ({ x: F.at.x, z: F.at.z - 5 });
      return;
    }
    if (F.kind === "boundary") {
      /* the nearest fielders chase it to the rope */
      const end = c.result.flight.overRope;
      const near = fielders.map((e, i) => ({ e, d: Math.hypot(e.pos.x - end.x, e.pos.z - end.z), i })).filter((o) => o.e.role === "fielder").sort((a, b) => a.d - b.d)[0];
      if (near) {
        const e = near.e;
        const dir = new THREE.Vector3(end.x - e.pos.x, 0, end.z - e.pos.z);
        const run = Math.min(dir.length(), 6.4 * F.t);
        e.move = { from: e.pos.clone(), to: e.pos.clone().add(dir.normalize().multiplyScalar(run)), t0: t0 + 0.28, t1: t0 + 0.28 + run / 6.4 };
      }
      return;
    }
    /* fielded: the chaser runs to the ball, picks up and throws */
    const e = fielders[F.fielder];
    e.override = true;
    e.move = { from: e.pos.clone(), to: new THREE.Vector3(F.at.x, 0, F.at.z), t0: t0 + 0.28, t1: t0 + Math.max(0.3, F.arrive) };
    e.timed = { name: "pickup_throw", at: t0 + F.collect - 0.4 };
    e.face = () => (c.throwInfo ? { x: 0, z: ENDS[c.throwInfo.end].stumps } : { x: F.at.x, z: F.at.z });
    /* the keeper comes up to the stumps, the bowler goes to his */
    if (keeper !== e) { keeper.move = { from: keeper.pos.clone(), to: new THREE.Vector3(0.05, 0, -0.55), t0: t0 + 0.2, t1: t0 + 0.2 + keeper.pos.distanceTo(new THREE.Vector3(0.05, 0, -0.55)) / 5.5 }; keeper.face = () => ({ x: F.at.x, z: F.at.z }); }
    if (bowlerE !== e) {
      bowlerE.override = true;
      bowlerE.pos.copy(bowlerW.root.position);
      const spot = new THREE.Vector3(-0.35, 0, PITCH.length + 0.55);
      bowlerE.move = { from: bowlerE.pos.clone(), to: spot, t0: now + 0.3, t1: now + 0.3 + bowlerE.pos.distanceTo(spot) / 5 };
      bowlerE.face = () => ({ x: F.at.x, z: F.at.z });
    }
  }

  function updateField(c, now) {
    const F = c.fielding, t = now - c.contactAbs;
    const r = c.runner;
    /* the batters run */
    if (now >= c.contactAbs + RUN_DELAY && !c.outcome) {
      const dt = clockDt;
      if (r.p < r.target) r.p = Math.min(r.target, r.p + dt / RUN_TIME);
      else if (r.p > r.target) r.p = Math.max(r.target, r.p - dt / RUN_TIME);
    }
    if (F.kind === "caught") {
      if (t >= F.t && !c.outcome) {
        const catcher = fielders[F.fielder];
        const out = !c.freeHit && !c.noBall;
        audio.cheer(false);
        if (out) umpireSignal("umpire_out");
        finish(c, { runs: 0, wicket: out ? { how: "caught", index: c.strikerIdx, fielder: catcher.name } : null, extra: c.noBall ? "noball" : null },
          out ? "Caught" : "Not out", out ? `${catcher.name} takes it${F.dive ? " diving" : ""}` : "Caught off a free hit", out, 1.0);
      }
      return;
    }
    if (F.kind === "boundary") {
      if (t >= F.t && !c.outcome) {
        const six = F.six;
        audio.cheer(six); crowdCheer(six ? 1 : 0.6);
        umpireSignal(six ? "umpire_six" : "umpire_four");
        finish(c, { runs: 0, boundary: six ? 6 : 4, extra: c.noBall ? "noball" : null }, six ? "Six" : "Four", gradeText(c.result.grade), false, 0.8);
      }
      showRunPrompt();
      return;
    }
    /* fielded: throw when the pickup clip lets go */
    if (!c.throwInfo && t >= F.release) {
      const end = throwEnd(F, c.field, r.p, r.target, t);
      const info = ballAtEnd(F, c.field, end);
      const from = new THREE.Vector3();
      fielders[F.fielder].player.bones.prop_R.getWorldPosition(from);
      c.throwInfo = { end, from, releaseAbs: now, arriveAbs: c.contactAbs + info.t, done: false };
    }
    if (c.throwInfo && !c.throwInfo.done && now >= c.throwInfo.arriveAbs) {
      c.throwInfo.done = true;
      const end = c.throwInfo.end;
      const who = outOfGround(r.p, end);
      if (who) {
        audio.stumps();
        breakStumps(end, 0);
        sayNow(c, "runout");
        const index = who === "A" ? c.strikerIdx : c.nonStrikerIdx;
        const done = Math.floor(r.p + 1e-6);
        umpireSignal("umpire_out");
        finish(c, { runs: done, wicket: { how: "run out", index, fielder: fielders[F.fielder].name }, extra: c.noBall ? "noball" : null },
          "Run out", `${match.current.batters[index].name} short at the ${end === "A" ? "keeper's" : "bowler's"} end`, true, 0.6);
        return;
      }
      c.ballBack = true;
    }
    if (c.ballBack && !c.outcome && Math.abs(r.p - r.target) < 1e-6) {
      const runs = Math.round(r.p);
      finish(c, { runs, extra: c.noBall ? "noball" : null }, runs === 0 ? (c.result.shot === "defend" ? "Defended" : "Dot ball") : runs === 1 ? "1 run" : `${runs} runs`,
        c.fielding.fumble ? "Misfield" : c.fielding.dropped ? "Dropped catch" : gradeText(c.result.grade), false, 0.3);
    }
    showRunPrompt();
  }

  function gradeText(grade) {
    return { perfect: "Perfect timing", good: "Good timing", early: "Slightly early", late: "Slightly late" }[grade] || "";
  }

  /* the ball is dead: score it */
  function finish(c, event, label, detail, out, delay) {
    if (c.outcome) return;
    c.outcome = event;
    later(delay, () => {
      if (ballCtx !== c) return;
      showCallout(label, detail, out ? "is-out" : (event.boundary ? "is-boundary" : ""));
      $("run").hidden = true;
      ballsBowled += 1;
      if (commentary && !c.said) sayNow(c, commentaryFor(event, c));
      const res = match.ball(event);
      if (event.wicket) {
        /* the new batter takes the dismissed batter's model */
        const model = modelOf.get(event.wicket.index);
        modelOf.delete(event.wicket.index);
        const inn = res.inningsEnd ? null : match.current;
        if (inn) {
          const fresh = [inn.striker, inn.nonStriker].find((i) => !modelOf.has(i));
          if (fresh != null) modelOf.set(fresh, model);
        }
      }
      updateScore(res.inningsEnd ? match.innings[match.innings.length - (res.matchEnd ? 1 : 2)] : match.current);
      phase = "dead";
      later(2.4, () => afterBall(res));
    });
  }

  function afterBall(res) {
    if (destroyed) return;
    if (res.matchEnd) { showResult(); return; }
    if (res.inningsEnd) { showBreak(); return; }
    if (res.overEnd) showCallout("End of over", `${teams[match.current.bat].name} ${match.current.runs}/${match.current.wkts}`, "");
    resetPlayers();
    later(res.overEnd ? 1.4 : 0, toSetup);
  }
  function resetPlayers() {
    for (const b of batters) b.setManual(true);
    bowlerW.prepare({ spin: bowlKind() === "spin" });
    fielders.forEach((e) => { e.override = false; e.clip = null; });
  }

  /* ---------- HUD ---------- */
  function updateScore(inn = match && match.current) {
    if (!inn) return;
    $("team").textContent = teams[inn.bat].short;
    $("runs").textContent = `${inn.runs}/${inn.wkts}`;
    $("overs").textContent = match.oversText(inn);
    const over = inn.overs[inn.overs.length - 1] || [];
    $("over").innerHTML = over.map((v) => `<i class="${v === "W" ? "is-out" : v === "4" || v === "6" ? "is-boundary" : v === "0" ? "is-dot" : ""}">${v === "0" ? "•" : v}</i>`).join("");
    if (inn.batters[inn.striker] && !inn.done) {
      const b = inn.batters[inn.striker];
      $("striker").textContent = `${quick ? shortName(b.name) : b.name} ${b.runs}* (${b.balls})`;
      $("bowlerName").textContent = inn.bowler ? `${quick ? shortName(inn.bowler.name) : inn.bowler.name} ${Math.floor(inn.bowler.balls / 6)}.${inn.bowler.balls % 6}-${inn.bowler.runs}-${inn.bowler.wkts}` : "";
    }
    const need = match.needText(inn);
    $("need").textContent = need || (inn.target == null ? "" : "");
    $("need").hidden = !need;
  }
  function showCallout(label, detail, cls) {
    const box = $("callout");
    box.querySelector("b").textContent = label;
    box.querySelector("span").textContent = detail || "";
    box.className = `g-callout ${cls || ""}`;
    box.hidden = false;
    void box.offsetWidth;
    box.classList.add("is-in");
  }
  function hideCallout() { $("callout").hidden = true; $("delivery").hidden = true; $("run").hidden = true; }

  function card(inn) {
    const batRows = inn.batters.filter((b, i) => b.balls || b.out || i === inn.striker || i === inn.nonStriker).map((b) =>
      `<tr><th scope="row">${b.name}</th><td>${b.out || "not out"}</td><td>${b.runs}</td><td>${b.balls}</td></tr>`).join("");
    const bowling = inn.bowling.filter((b) => b.balls || b.runs).map((b) => `${b.name} ${Math.floor(b.balls / 6)}.${b.balls % 6}-${b.runs}-${b.wkts}`).join(" · ");
    return `
      <section class="m-card">
        <h3>${teams[inn.bat].name} ${inn.runs}/${inn.wkts} <small>(${match.oversText(inn)} ov${inn.extras ? ` · ${inn.extras} extras` : ""})</small></h3>
        <table><thead><tr><th scope="col">Batter</th><th scope="col"></th><th scope="col">R</th><th scope="col">B</th></tr></thead><tbody>${batRows}</tbody></table>
        <p class="m-bowling">${bowling}</p>
      </section>`;
  }
  function showBreak() {
    phase = "break";
    hideCallout();
    target.visible = false;
    $("bowl").hidden = true;
    const first = match.innings[0], second = match.current;
    const youBat = second.bat === USER;
    $("break").innerHTML = `
      <p class="g-kicker">Innings break</p>
      <h2>${teams[first.bat].name} ${first.runs}/${first.wkts}</h2>
      <p class="g-sub">${youBat ? `You need ${second.target} to win off ${OVERS * 6} balls.` : `Defend ${first.runs}: ${teams[second.bat].name} need ${second.target} off ${OVERS * 6} balls.`}</p>
      ${card(first)}
      <div class="g-actions"><button type="button" class="g-btn g-btn-primary" data-act="next">${youBat ? "Start batting" : "Start bowling"}</button><button type="button" class="g-btn" data-act="quit">${quitLabel}</button></div>`;
    $("break").hidden = false;
    $("break").querySelector("button").focus();
  }
  function showResult() {
    phase = "result";
    hideCallout();
    target.visible = false;
    $("bowl").hidden = true;
    const res = match.result;
    const won = res.winner === USER;
    $("result").innerHTML = `
      <p class="g-kicker">${quick ? `Quick Match · ${OVERS} overs` : "Practice match"} · ${level}</p>
      <h2>${res.text}</h2>
      ${res.winner == null ? "" : `<p class="g-best${won ? "" : " m-lost"}">${won ? "You won" : "You lost"}</p>`}
      <div class="m-cards">${match.innings.map(card).join("")}</div>
      <div class="g-actions"><button type="button" class="g-btn g-btn-primary" data-act="again">Play again</button><button type="button" class="g-btn" data-act="quit">${quick ? "Back to home" : "Back to nets"}</button></div>`;
    $("result").hidden = false;
    $("result").querySelector("button").focus();
    try { window.dispatchEvent(new CustomEvent("wcc:practice-match-complete", { detail: { level, result: res.text, won } })); } catch (_) { /* optional */ }
  }

  function umpireSignal(name) {
    if (!umpire) return;
    umpire.play(name, { fade: 0.2, loop: false });
    later(2.2, () => umpire && umpire.play("umpire_idle", { fade: 0.4 }));
  }

  /* ---------- pause / quit ---------- */
  function pause() {
    if (["intro", "cinematic", "toss", "result", "break"].includes(phase) || paused) return;
    paused = true;
    audio.pause(true);
    if (commentary) commentary.pause(true);
    $("pause").hidden = false;
    $("pause").querySelector("button").focus();
  }
  function resume() {
    paused = false;
    audio.pause(false);
    if (commentary) commentary.pause(false);
    $("pause").hidden = true;
    clock.frameReal = performance.now();
  }
  function restart() { destroy(true); active = createSession({ ...options, skipIntro: true }); }
  function quit() { destroy(); onExit(); }

  /* ---------- stumps ---------- */
  const flying = [];
  function breakStumps(endKey, x) {
    const s = stumpsAt[endKey];
    const dir = endKey === "A" ? -1 : 1;
    s.bails.forEach((bail, i) => flying.push({ obj: bail, v: new THREE.Vector3((i ? 1 : -1) * 1.5 + x * 4, 3.2 + i, 2.5 * dir), spin: 12 }));
    s.stumps.forEach((stump, i) => flying.push({ obj: stump, lean: { x: 0.7 * dir * (0.9 + Math.random() * 0.2), z: (i - 1) * 0.25 + x * 1.5 }, t: 0 }));
  }
  function resetStumps() {
    flying.length = 0;
    for (const s of [strikerStumps, bowlerStumps]) {
      s.stumps.forEach((st, i) => { st.position.copy(s.home.stumps[i]); st.rotation.set(0, 0, 0); });
      s.bails.forEach((b, i) => { b.position.copy(s.home.bails[i]); b.rotation.set(0, 0, 0); });
    }
  }
  function updateFlying(dt) {
    for (const f of flying) {
      if (f.v) {
        f.v.y -= 9.81 * dt;
        f.obj.position.addScaledVector(f.v, dt);
        f.obj.rotation.x += f.spin * dt;
        if (f.obj.position.y < 0.01) { f.obj.position.y = 0.01; f.v.multiplyScalar(0.3); f.v.y = Math.abs(f.v.y); f.spin *= 0.5; }
      } else {
        f.t = Math.min(1, f.t + dt * 4);
        f.obj.rotation.x = f.lean.x * f.t;
        f.obj.rotation.z = f.lean.z * f.t;
      }
    }
  }

  /* ---------- the ball ---------- */
  const tmp = new THREE.Vector3();
  function updateBall(now) {
    const c = ballCtx;
    if (!c) { ball.show(false); return; }
    const tau = now - c.releaseAt;
    if (tau < 0 || !c.delivery) {
      bowlerW.ballHold.getWorldPosition(tmp);
      ball.show(true); ball.place(tmp); ball.trail.visible = false;
      return;
    }
    ball.show(true);
    ball.trail.visible = true;
    const F = c.fielding;
    if (!F) {
      const s = c.delivery.samples, last = s[s.length - 1];
      const take = keeperTakeTime(c);
      if (c.result && c.result.kind === "bowled") { ball.place(sampleAt(s, Math.min(tau, last.t))); return; }
      if (tau <= last.t && tau <= take) { ball.place(sampleAt(s, tau)); return; }
      const keeper = fielders[0];
      if (tau < take) {
        const a = last, k = (tau - last.t) / Math.max(0.01, take - last.t);
        ball.place({ x: a.x + (keeper.pos.x - a.x) * k, y: a.y + (0.75 - a.y) * k, z: a.z + (keeper.pos.z + 0.45 - a.z) * k });
        return;
      }
      keeper.player.bones.prop_R.getWorldPosition(tmp);
      ball.place(tmp);
      return;
    }
    const t = now - c.contactAbs;
    const flight = c.result.flight.samples;
    if (F.kind === "caught") {
      if (t < F.t) ball.place(sampleAt(flight, t));
      else { fielders[F.fielder].player.bones.prop_R.getWorldPosition(tmp); ball.place(tmp); }
      return;
    }
    if (F.kind === "boundary") { ball.place(sampleAt(flight, t)); return; }
    if (t < F.t) { ball.place(sampleAt(flight, t)); return; }
    if (t < F.collect) { ball.place({ x: F.at.x, y: PITCH.ballRadius, z: F.at.z }); return; }
    if (!c.throwInfo) { fielders[F.fielder].player.bones.prop_R.getWorldPosition(tmp); ball.place(tmp); return; }
    const th = c.throwInfo;
    const endZ = ENDS[th.end].stumps;
    const span = Math.max(0.05, th.arriveAbs - 0.22 - th.releaseAbs);
    const k = Math.min(1, (now - th.releaseAbs) / span);
    const to = { x: 0, y: 0.8, z: endZ + (th.end === "A" ? -0.3 : 0.3) };
    const d = Math.hypot(to.x - th.from.x, to.z - th.from.z);
    ball.place({ x: th.from.x + (to.x - th.from.x) * k, y: th.from.y + (to.y - th.from.y) * k + Math.sin(Math.PI * k) * Math.min(6, d * 0.06), z: th.from.z + (to.z - th.from.z) * k });
  }

  /* ---------- players per frame ---------- */
  let clockDt = 0;
  function loopClip(e, name, scale = 1) {
    if (e.clip !== name) { e.action = e.player.play(name, { fade: 0.18 }); e.clip = name; }
    e.action.timeScale = scale;
  }
  function timedClip(e, name, at, now) {
    if (e.clip !== name) { e.action = e.player.play(name, { fade: 0.1, loop: false }); e.clip = name; e.action.timeScale = 0; }
    e.action.time = Math.max(0, Math.min(e.action.getClip().duration, now - at));
  }
  function faceTo(e, p, rate) {
    const want = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);
    let d = want - e.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    e.yaw += d * rate;
  }
  function updateFielder(e, now, dt) {
    const c = ballCtx;
    const ballLive = c && phase !== "setup";
    if (e.timed && now >= e.timed.at) {
      timedClip(e, e.timed.name, e.timed.at, now);
      if (e.face) faceTo(e, e.face(), Math.min(1, dt * 8));
    } else if (e.move && now >= e.move.t0 && now < e.move.t1) {
      const k = (now - e.move.t0) / (e.move.t1 - e.move.t0);
      e.pos.lerpVectors(e.move.from, e.move.to, k);
      const speed = e.move.from.distanceTo(e.move.to) / Math.max(0.05, e.move.t1 - e.move.t0);
      faceTo(e, e.move.to, Math.min(1, dt * 10));
      loopClip(e, "run", Math.min(2.2, Math.max(0.8, speed / 3.2)));
    } else {
      if (e.move && now >= e.move.t1) e.pos.copy(e.move.to);
      const look = e.face ? e.face() : (ballLive ? ball.ball.position : { x: BATTER_SPOT.x, z: BATTER_SPOT.z });
      faceTo(e, look, Math.min(1, dt * 4));
      if (e.role === "keeper" && (!e.move || phase === "setup" || phase === "runup" || phase === "live")) {
        const take = c && c.delivery && !c.fielding ? c.releaseAt + keeperTakeTime(c) - 0.4 : null;
        if (take != null && now >= take && c.result && c.result.kind !== "bowled") timedClip(e, "keeper_take", take, now);
        else loopClip(e, "keeper_crouch");
      } else loopClip(e, phase === "runup" || phase === "live" ? "field_ready" : "field_idle");
    }
    e.player.update(dt);
    e.player.root.position.copy(e.pos);
    e.player.root.rotation.y = e.yaw;
  }

  function updateFigures(now, dt) {
    const c = ballCtx;
    for (const e of fielders) {
      if (e.role === "bowler" && !e.override) continue;
      updateFielder(e, now, dt);
    }
    if (bowlerW && !fielders[fielders.length - 1]?.override) {
      bowlerW.update(c ? now - c.releaseAt : -99);
      const be = fielders[fielders.length - 1];
      if (be) { be.pos.copy(bowlerW.root.position); be.yaw = bowlerW.root.rotation.y; }
    }
    if (!batters.length) { if (umpire) umpire.update(dt); return; }
    /* batters: the striker plays his shot, then both run */
    const running = c && phase === "field" && (c.runner.target > 0 || c.runner.p > 0) && now >= c.contactAbs + RUN_DELAY;
    if (c && c.modelA && c.modelB) {
      if (running) {
        for (const [model, startEnd] of [[c.modelA, "A"], [c.modelB, "B"]]) {
          model.setManual(true);
          const pos = runnerZ(c.runner.p, startEnd);
          const moving = Math.abs(c.runner.p - c.runner.target) > 1e-6;
          model.root.position.set(pos.x, 0, pos.z);
          const goingB = moving ? (c.runner.target > c.runner.p) === (pos.heading === "B") : pos.heading === "B";
          const yaw = goingB ? 0 : Math.PI;
          model.root.rotation.y += Math.atan2(Math.sin(yaw - model.root.rotation.y), Math.cos(yaw - model.root.rotation.y)) * Math.min(1, dt * 10);
          if (moving) { if (model.player.action !== model._run) { model._run = model.player.play("batter_run", { fade: 0.15 }); } model._run.timeScale = 1.8; }
          else if (model._run) { model.player.play("bat_idle", { fade: 0.25 }); model._run = null; }
        }
      }
      if (!c.modelA.manual) c.modelA.update(dt, c, now);
      else c.modelA.update(dt);
      c.modelB.update(dt);
    } else {
      for (const b of batters) b.update(dt, null, now);
    }
    if (umpire) umpire.update(dt);
  }

  function updateTarget(dt) {
    if (!target.visible || userBatting() || phase !== "setup") { if (target.visible) target.position.set(bowlPlan.x, 0.02, bowlPlan.z); return; }
    const aim = currentAim();
    bowlPlan.x = THREE.MathUtils.clamp(bowlPlan.x + aim.x * dt * 0.6, -1.2, 0.9);
    bowlPlan.z = THREE.MathUtils.clamp(bowlPlan.z - aim.y * dt * 2.4, 0.3, bowlPlan.kind === "spin" ? 6.5 : 10.5);
    target.position.set(bowlPlan.x, 0.02, bowlPlan.z);
    lengthLine.position.x = -bowlPlan.x;
    ringMat.opacity = 0.75 + 0.2 * Math.sin(clock.game * 6);
  }

  function updateCamera(dt, now) {
    let targetPos, targetLook, targetFov;
    if (cam.mode === "cine") {
      const t = now - cineStart;
      const a = 2.5 + t * 0.11;
      const r = 78 - Math.min(t, 20) * 1.2;
      targetPos = new THREE.Vector3(Math.sin(a) * r, 30 - Math.min(t, 20) * 0.7, 10 + Math.cos(a) * r);
      targetLook = new THREE.Vector3(0, 1.5, 10);
      targetFov = 34;
    } else if (cam.mode === "follow" && ballCtx) {
      const b = ball.ball.position;
      targetLook = new THREE.Vector3(b.x, Math.max(0.3, b.y * 0.8), b.z);
      targetPos = new THREE.Vector3(b.x * 0.3, 22 + Math.max(0, b.y) * 0.4, 52 + b.z * 0.12);
      const radial = Math.hypot(targetPos.x, targetPos.z);
      if (radial > 58) { targetPos.x *= 58 / radial; targetPos.z *= 58 / radial; }
      const reach = targetPos.distanceTo(targetLook);
      targetFov = THREE.MathUtils.radToDeg(2 * Math.atan((11 + Math.max(0, b.y) * 0.5) / reach));
    } else {
      targetPos = BROADCAST.pos; targetLook = BROADCAST.look; targetFov = baseFov();
      if (phase === "setup" && !userBatting() && match) { targetLook = new THREE.Vector3(0.1, 0.3, 5.5); targetFov = baseFov() * 1.25; }
      if (ballCtx && (phase === "runup" || phase === "live")) {
        const tau = now - ballCtx.releaseAt;
        const k = Math.max(0, Math.min(1, (tau + 1.2) / 1.2));
        targetFov = baseFov() * (1 - 0.07 * k);
      }
    }
    let rate = settings.reduceMotion ? 1 : Math.min(1, dt * (cam.mode === "follow" ? 2.6 : 5));
    let lookRate = settings.reduceMotion ? 1 : Math.min(1, dt * (cam.mode === "follow" ? 7 : 5));
    if (cam.snap) { rate = lookRate = 1; cam.snap = false; }
    cam.pos.lerp(targetPos, rate);
    cam.look.lerp(targetLook, lookRate);
    cam.fov += (targetFov - cam.fov) * rate;
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    const d = camera.position.distanceTo(ball.ball.position);
    const minSize = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.007;
    ball.ball.scale.setScalar(Math.max(1, minSize / 0.104));
  }

  /* ---------- loop ---------- */
  let raf = 0;
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
    clockDt = dt;
    if (!paused && batters.length) {
      updateLogic(now);
      updateFigures(now, dt);
      updateBall(now);
      updateFlying(dt);
      updateWorld(now, dt);
      updateTarget(dt);
    }
    updateCamera(dtReal, now);
    renderer.render(scene, camera);
  }
  function onVisibility() { if (document.hidden) pause(); }
  document.addEventListener("visibilitychange", onVisibility);

  function destroy(restarting = false) {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    audio.stop();
    if (commentary) commentary.stop();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    document.removeEventListener("visibilitychange", onVisibility);
    resizeObserver.disconnect();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) [].concat(obj.material).forEach((m) => { if (m.map && !m.map.isCanvasTexture) m.map.dispose(); m.dispose(); });
    });
    renderer.dispose();
    host.innerHTML = "";
    host.hidden = true;
    html.classList.remove("game-on");
    if (!restarting) window.dispatchEvent(new Event("wcc:game-end"));
    if (active && active.destroy === destroy) active = null;
  }

  clock.frameReal = performance.now();
  raf = requestAnimationFrame(frame);
  if (quick) {
    $("tossCall").querySelectorAll("button").forEach((b) => { b.disabled = true; });
    if (skipIntro) { phase = "cinematic"; cineStart = clock.game; cam.mode = "cine"; showToss(); } else startIntro();
  } else {
    const startButtons = [...$("intro").querySelectorAll('[data-act="batFirst"], [data-act="bowlFirst"]')];
    startButtons.forEach((b) => { b.disabled = true; });
    startButtons[0].textContent = "Loading players…";
    playersReady.finally(() => {
      if (destroyed) return;
      startButtons.forEach((b) => { b.disabled = false; });
      startButtons[0].textContent = "Bat first";
      if (!panelOpen() || panelOpen() === $("intro")) startButtons[0].focus();
    });
  }

  return {
    ready: playersReady, destroy,
    debug: {
      get match() { return match; }, get phase() { return phase; }, commentary, runToss, showToss, get now() { return clock.game; }, get paused() { return paused; }, get timeouts() { return timeouts.length; }, get ballCtx() { return ballCtx; }, fielders, get batters() { return batters; },
      camera, scene, renderer, bowlPlan, begin, callRun, sendBack, bowlPress, lockRelease,
      shotPerfect(shot, offset = 0, aim) { const c = ballCtx; if (aim) { input.padAim.x = aim.x; input.padAim.y = aim.y; } playShot(shot, c.releaseAt + c.plan.t - SWING_LEAD[shot] + offset); input.padAim.x = input.padAim.y = 0; },
      advance(seconds) { const p = paused; paused = false; for (let t = 0; t < seconds; t += 1 / 60) tick(1 / 60); paused = p; clock.frameReal = performance.now(); }
    }
  };
}
