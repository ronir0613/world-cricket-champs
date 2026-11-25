/* ==========================================================================
   Players: a jointed figure built from simple shapes, posed in code.

   Local frame: the figure faces +z, its left is +x, up is +y. Every joint is
   a Group, so a pose is just a set of Euler rotations per joint.
   ========================================================================== */
import * as THREE from "three";

const JOINTS = ["root", "hips", "spine", "chest", "neck", "shL", "elL", "haL", "shR", "elR", "haR", "hipL", "knL", "anL", "hipR", "knR", "anR", "bat"];

function limb(length, radius, material) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 4, 10), material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  return mesh;
}

function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  return mesh;
}

export const KITS = {
  IND: { shirt: "#1f5fbf", trim: "#f08a3c", trousers: "#1b3f86", helmet: "#1b3f86" },
  AUS: { shirt: "#f2c230", trim: "#1f6b3a", trousers: "#f2c230", helmet: "#1f6b3a" },
  ENG: { shirt: "#2a5bd7", trim: "#d43c3c", trousers: "#16326e", helmet: "#16326e" },
  PAK: { shirt: "#1d7a44", trim: "#a7e0b5", trousers: "#155c33", helmet: "#155c33" },
  SA:  { shirt: "#1f6b3a", trim: "#f2c230", trousers: "#1f6b3a", helmet: "#1f6b3a" },
  NZL: { shirt: "#1d1f24", trim: "#7fd1c7", trousers: "#1d1f24", helmet: "#1d1f24" },
  SL:  { shirt: "#24459a", trim: "#f2c230", trousers: "#1b3577", helmet: "#1b3577" },
  WI:  { shirt: "#7a1f3d", trim: "#f2c230", trousers: "#5b162d", helmet: "#5b162d" },
  BAN: { shirt: "#1d7a44", trim: "#d43c3c", trousers: "#155c33", helmet: "#155c33" },
  AFG: { shirt: "#2a5bd7", trim: "#d43c3c", trousers: "#16326e", helmet: "#16326e" },
  ZIM: { shirt: "#d43c3c", trim: "#f2c230", trousers: "#8f1f1f", helmet: "#8f1f1f" },
  NET: { shirt: "#2c3442", trim: "#15945e", trousers: "#e9ecef", helmet: "#2c3442" }
};

export function buildFigure({ kit = KITS.IND, skin = "#b98563", batter = false }) {
  const mat = (color, rough = 0.75) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const shirt = mat(kit.shirt, 0.7), trim = mat(kit.trim, 0.7), trousers = mat(kit.trousers, 0.8);
  const skinMat = mat(skin, 0.6), shoe = mat("#f2f2f2", 0.6), white = mat("#f7f7f4", 0.65);
  const j = {};
  for (const name of JOINTS) j[name] = new THREE.Group();

  j.root.add(j.hips);
  j.hips.position.y = 0.95;
  j.hips.add(box(0.32, 0.16, 0.2, trousers));
  j.hips.add(j.spine);
  j.spine.add(j.chest);
  j.chest.position.y = 0.26;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 4, 12), shirt);
  torso.scale.set(1.12, 1, 0.72);
  torso.position.y = 0.13;
  torso.castShadow = true;
  j.spine.add(torso);
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.26, 4, 10), shirt);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = 0.2;
  shoulders.castShadow = true;
  j.chest.add(shoulders);
  const collar = box(0.16, 0.03, 0.12, trim);
  collar.position.set(0, 0.27, 0.04);
  j.chest.add(collar);

  j.chest.add(j.neck);
  j.neck.position.y = 0.29;
  const neck = limb(0.08, 0.05, skinMat); neck.position.y = 0.04;
  j.neck.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), skinMat);
  head.position.y = 0.15;
  head.scale.set(0.92, 1.05, 1);
  head.castShadow = true;
  j.neck.add(head);
  if (batter) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.122, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), mat(kit.helmet, 0.45));
    helmet.position.y = 0.17;
    helmet.castShadow = true;
    const peak = box(0.2, 0.015, 0.08, mat(kit.helmet, 0.45));
    peak.position.set(0, 0.17, 0.12);
    const grille = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 4, 16, Math.PI), mat("#9aa3ae", 0.3));
    grille.position.set(0, 0.11, 0.035);
    grille.rotation.set(Math.PI / 2 + 0.25, 0, 0);
    j.neck.add(helmet, peak, grille);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(kit.trim, 0.6));
    cap.position.y = 0.17;
    const brim = box(0.16, 0.012, 0.09, mat(kit.trim, 0.6));
    brim.position.set(0, 0.2, 0.11);
    j.neck.add(cap, brim);
  }

  for (const side of ["L", "R"]) {
    const sign = side === "L" ? 1 : -1;
    const sh = j["sh" + side], el = j["el" + side], ha = j["ha" + side];
    sh.position.set(sign * 0.21, 0.19, 0);
    j.chest.add(sh);
    sh.add(limb(0.29, 0.055, shirt));
    el.position.y = -0.29;
    sh.add(el);
    el.add(limb(0.26, 0.045, skinMat));
    ha.position.y = -0.27;
    el.add(ha);
    const hand = batter ? box(0.08, 0.1, 0.09, white) : new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skinMat);
    hand.position.y = -0.04;
    hand.castShadow = true;
    ha.add(hand);

    const hip = j["hip" + side], kn = j["kn" + side], an = j["an" + side];
    hip.position.set(sign * 0.1, -0.04, 0);
    j.hips.add(hip);
    hip.add(limb(0.45, 0.075, trousers));
    kn.position.y = -0.45;
    hip.add(kn);
    kn.add(limb(0.43, 0.06, trousers));
    if (batter) {
      const pad = box(0.15, 0.5, 0.11, white);
      pad.position.set(0, -0.2, 0.04);
      kn.add(pad);
    }
    an.position.y = -0.43;
    kn.add(an);
    const foot = box(0.1, 0.07, 0.26, shoe);
    foot.position.set(0, -0.035, 0.06);
    an.add(foot);
  }

  if (batter) {
    /* Bat hangs from the top (left) hand along -y. */
    j.haL.add(j.bat);
    j.bat.position.y = -0.06;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.3, 8), mat("#22262d", 0.5));
    handle.position.y = -0.1;
    const blade = box(0.105, 0.56, 0.045, mat("#dcc08b", 0.55));
    blade.position.y = -0.53;
    const sticker = box(0.09, 0.14, 0.003, mat(kit.shirt, 0.5));
    sticker.position.set(0, -0.36, 0.024);
    handle.castShadow = true;
    j.bat.add(handle, blade, sticker);
    j.batTip = new THREE.Object3D();
    j.batTip.position.y = -0.62;
    j.bat.add(j.batTip);
  } else {
    j.ballHold = new THREE.Object3D();
    j.ballHold.position.y = -0.08;
    j.haR.add(j.ballHold);
  }
  return j;
}

/* ---------- Poses ---------- */
/* A pose is { joint: [x, y, z] } plus optional pos: [x, y, z] for the root. */
export function applyPose(j, pose) {
  for (const name of JOINTS) {
    const r = pose[name];
    if (r && j[name]) j[name].rotation.set(r[0], r[1], r[2]);
  }
  if (pose.pos) j.root.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
  if (pose.hipY != null) j.hips.position.y = pose.hipY;
}

export function blend(a, b, t) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[key], vb = b[key];
    if (typeof va === "number" || typeof vb === "number") { out[key] = (va ?? vb) + ((vb ?? va) - (va ?? vb)) * t; continue; }
    const x = va || [0, 0, 0], y = vb || [0, 0, 0];
    out[key] = [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  }
  return out;
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/* ---------- Batter ---------- */
/* Right-hander standing side-on: local +z faces the off side, local +x
   (his left shoulder) points down the pitch at the bowler. */
const STANCE = {
  hipY: 0.9,
  hips: [0, 0, 0], spine: [0.28, 0, 0], chest: [0.05, 0.1, 0], neck: [-0.1, 1.3, 0.1],
  shL: [-0.55, 0, -0.32], elL: [-0.35, 0, 0], haL: [0, 0, 0],
  shR: [-0.5, 0, 0.3], elR: [-0.55, 0, 0], haR: [0, 0, 0],
  bat: [0.25, 0, 0.15],
  hipL: [-0.25, 0, 0.14], knL: [0.42, 0, 0], anL: [-0.15, 0, 0],
  hipR: [-0.25, 0, -0.14], knR: [0.42, 0, 0], anR: [-0.15, 0, 0]
};
const BACKLIFT = {
  ...STANCE,
  chest: [0.05, -0.2, 0], neck: [-0.1, 1.45, 0.1],
  shL: [-0.85, 0, -1.25], elL: [-0.5, 0, 0],
  shR: [-0.8, 0, -0.85], elR: [-0.9, 0, 0],
  bat: [0.2, 0, -1.9]
};
/* Which stroke a swing plays, from the button, the foot, where it's aimed
   (+ leg side, - off side) and how high the ball is at contact. */
export function strokeFor(shot, front, aim, height = 0.6) {
  if (shot === "defend") return "defend";
  if (front) return aim > 0.85 ? "flick" : "drive";
  if (aim > 0.3 || (height > 1.05 && aim > 0)) return "pull";
  if (aim < -0.35) return "cut";
  return "punch";
}

/* Back foot back and across, weight on it. */
const BACK_LEGS = { hipL: [-0.15, 0, 0.2], knL: [0.3, 0, 0], anL: [0, 0, 0], hipR: [-0.35, 0, -0.2], knR: [0.35, 0, 0], anR: [-0.2, 0, 0] };

/* Bat meeting the ball. */
function contactPose(front, aim, stroke = "drive") {
  if (stroke === "pull") {
    /* hips and chest open to the bowler, arms out in front, bat horizontal */
    return { hipY: 0.9, ...BACK_LEGS, hips: [0, 0.6, 0], spine: [0.12, 0, 0], chest: [0, 0.8 + (aim - 0.6) * 0.3, 0], neck: [0.1, 0, 0],
      shL: [-1.45, 0, 0.2], elL: [-0.1, 0, 0], shR: [-1.35, 0, 0.55], elR: [-0.4, 0, 0], bat: [0, 0, -1.5] };
  }
  if (stroke === "cut") {
    /* back foot across, bent over it, arms reaching to the off side, bat flat */
    return { hipY: 0.86, hips: [0, -0.25, 0], spine: [0.4, 0, 0], chest: [0.05, -0.15, 0], neck: [0.25, 1.3, 0],
      shL: [-1.25, 0, 0.1], elL: [-0.05, 0, 0], shR: [-1.15, 0, 0.45], elR: [-0.2, 0, 0], bat: [-0.9, 0, 0],
      hipL: [-0.1, 0, 0.15], knL: [0.35, 0, 0], anL: [0, 0, 0], hipR: [-0.55, 0, -0.1], knR: [0.45, 0, 0], anR: [-0.2, 0, 0] };
  }
  /* drive, flick, punch, defence: hands low and forward, bat face vertical */
  const stride = front ? 1 : -1;
  const pose = {
    hipY: front ? 0.82 : 0.9,
    hips: [0, aim * 0.35, 0], spine: [front ? 0.45 : 0.25, 0, 0], chest: [0.05, aim * 0.6, 0], neck: [0.28, 1.2 - aim * 0.3, 0.05],
    shL: [-0.7, 0, 0.15], elL: [-0.15, 0, 0],
    shR: [-0.65, 0, 0.5], elR: [-0.5, 0, 0],
    bat: [0.1, 0, 0.2],
    hipL: front ? [-0.15, 0, 0.62] : [-0.2, 0, 0.12], knL: front ? [0.35, 0, -0.1] : [0.35, 0, 0], anL: [0, 0, -0.4 * (stride > 0 ? 1 : 0)],
    hipR: front ? [-0.05, 0, -0.32] : [-0.2, 0, -0.55], knR: front ? [0.65, 0, 0] : [0.3, 0, 0], anR: [-0.2, 0, 0]
  };
  /* flick: wrists roll the face round to leg */
  if (stroke === "flick") return { ...pose, chest: [0.05, aim * 0.75, 0], bat: [0.1, 0, 0.3] };
  /* punch: tall on the back foot, bat straight under the eyes */
  if (stroke === "punch") return { ...pose, hipY: 0.92, spine: [0.18, 0, 0], neck: [0.2, 1.25, 0.05], shL: [-0.85, 0, 0.2], bat: [0.15, 0, 0.15] };
  return pose;
}
function followPose(front, aim, shot, stroke = "drive") {
  const high = shot === "loft" ? 1 : shot === "defend" ? 0 : 0.7;
  const c = contactPose(front, aim, stroke);
  if (stroke === "defend") return { ...c, bat: [0.35, 0, 0.35], shL: [-0.9, 0, 0.2] };
  if (stroke === "pull") {
    /* rolls the wrists and wraps the bat over the back shoulder */
    return { ...c, hips: [0, 0.9, 0], chest: [0, 1.3, 0], neck: [0.1, -0.4, 0],
      shL: [-1.6, 0, 1.3], elL: [-0.6, 0, 0], shR: [-1.5, 0, 1.5], elR: [-1.2, 0, 0], bat: [0, 0, 1.6] };
  }
  if (stroke === "cut") {
    /* bat slaps down and finishes low towards point */
    return { ...c, chest: [0.1, -0.35, 0], shL: [-1.0, 0, -0.2], elL: [-0.05, 0, 0], shR: [-0.95, 0, 0.2], elR: [-0.15, 0, 0], bat: [0.2, 0, -0.9] };
  }
  if (stroke === "flick") {
    /* bat comes round low to the leg side, body turns with it */
    return { ...c, hips: [0, 0.6, 0], chest: [0, 1.2, 0], neck: [0.2, 0.6, 0],
      shL: [-1.1, 0, 0.7], elL: [-0.4, 0, 0], shR: [-1.0, 0, 0.9], elR: [-0.8, 0, 0], bat: [0.3, 0, 0.9] };
  }
  const lift = stroke === "punch" ? Math.min(high, 0.35) : high;
  return {
    ...c,
    spine: [front ? 0.25 - lift * 0.25 : 0.1, 0, 0], chest: [0, aim * 0.9, 0],
    shL: [-1.1 - lift * 0.9, 0, 1.4 + lift * 0.6], elL: [-0.6, 0, 0],
    shR: [-1.2 - lift * 0.8, 0, 1.0 + lift * 0.6], elR: [-1.1, 0, 0],
    bat: [0.2, 0, 1.6 + lift * 0.4]
  };
}
const LEAVE = {
  ...STANCE,
  hipY: 0.88, spine: [0.2, 0, 0], neck: [0, 1.3, 0],
  shL: [-1.9, 0, -0.6], elL: [-1.3, 0, 0], shR: [-1.8, 0, -0.2], elR: [-1.4, 0, 0], bat: [0.4, 0, -1.6],
  hipL: [-0.25, 0, 0.4], knL: [0.3, 0, 0]
};

/* Where the batter stands: just leg side of middle, inside the crease. */
export const BATTER_SPOT = { x: 0.42, z: 0.55 };

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* How far the batter has moved down (+) or back (-) the pitch:
   a small trigger step back in the backlift, then the stride. */
export function batterStride(state, time) {
  const trigger = -0.07;
  if (state.phase === "backlift" || state.phase === "leave") return trigger * ease(clamp01((time - state.t0) / 0.3));
  if (state.phase !== "swing") return 0;
  const reach = state.front ? 0.72 : -0.3;
  const span = Math.max(0.08, state.contactAt - state.t0);
  return trigger + (reach - trigger) * ease(clamp01((time - state.t0 + 0.04) / span));
}

/* Hands still high, but the front shoulder and front leg already lead. */
function loadPose(front, aim, stroke) {
  const c = contactPose(front, aim, stroke);
  const mid = blend(BACKLIFT, c, 0.45);
  return { ...mid, shL: [-0.95, 0, -1.35], elL: [-0.55, 0, 0], shR: [-0.9, 0, -0.95], elR: [-0.95, 0, 0], bat: [0.2, 0, -2.05], neck: [0.1, 1.3, 0.05] };
}
/* After the shot: bat comes down, body relaxes, still watching the ball. */
function settlePose(front, aim, shot, stroke) {
  const f = followPose(front, aim, shot, stroke);
  return { ...f, hipY: 0.9, spine: [0.12, 0, 0], chest: [0, aim * 0.4, 0], neck: [0, 1.1 - aim * 0.4, 0],
    shL: [-0.7, 0, 0.1], elL: [-0.4, 0, 0], shR: [-0.6, 0, 0.35], elR: [-0.6, 0, 0], bat: [0.35, 0, 0.45] };
}

export function batterPose(state, time) {
  /* state.phase: stance | backlift | swing | leave | recover */
  if (state.phase === "stance") {
    /* weight rocks gently and the bat taps the crease */
    const sway = Math.sin(time * 1.6) * 0.03, tap = Math.max(0, Math.sin(time * 2.4)) * 0.08;
    return { ...STANCE, spine: [0.28 + sway * 0.5, 0, 0], hips: [0, sway * 0.4, 0], bat: [0.25 + tap, 0, 0.15], knL: [0.42 + sway, 0, 0], knR: [0.42 - sway, 0, 0] };
  }
  if (state.phase === "recover") {
    const k = ease(clamp01((time - state.t0) / 0.55));
    return blend(state.from || STANCE, STANCE, k);
  }
  if (state.phase === "backlift") {
    const k = ease(clamp01((time - state.t0) / 0.38));
    return blend(STANCE, BACKLIFT, k);
  }
  if (state.phase === "leave") {
    const t = time - state.t0;
    const lift = blend(BACKLIFT, LEAVE, ease(clamp01(t / 0.25)));
    return t < 0.9 ? lift : blend(LEAVE, { ...STANCE, hipY: 0.92, spine: [0.15, 0, 0] }, ease(clamp01((t - 0.9) / 0.6)));
  }
  /* swing: backlift -> load -> downswing -> contact -> follow -> settle */
  const stroke = state.stroke || (state.shot === "defend" ? "defend" : "drive");
  const contact = contactPose(state.front, state.aim, stroke);
  if (time <= state.contactAt) {
    const span = Math.max(0.08, state.contactAt - state.t0);
    const k = clamp01((time - state.t0) / span);
    const load = loadPose(state.front, state.aim, stroke);
    if (k < 0.4) return blend(BACKLIFT, load, ease(k / 0.4));
    return blend(load, contact, Math.pow((k - 0.4) / 0.6, 2));
  }
  const follow = followPose(state.front, state.aim, state.shot, stroke);
  const dt = time - state.contactAt;
  const span = stroke === "defend" ? 0.2 : stroke === "cut" || stroke === "punch" ? 0.3 : 0.42;
  if (dt <= span + 0.5) return blend(contact, follow, easeOut(clamp01(dt / span)));
  return blend(follow, settlePose(state.front, state.aim, state.shot, stroke), ease(clamp01((dt - span - 0.5) / 0.7)));
}

/* ---------- Bowler ---------- */
/* Facing down the pitch (root rotated 180°). Distances are along the
   bowler's run, measured back from the release point. */
function runPose(phase, speed) {
  const s = Math.sin(phase), c = Math.cos(phase);
  const amp = 0.55 + speed * 0.35;
  return {
    hipY: 0.93 + Math.abs(s) * 0.05,
    spine: [0.18 + speed * 0.12, 0, 0], chest: [0, s * 0.15, 0], neck: [-0.1, 0, 0],
    hipL: [-s * amp, 0, 0.03], knL: [0.25 + Math.max(0, c) * 1.1, 0, 0], anL: [-0.1, 0, 0],
    hipR: [s * amp, 0, -0.03], knR: [0.25 + Math.max(0, -c) * 1.1, 0, 0], anR: [-0.1, 0, 0],
    shL: [s * amp * 0.9, 0, 0.12], elL: [-1.1, 0, 0],
    shR: [-s * amp * 0.9, 0, -0.12], elR: [-1.1, 0, 0]
  };
}

export function bowlerPose(state, time) {
  /* state: { releaseAt, runTime, spin } ; time in the same clock */
  const t = time - state.releaseAt;           /* negative before release */
  const gather = state.spin ? 0.32 : 0.42;
  if (t < -gather) {
    const runT = t + state.runTime;           /* 0 at the start of the run */
    const speed = state.spin ? 0.5 : 1;
    const phase = Math.max(0, runT) * (state.spin ? 9 : 11);
    return runPose(phase, speed);
  }
  if (t < 0) {
    /* gather and delivery stride: front arm up, bowling arm whirls over */
    const k = (t + gather) / gather;          /* 0..1 */
    const arm = k * (Math.PI + 0.25);
    return {
      hipY: 0.98 - k * 0.08 + Math.sin(k * Math.PI) * 0.12,
      spine: [-0.1 + k * 0.2, 0, 0], chest: [0, -0.5 + k * 0.5, 0], neck: [-0.15, 0.2 - k * 0.2, 0],
      /* front arm reaches up, then pulls down hard through release */
      shL: [k < 0.45 ? -2.9 : -2.9 + ((k - 0.45) / 0.55) * 2.5, 0, 0.25], elL: [k < 0.45 ? -0.2 : -0.9, 0, 0],
      shR: [arm, 0, -0.15], elR: [-0.1, 0, 0],
      hipL: [-0.3 - k * 0.4, 0, 0.05], knL: [0.5 - k * 0.4, 0, 0], anL: [0, 0, 0],
      hipR: [0.3 + k * 0.2, 0, -0.05], knR: [0.4, 0, 0], anR: [0.2, 0, 0]
    };
  }
  /* walk back off the pitch after the follow-through */
  if (t > 0.8) return runPose((t - 0.8) * 6.5, 0.05);
  /* follow-through */
  const k = ease(clamp01(t / 0.55));
  const arm = Math.PI + 0.25 + k * (Math.PI - 0.1);
  return {
    hipY: 0.9 + k * 0.03,
    spine: [0.1 + k * 0.55, 0, 0], chest: [0, k * 0.35, 0], neck: [-0.3 * k, 0, 0],
    shL: [-0.4 + k * 0.5, 0, 0.35 + k * 0.3], elL: [-0.9 + k * 0.5, 0, 0],
    shR: [arm, 0, -0.15 - k * 0.3], elR: [-0.2, 0, 0],
    hipL: [-0.7 + k * 0.3, 0, 0.05], knL: [0.1 + k * 0.3, 0, 0], anL: [0, 0, 0],
    hipR: [0.5 - k * 0.9, 0, -0.05], knR: [0.4 + k * 0.6, 0, 0], anR: [0.2, 0, 0]
  };
}

/* Where the bowler is along the run (z) at a time. */
export function bowlerZ(state, time) {
  const t = time - state.releaseAt;
  const releaseZ = 19.0;
  const runSpeed = state.spin ? 3.2 : 6.4;
  if (t < 0) return releaseZ - t * runSpeed;
  return releaseZ - Math.min(3.2, t * runSpeed * 0.6 * (1 - Math.min(1, t / 1.4) * 0.5));
}

/* Sideways walk-off after the follow-through, and which way he faces. */
export function bowlerWalk(state, time) {
  const t = time - state.releaseAt - 0.8;
  if (t <= 0) return { dx: 0, yaw: Math.PI };
  const turn = ease(clamp01(t / 0.4));
  return { dx: Math.min(3.2, t * 1.5), yaw: Math.PI - turn * Math.PI / 2 };
}
