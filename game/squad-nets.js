/* ==========================================================================
   The squad rig (game/rig.js) in the Practice Nets.

   createSquadBatter: plays the batting clips from the nets' shot state.
     Each stroke maps to a clip; the clip starts part-way in and runs just
     fast enough that the bat reaches the ball at the moment the game decided,
     and the batter shifts and turns a little so the bat's sweet spot meets
     the ball where it is.
   createSquadBowler: same API as bowler.js (root, ballHold, prepare, update).
     He runs in on the run-up loop, hands straight into the delivery clip and
     releases the ball from his real hand with his front foot behind the crease.

   Clip spaces (see tools/blender/clips.py): batting clips put the batter at the
   origin with the bowler towards +z; bowling clips run towards -z.
   ========================================================================== */
import * as THREE from "three";
import { loadRig } from "./rig.js";

const GROUPS = ["batting", "bowling", "fielding"];    /* fielding: idle and walk for the bowler between balls */
const SWEET = new THREE.Vector3(0, -0.77, 0);   /* bat sweet spot, 0.77 m from the top-hand grip */
const UP = new THREE.Vector3(0, 1, 0);

/* figure.js team kit -> rig palette colours */
export function rigKit(kit, skin) {
  return { shirt: kit.shirt, trousers: kit.trousers, helmet: kit.helmet, cap: kit.helmet,
    trim: kit.trim, badge: kit.trim, grip: kit.trim, skin, sleeve: skin };
}

/* Which clip plays each of the nets' strokes, and the direction (radians from
   straight, + towards leg) that clip naturally hits the ball. */
const STROKES = {
  defendFront: { clip: "forward_defence", dir: 0 },
  defendBack: { clip: "back_defence", dir: 0 },
  cover: { clip: "cover_drive", dir: -0.47 },
  straight: { clip: "straight_drive", dir: 0 },
  flick: { clip: "straight_drive", dir: 0 },
  pull: { clip: "pull", dir: 0.9 },
  cut: { clip: "cut", dir: -1.4 },
  punch: { clip: "back_defence", dir: 0 }
};
function pickStroke(bat) {
  if (bat.shot === "defend" || bat.stroke === "defend") return bat.front ? STROKES.defendFront : STROKES.defendBack;
  if (bat.stroke === "drive") return bat.aim < -0.25 ? STROKES.cover : STROKES.straight;
  return STROKES[bat.stroke] || STROKES.straight;
}

/* Pose a player at one moment of a clip with the root at the origin, run fn, restore. */
function sampleClip(player, name, time, fn) {
  const saved = { p: player.root.position.clone(), r: player.root.rotation.y };
  player.root.position.set(0, 0, 0);
  player.root.rotation.y = 0;
  const action = player.play(name, { fade: 0, loop: false });
  action.time = time;
  player.mixer.update(0);
  player.root.updateMatrixWorld(true);
  const out = fn();
  player.root.position.copy(saved.p);
  player.root.rotation.y = saved.r;
  return out;
}

export async function createSquadBatter({ kit, skin, lod = 0, home }) {
  const rig = await loadRig(GROUPS);
  const player = await rig.createPlayer("batter", { kit: rigKit(kit, skin), lod });
  const batNode = player.bat.getObjectByProperty("isMesh", true) || player.bat;
  const info = (name) => rig.manifest.clips[name];

  /* where the sweet spot is at contact, for each shot clip, with the root at the origin */
  const sweetAt = {};
  for (const s of Object.values(STROKES)) {
    if (sweetAt[s.clip]) continue;
    sweetAt[s.clip] = sampleClip(player, s.clip, info(s.clip).events.contact, () => batNode.localToWorld(SWEET.clone()));
  }
  player.root.position.set(home.x, 0, home.z);
  player.play("stance", { fade: 0 });

  let lastBat = null, current = "stance";
  let swing = null;                       /* { action, contactAt, from, to, yaw, startAt } */
  const target = new THREE.Vector3(home.x, 0, home.z);
  let targetYaw = 0;

  function startSwing(bat, plan, now) {
    const s = pickStroke(bat);
    const contactT = info(s.clip).events.contact;
    const remaining = Math.max(0.05, bat.contactAt - now);
    /* start late enough to finish the backlift in time, at most 2.4x speed */
    const start = Math.max(0, contactT - remaining * 2.4);
    const speed = remaining >= contactT ? 1 : (contactT - start) / remaining;
    const action = player.play(s.clip, { fade: Math.min(0.12, remaining * 0.5), loop: false });
    /* the clip's time is set every frame (timeScale 0; the mixer still runs the
       fade), so the bat is exactly at its contact frame when the ball arrives */
    action.timeScale = 0;
    action.time = start;
    const delay = remaining > contactT ? remaining - contactT : 0;
    /* turn towards the aimed direction (a little), then shift so the sweet spot meets the ball */
    const yaw = bat.shot === "defend" ? 0 : THREE.MathUtils.clamp((bat.aim || 0) - s.dir, -0.3, 0.3);
    const sweet = sweetAt[s.clip].clone().applyAxisAngle(UP, yaw);
    const at = plan ? plan.at : { x: home.x + sweet.x, z: home.z + sweet.z };
    const want = new THREE.Vector3(at.x - sweet.x, 0, at.z - sweet.z);
    want.x = THREE.MathUtils.clamp(want.x, home.x - 0.45, home.x + 0.45);
    want.z = THREE.MathUtils.clamp(want.z, home.z - 0.6, home.z + 0.6);
    swing = { action, contactAt: bat.contactAt, contactT, start, speed, from: player.root.position.clone(), to: want, yaw, startAt: now, delay, remaining };
    current = s.clip;
  }

  /* manual: the caller moves the root and picks clips (running, waiting at
     the non-striker's end); off again returns him to his guard */
  let manual = false;
  function setManual(on) {
    if (on === manual) return;
    manual = on;
    swing = null;
    lastBat = null;
    if (!on) {
      current = "stance";
      player.play("stance", { fade: 0.2 });
      player.root.position.set(home.x, 0, home.z);
      player.root.rotation.y = 0;
      target.set(home.x, 0, home.z);
      targetYaw = 0;
    } else current = null;
  }

  function update(dt, ctx, now) {
    if (manual) { player.update(dt); return; }
    const bat = ctx ? ctx.bat : { phase: "stance" };
    if (bat !== lastBat) {
      lastBat = bat;
      if (bat.phase === "swing") startSwing(bat, ctx && ctx.plan, now);
      else if (bat.phase === "leave") { swing = null; current = "leave"; player.play("leave", { fade: 0.15, loop: false }); }
      else if (current !== "stance" && (bat.phase === "stance" || bat.phase === "recover")) {
        swing = null; current = "stance"; player.play("stance", { fade: 0.45 });
      }
    }
    if (swing) {
      const a = swing.action;
      const clipEnd = a.getClip().duration;
      a.time = now >= swing.contactAt
        ? Math.min(clipEnd, swing.contactT + (now - swing.contactAt))
        : swing.start + Math.max(0, now - swing.startAt - swing.delay) * swing.speed;
      const k = THREE.MathUtils.clamp((now - swing.startAt) / Math.max(0.08, swing.remaining), 0, 1);
      const e = k * k * (3 - 2 * k);
      player.root.position.lerpVectors(swing.from, swing.to, e);
      player.root.rotation.y = swing.yaw * e;
      target.copy(swing.to); targetYaw = swing.yaw;
    } else {
      /* drift back to the guard between balls */
      const settle = current === "stance" ? Math.min(1, dt * 2.5) : 0;
      player.root.position.lerp(target.set(home.x, 0, home.z), settle);
      targetYaw += (0 - targetYaw) * settle;
      player.root.rotation.y = targetYaw;
    }
    player.update(dt);
  }

  return { root: player.root, player, update, setManual, get manual() { return manual; }, get clip() { return current; } };
}

export async function createSquadBowler({ kit, skin, lod = 0 }) {
  const rig = await loadRig(GROUPS);
  const player = await rig.createPlayer("bowler", { kit: rigKit(kit, skin), lod });
  player.ball.visible = false;                  /* the nets draw their own ball at ballHold */
  const ballHold = player.bones.prop_R;
  const v = () => new THREE.Vector3();

  /* measured once per delivery clip, with the root at the origin */
  const CLIPS = {};
  for (const name of ["bowl_fast", "bowl_spin"]) {
    const c = rig.manifest.clips[name];
    const release = c.events.release;
    const hand = sampleClip(player, name, release, () => ballHold.getWorldPosition(v()));
    const toe = sampleClip(player, name, release, () => (player.bones.toe_L || player.bones.foot_L).getWorldPosition(v()));
    const hipsStart = sampleClip(player, name, 0, () => player.bones.hips.getWorldPosition(v()));
    const hipsEnd = sampleClip(player, name, c.duration, () => player.bones.hips.getWorldPosition(v()));
    CLIPS[name] = { name, release, duration: c.duration, hand, toe, hipsStart, hipsEnd };
  }
  const RUN = rig.manifest.clips.bowler_run.duration;
  const POPPING_Z = 20.12 - 1.22;              /* bowler's popping crease */
  const RELEASE_X = { bowl_fast: -0.34, bowl_spin: -0.5 };
  const RUN_SPEED = { bowl_fast: 4.6, bowl_spin: 3.2 };
  /* seconds of run-up before the delivery clip takes over (the nets start the
     run 2.3 s / 1.4 s before release) */
  const RUN_TIME = { bowl_fast: 2.3 - CLIPS.bowl_fast.release, bowl_spin: 1.4 - CLIPS.bowl_spin.release };
  const pivot = v();
  let info = null, mode = null, walkFrom = null;

  /* the nets set every clip's time themselves, so no cross-fades here */
  function setMode(name) {
    if (mode === name) return player.action;
    mode = name;
    const a = player.play(name, { fade: 0, loop: !name.startsWith("bowl_") });
    a.timeScale = 0;
    return a;
  }

  /* Place the delivery so the hand is wide of the stumps at release and the
     front foot lands just behind the popping crease. */
  function place(name) {
    info = CLIPS[name];
    pivot.set(RELEASE_X[info.name] - info.hand.x, 0, POPPING_Z + 0.1 - info.toe.z);
  }
  function prepare(delivery) {
    place(delivery.spin ? "bowl_spin" : "bowl_fast");
    mode = null;
    walkFrom = null;
    update(-info.release);
    return info;
  }

  /* tau: seconds relative to release (negative before) */
  function update(tau) {
    if (!info) place("bowl_fast");
    const start = -info.release, end = info.duration - info.release;
    const speed = RUN_SPEED[info.name];
    if (tau < start - RUN_TIME[info.name]) {
      /* waiting at the top of his mark, facing the batter */
      const a = setMode("field_idle");
      a.time = ((tau % 2) + 2) % 2;
      player.root.position.set(pivot.x + info.hipsStart.x, 0, pivot.z + info.hipsStart.z + RUN_TIME[info.name] * speed);
      player.root.rotation.y = Math.PI;
    } else if (tau < start) {
      /* run-up: in place on the loop, the root carried towards the crease;
         the loop's left foot lands as the delivery clip begins */
      const a = setMode("bowler_run");
      a.time = ((((tau - start) * speed / 3.6) % RUN) + RUN) % RUN;
      player.root.position.set(pivot.x + info.hipsStart.x, 0, pivot.z + info.hipsStart.z + (start - tau) * speed);
      player.root.rotation.y = 0;
    } else if (tau <= end) {
      const a = setMode(info.name);
      a.time = tau + info.release;
      player.root.position.copy(pivot);
      player.root.rotation.y = 0;
      walkFrom = null;
    } else {
      /* turn and walk back towards the mark (the walk faces +z, away from the batter) */
      if (!walkFrom) walkFrom = { x: pivot.x + info.hipsEnd.x, z: pivot.z + info.hipsEnd.z };
      const a = setMode("walk");
      const cycle = rig.manifest.clips.walk.duration;
      a.time = (((tau - end) % cycle) + cycle) % cycle;
      player.root.position.set(walkFrom.x - Math.min(0.6, (tau - end) * 0.4), 0, walkFrom.z + (tau - end) * 1.2);
      player.root.rotation.y = 0;
    }
    player.mixer.update(0);
  }

  return { root: player.root, ballHold, prepare, update, player };
}
