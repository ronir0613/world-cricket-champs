/* ==========================================================================
   Fielding and running between the wickets for the practice match.
   Plain maths, no graphics (like ball.js), so the 3D match and the CPU's
   running decisions share one model.

   Coordinates as in ball.js: striker's stumps at z = 0, bowler's stumps at
   z = 20.12, off side -x for the right-handed batter. Times are seconds from
   the moment the bat meets the ball.
   ========================================================================== */
import { PITCH, sampleAt } from "./ball.js?v=5";

/* The two ends. "ground" is where a batter stands when he is home. */
export const ENDS = {
  A: { stumps: 0, crease: PITCH.poppingCrease, ground: { x: 0.5, z: 0.45 }, sign: -1 },
  B: { stumps: PITCH.length, crease: PITCH.length - PITCH.poppingCrease, ground: { x: 0.95, z: PITCH.length - 0.55 }, sign: 1 }
};

/* Running: one run (ground to ground, including the turn) takes RUN_TIME;
   the striker sets off RUN_DELAY after playing the shot. */
export const RUN_TIME = 3.0;
export const RUN_DELAY = 0.3;
const RUN_LEN = ENDS.B.ground.z - ENDS.A.ground.z;
/* fraction of a run at which the bat is grounded over the far crease */
export const CREASE_AT = (ENDS.B.crease - ENDS.A.ground.z) / RUN_LEN;

const FIELDER_SPEED = 6.4;      /* m/s flat out */
const REACT = 0.28;             /* s before a fielder moves */
const THROW_SPEED = 27;         /* m/s */
const PICKUP = 0.57;            /* pick up to release (the pickup_throw clip) */
const GATHER = 0.22;            /* take the throw and break the stumps */

/* A normal field for a right-handed batter. Keeper and bowler are fielders too. */
/* Angle of a spot from the striker: 0 straight down the ground, + to leg. */
export function angleFromBat(p) { return Math.atan2(p.x, p.z - 0.55); }

/* The middle of the widest gap in the field inside [lo, hi] (radians). */
export function bestGap(field, lo, hi) {
  const angles = field.filter((f) => f.role === "fielder" && Math.hypot(f.x, f.z) > 8 && f.z > -2).map(angleFromBat);
  let best = (lo + hi) / 2, score = -1;
  for (let a = lo; a <= hi; a += 0.02) {
    const gap = Math.min(...angles.map((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))));
    if (gap > score) { score = gap; best = a; }
  }
  return best;
}

export function fieldPositions(spin) {
  return [
    { id: "keeper", name: "Wicketkeeper", role: "keeper", x: 0.15, z: spin ? -1.1 : -6.2 },
    { id: "slip", name: "Slip", role: "fielder", x: spin ? -1.3 : -1.9, z: spin ? -1.6 : -6.6 },
    { id: "point", name: "Point", role: "fielder", x: -21, z: 2 },
    { id: "cover", name: "Cover", role: "fielder", x: -23, z: 13 },
    { id: "midoff", name: "Mid-off", role: "fielder", x: -9, z: 31 },
    { id: "midon", name: "Mid-on", role: "fielder", x: 9, z: 31 },
    { id: "midwicket", name: "Midwicket", role: "fielder", x: 22, z: 13 },
    { id: "square", name: "Square leg", role: "fielder", x: 24, z: -1 },
    { id: "fine", name: "Fine leg", role: "fielder", x: 15, z: -42 },
    { id: "deep", name: "Deep midwicket", role: "fielder", x: 42, z: 40 },
    { id: "bowler", name: "Bowler", role: "bowler", x: -0.8, z: PITCH.length - 1.6 }
  ];
}

/* When a fielder starting at f could stand at p. */
function reachTime(f, p) {
  return REACT + Math.hypot(p.x - f.x, p.z - f.z) / FIELDER_SPEED;
}

/* Play a hit ball out against the field.
   skill: 0 (club) .. 1 (international) fielding side.
   Returns one of
     { kind: "caught", t, fielder, at, dive }
     { kind: "boundary", t, six }
     { kind: "fielded", t (ball reaches the fielder), fielder, at, arrive (fielder there), collect, release, dropped, fumble } */
export function playOut(flight, field, rng, skill = 0.5) {
  const samples = flight.samples;
  const landT = flight.firstLanding ? flight.firstLanding.t : 0;
  const ropeT = flight.overRope ? flight.overRope.t : Infinity;
  let lastT = -1, dropped = null;
  for (const s of samples) {
    if (s.t - lastT < 1 / 60 && s !== samples[samples.length - 1]) continue;
    lastT = s.t;
    if (s.t >= ropeT) return { kind: "boundary", t: ropeT, six: flight.overRope.inAir };
    const inAir = s.t < landT;
    const dist = Math.hypot(s.x, s.z);
    for (let i = 0; i < field.length; i++) {
      const f = field[i];
      if (dropped && dropped.fielder === i && s.t < dropped.t + 0.9) continue;
      const need = reachTime(f, s);
      const slack = s.t - need;
      if (inAir) {
        /* catchable between the knees and an outstretched hand; a late dive helps */
        if (s.y > 0.15 && s.y < 2.7 && slack > -0.18 && !dropped) {
          const dive = slack < 0.1;
          const run = Math.hypot(s.x - f.x, s.z - f.z);
          let p = 0.9 + skill * 0.06 - run * 0.01 - (dive ? 0.3 : 0) - (s.y < 0.4 || s.y > 2.3 ? 0.12 : 0);
          if (f.role === "keeper") p += 0.04;
          if (rng() < Math.max(0.15, p)) return { kind: "caught", t: s.t, fielder: i, at: { x: s.x, y: s.y, z: s.z }, dive };
          dropped = { fielder: i, t: s.t };
          continue;
        }
      } else if (slack >= 0 && s.y < 0.9) {
        /* ground fielding: a fast ball can only be stopped by a fielder close to
           its line (a dive at most); slower balls can be cut off from further away */
        const speed = speedAt(samples, s.t);
        if (speed > 15 && Math.hypot(s.x - f.x, s.z - f.z) > 2.4 + slack * 3) continue;
        const fumble = rng() < Math.max(0.02, 0.1 - skill * 0.06) + (speed > 24 ? 0.12 : 0);
        if (fumble && dist < PITCH.boundary - 6 && speed > 24) continue;    /* misfield: through him */
        return fielded(i, s, need, fumble ? 0.8 : 0, !!dropped);
      }
    }
  }
  /* the ball stopped short of everyone: the nearest fielder runs to it */
  const end = samples[samples.length - 1];
  let best = 0, bestT = Infinity;
  field.forEach((f, i) => { const t = reachTime(f, end); if (t < bestT) { bestT = t; best = i; } });
  return fielded(best, end, bestT, 0, !!dropped, Math.max(end.t, bestT));

  function fielded(i, s, need, fumble, wasDropped, at = s.t) {
    const arrive = need;
    const collect = Math.max(at, arrive) + fumble;
    return { kind: "fielded", t: s.t, fielder: i, at: { x: s.x, y: Math.min(s.y, 0.6), z: s.z }, arrive, collect, release: collect + PICKUP, fumble: fumble > 0, dropped: wasDropped };
  }
}

function speedAt(samples, t) {
  const a = sampleAt(samples, t), b = sampleAt(samples, t + 0.05);
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.05;
}

/* When a throw from p, released at `release`, has the bails off at an end.
   Fielders within a few metres of the stumps run in and break them. */
export function ballAtEnd(fielding, field, endKey) {
  const end = ENDS[endKey];
  const p = fielding.at;
  const d = Math.hypot(p.x, p.z - end.stumps);
  if (d < 4) return { t: fielding.collect + 0.25 + d / 5, throwTime: 0, run: true };
  const throwTime = d / THROW_SPEED + 0.08;
  return { t: fielding.release + throwTime + GATHER, throwTime, run: false };
}

/* ---------- the batters' runs ----------
   p counts runs in progress: 0 = both home, 1.5 = half way through the second.
   The striker starts at end A; on even whole runs he is home at A again. */
export function runnerZ(p, startEnd) {
  const k = Math.floor(p), f = p - k;
  const fromA = (startEnd === "A") === (k % 2 === 0);
  const a = fromA ? ENDS.A.ground : ENDS.B.ground, b = fromA ? ENDS.B.ground : ENDS.A.ground;
  const bulge = (fromA ? 0.55 : -1.5) * Math.sin(Math.PI * f);
  return { x: a.x + (b.x - a.x) * f + bulge, z: a.z + (b.z - a.z) * f, heading: fromA ? "B" : "A", f };
}

/* Is the batter nearer to endKey out of his ground at progress p? */
export function outOfGround(p, endKey) {
  const k = Math.floor(p), f = p - k;
  if (f === 0) return null;
  /* both batters are on the pitch; find who is nearer this end */
  const striker = runnerZ(p, "A"), other = runnerZ(p, "B");
  const endZ = ENDS[endKey].stumps;
  const near = Math.abs(striker.z - endZ) <= Math.abs(other.z - endZ) ? { who: "A", r: striker } : { who: "B", r: other };
  const inGround = endKey === "A" ? near.r.z <= ENDS.A.crease : near.r.z >= ENDS.B.crease;
  return inGround ? null : near.who;          /* "A" = the batter who started at A */
}

/* Time (from the shot) at which run n is complete, running flat out. */
export function runDoneAt(n) {
  return RUN_DELAY + (n - 1 + CREASE_AT) * RUN_TIME;
}

/* How many runs a sensible batting pair takes against this fielding.
   risk: > 0 cuts it finer (and is sometimes run out). */
export function chooseRuns(fielding, field, risk = 0) {
  if (fielding.kind !== "fielded") return 0;
  const back = Math.min(ballAtEnd(fielding, field, "A").t, ballAtEnd(fielding, field, "B").t);
  let n = 0;
  while (n < 3 && runDoneAt(n + 1) + 0.35 - risk < back) n++;
  return n;
}

/* Where the fielder throws: the end where a batter is furthest from home
   when the ball gets there; to the keeper if nobody is in danger. */
export function throwEnd(fielding, field, runnerP, runnerTarget, now) {
  let best = null;
  for (const key of ["A", "B"]) {
    const arrive = ballAtEnd(fielding, field, key).t;
    const pThen = Math.min(runnerTarget, runnerP + Math.max(0, arrive - now) / RUN_TIME);
    const out = outOfGround(pThen, key);
    if (out) {
      const short = Math.min(runnerTarget, Math.ceil(pThen - 1e-6)) - pThen;
      if (!best || short > best.short) best = { key, short };
    }
  }
  if (best) return best.key;
  return fielding.at.z > PITCH.length + 8 ? "B" : "A";
}
