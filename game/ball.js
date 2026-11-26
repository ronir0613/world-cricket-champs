/* ==========================================================================
   Ball physics and shot rules for Practice Nets. Plain maths, no graphics,
   so it can be tested on its own.

   World units are metres and seconds. The striker's stumps are at z = 0,
   the bowler's stumps at z = 20.12. y is up. The batter is right-handed:
   the off side is -x (left of the broadcast camera), the leg side is +x.
   ========================================================================== */

export const PITCH = {
  length: 20.12,
  poppingCrease: 1.22,
  stumpHalfWidth: 0.114,
  stumpHeight: 0.711,
  ballRadius: 0.036,
  boundary: 66
};

const G = 9.81;
const DRAG = 0.006;            /* 0.5 * rho * Cd * A / m for a cricket ball */
const STEP = 1 / 240;

/* Difficulty: how fast, how much movement, how wide the timing windows are. */
export const LEVELS = {
  Club:          { pace: [112, 124], spin: [70, 78], move: 0.45, windows: [0.032, 0.07, 0.125], marker: true },
  Domestic:      { pace: [124, 136], spin: [76, 85], move: 0.75, windows: [0.026, 0.058, 0.105], marker: false },
  International: { pace: [135, 149], spin: [82, 92], move: 1.0,  windows: [0.02, 0.048, 0.09],  marker: false }
};

/* Small seeded random generator so a session can be replayed. */
export function makeRng(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  next.range = (a, b) => a + (b - a) * next();
  next.pick = (list) => {
    const total = list.reduce((sum, item) => sum + item.w, 0);
    let roll = next() * total;
    for (const item of list) { roll -= item.w; if (roll <= 0) return item; }
    return list[list.length - 1];
  };
  return next;
}

const PACE_LENGTHS = [
  { label: "Yorker", w: 1, z: [0.2, 1.1] },
  { label: "Full", w: 2, z: [1.6, 3.4] },
  { label: "Good length", w: 4, z: [3.8, 6.4] },
  { label: "Back of a length", w: 2, z: [6.6, 8.2] },
  { label: "Bouncer", w: 1, z: [8.6, 10.4] }
];
const SPIN_LENGTHS = [
  { label: "Full", w: 2, z: [1.2, 2.6] },
  { label: "Good length", w: 4, z: [2.6, 4.4] },
  { label: "Short", w: 1, z: [4.6, 6.2] }
];
const LINES = [
  { label: "Wide outside off", w: 1, x: [-0.62, -0.36] },
  { label: "Outside off", w: 3, x: [-0.34, -0.12] },
  { label: "On the stumps", w: 3, x: [-0.1, 0.1] },
  { label: "Down leg", w: 1, x: [0.14, 0.34] }
];

/* Step the ball through the air with gravity, drag and a sideways force. */
function stepAir(p, v, side, dt) {
  const speed = Math.hypot(v.x, v.y, v.z);
  v.x += (-DRAG * speed * v.x + side) * dt;
  v.y += (-DRAG * speed * v.y - G) * dt;
  v.z += (-DRAG * speed * v.z) * dt;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
}

/* Fly a delivery from release; returns the samples and key moments. */
function flyDelivery(release, velocity, opts) {
  const p = { ...release };
  const v = { ...velocity };
  const samples = [{ t: 0, x: p.x, y: p.y, z: p.z }];
  let t = 0;
  let bounce = null;
  let stumps = null;
  let crossed = null;
  while (t < 2.4 && p.z > -3) {
    const side = bounce ? 0 : opts.swing;
    stepAir(p, v, side, STEP);
    t += STEP;
    if (!bounce && p.y <= PITCH.ballRadius && v.y < 0) {
      p.y = PITCH.ballRadius;
      v.y = -v.y * opts.restitution;
      v.z *= opts.grip;
      v.x = v.x * 0.92 + opts.deviation;
      bounce = { t, x: p.x, z: p.z };
    } else if (bounce && p.y <= PITCH.ballRadius && v.y < 0) {
      p.y = PITCH.ballRadius;
      v.y = -v.y * 0.35;
      v.z *= 0.8;
    }
    if (!crossed && p.z <= 0) {
      crossed = { t, x: p.x, y: p.y };
      if (Math.abs(p.x) < PITCH.stumpHalfWidth + PITCH.ballRadius && p.y < PITCH.stumpHeight + PITCH.ballRadius) stumps = crossed;
    }
    samples.push({ t, x: p.x, y: p.y, z: p.z });
  }
  return { samples, bounce, stumps, crossed };
}

/* Bowler actions the player can pick. Pace actions shift the speed band;
   spin actions fix the way the ball turns. */
export const ACTIONS = {
  pace: [{ id: "auto", label: "Auto" }, { id: "fast", label: "Fast" }, { id: "medium", label: "Medium-fast" }],
  spin: [{ id: "auto", label: "Auto" }, { id: "off", label: "Off-spin" }, { id: "leg", label: "Leg-spin" }]
};
const SPEED_SHIFT = { fast: 6, medium: -10 };

/* Plan one delivery for a drill ("pace" or "spin") at a level, with an
   optional bowler action ("fast", "medium", "off", "leg"; anything else is auto). */
export function planDelivery(drill, levelName, rng, action = "auto") {
  const level = LEVELS[levelName] || LEVELS.Club;
  const spin = drill === "spin";
  const length = rng.pick(spin ? SPIN_LENGTHS : PACE_LENGTHS);
  const line = rng.pick(LINES);
  const paceAction = !spin && SPEED_SHIFT[action] != null ? action : levelName === "International" ? "fast" : "medium";
  const shift = !spin && SPEED_SHIFT[action] != null ? SPEED_SHIFT[action] : 0;
  const speedKmh = Math.round(rng.range(...(spin ? level.spin : level.pace)) + shift);
  const speed = speedKmh / 3.6;
  const targetZ = rng.range(...length.z);
  const targetX = rng.range(...line.x);
  const release = { x: rng.range(0.05, 0.22), y: spin ? rng.range(1.95, 2.1) : rng.range(2.1, 2.3), z: 18.6 };

  /* Movement: pace swings in the air and seams off the pitch; spin turns. */
  const move = level.move;
  let swing = 0, deviation = 0, style = "";
  if (spin) {
    const offSpin = action === "off" ? true : action === "leg" ? false : rng() < 0.5;
    deviation = (offSpin ? 1 : -1) * rng.range(0.4, 1.4) * move;
    style = offSpin ? "Off-spin" : "Leg-spin";
  } else {
    const roll = rng();
    swing = roll < 0.4 ? -rng.range(0.6, 2.2) * move : roll < 0.75 ? rng.range(0.4, 1.8) * move : 0;
    deviation = rng.range(-0.25, 0.25) * move;
    style = swing < -0.3 ? "Outswinger" : swing > 0.3 ? "Inswinger" : "Seam up";
  }
  const opts = { swing, deviation, restitution: spin ? 0.42 : 0.52, grip: spin ? 0.84 : 0.9 };

  return {
    drill, spin, style, speedKmh,
    action: spin ? (style === "Off-spin" ? "off" : "leg") : paceAction,
    length: length.label, line: line.label,
    marker: level.marker,
    aim: { speed, targetZ, targetX, swing, opts },
    ...solveFlight(release, speed, targetZ, targetX, swing, opts)
  };
}

/* Aim: pick horizontal velocity so the ball heads for the target line
   at the stumps, then solve the vertical speed for the chosen length. */
function solveFlight(release, speed, targetZ, targetX, swing, opts) {
  const dz = release.z - targetZ;
  const vz = -speed * 0.985;
  const tToBounce = dz / speed;
  const lateral = (targetX - release.x) / (release.z / speed) - swing * tToBounce * 0.5;
  let lo = -12, hi = 6, result = null;
  for (let i = 0; i < 28; i++) {
    const vy = (lo + hi) / 2;
    result = flyDelivery(release, { x: lateral, y: vy, z: vz }, opts);
    const landed = result.bounce ? result.bounce.z : -99;
    if (landed > targetZ) lo = vy; else hi = vy;
    if (Math.abs(landed - targetZ) < 0.02) break;
  }
  return { release: { ...release }, ...result };
}

/* A delivery the player bowls: chosen type, speed and target spot on the
   pitch (x = line, z = where it pitches). Same shape as planDelivery. */
export const VARIATIONS = {
  pace: [
    { id: "seam", label: "Seam" },
    { id: "in", label: "Inswinger" },
    { id: "out", label: "Outswinger" },
    { id: "slower", label: "Slower ball" }
  ],
  spin: [
    { id: "off", label: "Off-break" },
    { id: "leg", label: "Leg-break" },
    { id: "arm", label: "Arm ball" }
  ]
};
export function planCustomDelivery({ spin, variation, speedKmh, targetX, targetZ, levelName, rng }) {
  const level = LEVELS[levelName] || LEVELS.Club;
  const release = { x: 0.15, y: spin ? 2.0 : 2.2, z: 18.6 };
  let swing = 0, deviation = 0, style;
  if (spin) {
    const turn = rng.range(0.7, 1.3);
    if (variation === "leg") { deviation = -turn; style = "Leg-break"; }
    else if (variation === "arm") { swing = rng.range(0.2, 0.5); deviation = rng.range(-0.08, 0.08); style = "Arm ball"; }
    else { deviation = turn; style = "Off-break"; }
  } else {
    deviation = rng.range(-0.2, 0.2);
    if (variation === "in") { swing = rng.range(0.9, 1.8); style = "Inswinger"; }
    else if (variation === "out") { swing = -rng.range(0.9, 1.8); style = "Outswinger"; }
    else if (variation === "slower") { style = "Slower ball"; }
    else { style = "Seam up"; }
  }
  const opts = { swing, deviation, restitution: spin ? 0.42 : 0.52, grip: spin ? 0.84 : 0.9 };
  const lengthLabel = spin
    ? (targetZ < 2.6 ? "Full" : targetZ < 4.5 ? "Good length" : "Short")
    : (targetZ < 1.2 ? "Yorker" : targetZ < 3.6 ? "Full" : targetZ < 6.5 ? "Good length" : targetZ < 8.4 ? "Back of a length" : "Bouncer");
  const speed = speedKmh / 3.6;
  return {
    drill: spin ? "spin" : "pace", spin, style, speedKmh, action: spin ? (variation === "leg" ? "leg" : "off") : "fast",
    length: lengthLabel, line: targetX < -0.36 ? "Wide outside off" : targetX < -0.12 ? "Outside off" : targetX < 0.12 ? "On the stumps" : "Down leg",
    marker: false, custom: true,
    aim: { speed, targetZ, targetX, swing, opts },
    ...solveFlight(release, speed, targetZ, targetX, swing, opts)
  };
}

/* Same delivery (speed, line, length, movement) released from another
   point: used to match the bowler's hand. */
export function releaseFrom(delivery, release) {
  const a = delivery.aim;
  return { ...delivery, ...solveFlight(release, a.speed, a.targetZ, a.targetX, a.swing, a.opts) };
}

/* Position on a sample path at time t (linear between samples). */
export function sampleAt(samples, t) {
  if (t <= samples[0].t) return samples[0];
  const last = samples[samples.length - 1];
  if (t >= last.t) return last;
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].t <= t) lo = mid; else hi = mid; }
  const a = samples[lo], b = samples[hi];
  const k = (t - a.t) / (b.t - a.t || 1);
  return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
}

/* First time the ball reaches a given z (heading towards the batter). */
export function timeAtZ(samples, z) {
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].z <= z) {
      const a = samples[i - 1], b = samples[i];
      const k = (a.z - z) / (a.z - b.z || 1);
      return a.t + (b.t - a.t) * k;
    }
  }
  return samples[samples.length - 1].t;
}

/* Where the bat meets the ball for this delivery: front foot for fuller
   balls, back foot for short ones. */
export function contactPlan(delivery) {
  const front = !delivery.bounce || delivery.bounce.z < (delivery.spin ? 4.6 : 6.6);
  const z = front ? 1.45 : 0.62;
  const t = timeAtZ(delivery.samples, z);
  const at = sampleAt(delivery.samples, t);
  return { front, z, t, at };
}

/* How long the swing takes from button press to the bat meeting the ball. */
export const SWING_LEAD = { ground: 0.17, loft: 0.2, defend: 0.12 };

/* Direction of a shot in the field: angle from straight down the ground
   (+z) towards the leg side (+x), in radians. */
function aimAngle(aim, contactX) {
  const len = Math.hypot(aim.x, aim.y);
  if (len < 0.3) {
    if (contactX < -0.24) return -0.55;
    if (contactX > 0.18) return 0.7;
    return contactX * 0.8;
  }
  /* aim.y > 0 is "up" on the stick, which is straight back past the bowler. */
  return Math.atan2(aim.x, aim.y);
}

/* How well the shot suits the ball, 0..1. */
function suitability(shot, angle, at, front) {
  let s = 1;
  const offside = angle < -0.35, legside = angle > 0.35;
  const behind = Math.abs(angle) > 1.9;
  if (at.x < -0.3 && legside) s -= 0.45;             /* dragging a wide ball across the line */
  if (at.x > 0.12 && angle < -0.9) s -= 0.4;         /* cutting a ball on the pads */
  if (at.y > 1.15 && shot !== "defend" && !legside && !behind) s -= 0.45; /* driving a bouncer */
  if (at.y > 1.5) s -= 0.2;
  if (!front && shot === "loft" && Math.abs(angle) < 0.5) s -= 0.25; /* lofting straight off the back foot */
  if (front && legside && at.x < -0.15) s -= 0.2;
  return Math.max(0.15, s);
}

/* Fly a hit ball across the outfield until it stops or reaches the rope. */
export function flyHit(start, speed, launch, angle) {
  const p = { ...start };
  const horiz = speed * Math.cos(launch);
  const v = { x: horiz * Math.sin(angle), y: speed * Math.sin(launch), z: horiz * Math.cos(angle) };
  const samples = [{ t: 0, x: p.x, y: p.y, z: p.z }];
  let t = 0, firstLanding = null, overRope = null, rolling = false;
  while (t < 9) {
    if (rolling) {
      const s = Math.hypot(v.x, v.z);
      const slow = Math.max(0, s - 4.6 * STEP * 4) / (s || 1);
      v.x *= slow; v.z *= slow;
      p.x += v.x * STEP * 4; p.z += v.z * STEP * 4; t += STEP * 4;
      p.y = PITCH.ballRadius;
      if (s < 0.3) { samples.push({ t, x: p.x, y: p.y, z: p.z }); break; }
    } else {
      stepAir(p, v, 0, STEP);
      t += STEP;
      if (p.y <= PITCH.ballRadius && v.y < 0) {
        p.y = PITCH.ballRadius;
        if (!firstLanding) firstLanding = { t, x: p.x, z: p.z, dist: Math.hypot(p.x, p.z) };
        v.y = -v.y * 0.32; v.x *= 0.72; v.z *= 0.72;
        if (Math.abs(v.y) < 1.2) rolling = true;
      }
    }
    const dist = Math.hypot(p.x, p.z);
    if (!overRope && dist >= PITCH.boundary) { overRope = { t, inAir: !firstLanding, x: p.x, z: p.z }; }
    samples.push({ t, x: p.x, y: p.y, z: p.z });
    if (overRope && t - overRope.t > 0.5) break;
  }
  const end = samples[samples.length - 1];
  return { samples, firstLanding, overRope, end, distance: Math.hypot(end.x, end.z), hang: firstLanding ? firstLanding.t : t };
}

/* Resolve the batter's input against a delivery.
   input: { pressTime (s from release, or null), shot, aim: {x, y} } */
export function resolveShot(delivery, input, levelName, rng, { field = false } = {}) {
  const level = LEVELS[levelName] || LEVELS.Club;
  const plan = contactPlan(delivery);
  const base = { plan, delivery };

  if (input.pressTime == null) {
    if (delivery.stumps) return { ...base, kind: "bowled", grade: "leave", runs: 0, out: true, label: "Bowled", detail: "Left it and lost the stumps" };
    return { ...base, kind: "leave", grade: "leave", runs: 0, out: false, label: "Left", detail: "Good leave" };
  }

  const error = input.pressTime + SWING_LEAD[input.shot] - plan.t; /* negative = early */
  const [perfect, good, ok] = level.windows;
  const size = Math.abs(error);
  const grade = size <= perfect ? "perfect" : size <= good ? "good" : size <= ok ? (error < 0 ? "early" : "late") : "miss";

  if (grade === "miss") {
    if (delivery.stumps) return { ...base, kind: "bowled", grade, error, runs: 0, out: true, label: "Bowled", detail: error < 0 ? "Too early" : "Too late" };
    return { ...base, kind: "beaten", grade, error, runs: 0, out: false, label: "Beaten", detail: error < 0 ? "Too early" : "Too late" };
  }

  let angle = aimAngle(input.aim, plan.at.x);
  const timingQ = grade === "perfect" ? 1 : grade === "good" ? 0.82 : 0.55;
  const suit = suitability(input.shot, angle, plan.at, plan.front);
  const quality = Math.max(0.1, Math.min(1, timingQ * suit + rng.range(-0.05, 0.05)));

  /* Timing pulls the ball round: early goes to leg, late goes to off. */
  angle += -error / ok * 0.45;
  angle += rng.range(-0.25, 0.25) * (1 - quality);

  /* Edges: poor quality off the face, worse for balls outside off. */
  const edgeChance = input.shot === "defend" ? 0.06 : Math.max(0, 0.55 - quality) * (plan.at.x < -0.2 ? 1.4 : 0.9);
  if (rng() < edgeChance) {
    const edgeAngle = -Math.PI + rng.range(0.25, 0.9);
    const flight = flyHit(plan.at, rng.range(14, 24), rng.range(0.03, 0.22), edgeAngle);
    /* in a match the real fielders decide catches (field: true) */
    const caught = !field && flight.firstLanding && flight.firstLanding.dist < 26 && rng() < 0.55;
    const runs = caught ? 0 : runsFor(flight);
    return { ...base, kind: caught ? "caught" : "edge", grade, error, quality, angle: edgeAngle, flight, runs, out: caught, label: caught ? "Caught at slip" : runs >= 4 ? "Four" : "Edged", detail: caught ? "Thick edge, straight to slip" : "Outside edge" };
  }

  let speed, launch;
  if (input.shot === "defend") {
    speed = rng.range(2.5, 5.5);
    launch = -0.15;
  } else if (input.shot === "loft") {
    speed = 12 + 28 * quality * quality;
    launch = quality > 0.72 ? rng.range(0.36, 0.52) : rng.range(0.7, 1.05);
  } else {
    speed = 10 + 25 * quality + rng.range(-3, 2.5);
    launch = quality > 0.65 ? rng.range(0.02, 0.1) : rng.range(0.12, 0.3);
  }
  const flight = flyHit(plan.at, speed, launch, angle);

  /* In the nets there are no fielders, so judge the chance the shot would
     have been caught in a match. */
  let out = false, label, detail;
  const land = flight.firstLanding;
  if (field) {
    /* the match decides catches and runs with its fielders */
  } else if (input.shot === "loft" && !(flight.overRope && flight.overRope.inAir) && land && land.dist > 18 && quality < 0.62) {
    out = rng() < 0.75;
  } else if (input.shot === "ground" && launch > 0.12 && land && land.dist > 7 && land.dist < 32) {
    out = rng() < 0.4;
  }
  const runs = out ? 0 : runsFor(flight);
  if (out) { label = "Caught"; detail = suit < 0.65 ? "Wrong shot for that ball" : input.shot === "loft" ? "Didn't get hold of it" : "Hit it in the air"; }
  else if (runs === 6) { label = "Six"; detail = gradeText(grade); }
  else if (runs === 4) { label = "Four"; detail = gradeText(grade); }
  else if (input.shot === "defend") { label = "Defended"; detail = gradeText(grade); }
  else { label = runs === 0 ? "Dot ball" : runs === 1 ? "1 run" : `${runs} runs`; detail = gradeText(grade); }
  if (!out && suit < 0.65 && runs < 4 && input.shot !== "defend") detail = "Wrong shot for that ball";
  return { ...base, kind: "hit", shot: input.shot, grade, error, quality, suit, angle, flight, runs, out, label, detail };
}

function gradeText(grade) {
  return { perfect: "Perfect timing", good: "Good timing", early: "Slightly early", late: "Slightly late" }[grade] || "";
}

/* Runs a shot would have earned with a normal field. */
export function runsFor(flight) {
  if (flight.overRope) return flight.overRope.inAir ? 6 : 4;
  const d = flight.distance;
  if (d < 12) return 0;
  if (d < 32) return 1;
  if (d < 48) return 2;
  return 3;
}
