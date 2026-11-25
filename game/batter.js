/* ==========================================================================
   The batter: the bowling pack's cricketer model (realistic proportions)
   in the team's kit, driven by our hand-made batting poses.

   Calibration: we read the model's loaded rest pose (Y-up, metres after
   scaling), point each limb of the invisible driver figure along
   the matching model limb, and keep a rest offset per bone. Each frame
   every bone takes the driver joint's world rotation plus that offset.
   ========================================================================== */
import * as THREE from "three";
import { buildFigure } from "./figure.js?v=4";
import { loadCricketer, dress } from "./bowler.js?v=7";

const MAP = [
  ["hips", "Hips"], ["spine", "Spine"], ["spine", "Spine1"], ["chest", "Spine2"],
  ["neck", "Neck"], ["neck", "Head"],
  ["shL", "LeftArm"], ["elL", "LeftForeArm"], ["haL", "LeftHand"],
  ["shR", "RightArm"], ["elR", "RightForeArm"], ["haR", "RightHand"],
  ["hipL", "LeftUpLeg"], ["knL", "LeftLeg"], ["anL", "LeftFoot"],
  ["hipR", "RightUpLeg"], ["knR", "RightLeg"], ["anR", "RightFoot"]
];
/* driver joint -> [limb start bone, limb end bone] used to aim the driver at calibration */
const LIMBS = {
  shL: ["LeftArm", "LeftForeArm"], elL: ["LeftForeArm", "LeftHand"],
  shR: ["RightArm", "RightForeArm"], elR: ["RightForeArm", "RightHand"],
  hipL: ["LeftUpLeg", "LeftLeg"], knL: ["LeftLeg", "LeftFoot"],
  hipR: ["RightUpLeg", "RightLeg"], knR: ["RightLeg", "RightFoot"]
};

export async function createBatter({ kit }) {
  const { fbx, bones, tex } = await loadCricketer();
  dress(fbx, tex);
  const mat = (o) => o.material;
  fbx.traverse((obj) => {
    if (!obj.isMesh) return;
    if (/OutfitTop/.test(obj.name)) { mat(obj).map = null; mat(obj).color.set(kit.shirt); mat(obj).needsUpdate = true; }
    if (/OutfitBottom/.test(obj.name)) { mat(obj).color.set(kit.trousers); }
    if (/^HairS/.test(obj.name)) obj.visible = false;        /* under the helmet */
  });

  /* ---- rest pose as loaded: already Y-up, facing +z, in centimetres ---- */
  fbx.updateMatrixWorld(true);
  const restPos = {}, restQ = {};
  for (const [name, bone] of Object.entries(bones)) {
    restPos[name] = bone.getWorldPosition(new THREE.Vector3());
    restQ[name] = bone.getWorldQuaternion(new THREE.Quaternion());
  }

  /* ---- scale: model legs match the driver's legs ---- */
  const legCm = restPos.LeftUpLeg.distanceTo(restPos.LeftLeg) + restPos.LeftLeg.distanceTo(restPos.LeftFoot);
  const scale = (0.45 + 0.43) / (legCm / 100);
  fbx.scale.setScalar(0.01 * scale);
  const at = (name) => restPos[name].clone().multiplyScalar(0.01 * scale);   /* metres, model frame */

  /* ---- driver figure, sized like the model and aimed along its limbs ---- */
  const driver = buildFigure({ kit, batter: true });
  driver.root.traverse((obj) => { if (obj.isMesh) obj.visible = false; });
  driver.root.add(fbx);
  driver.hips.position.y = at("Hips").y;
  driver.root.updateMatrixWorld(true);
  for (const [S, side] of [["L", "Left"], ["R", "Right"]]) {
    driver["sh" + S].position.copy(driver.chest.worldToLocal(at(side + "Arm")));
    driver["el" + S].position.y = -at(side + "Arm").distanceTo(at(side + "ForeArm"));
    driver["ha" + S].position.y = -at(side + "ForeArm").distanceTo(at(side + "Hand"));
  }
  driver.root.updateMatrixWorld(true);
  const down = new THREE.Vector3(0, -1, 0), dir = new THREE.Vector3(), pq = new THREE.Quaternion();
  for (const joint of ["shL", "elL", "shR", "elR", "hipL", "knL", "hipR", "knR"]) {
    const [a, b] = LIMBS[joint];
    dir.subVectors(at(b), at(a)).normalize();
    const worldQ = new THREE.Quaternion().setFromUnitVectors(down, dir);
    driver[joint].parent.getWorldQuaternion(pq);
    driver[joint].quaternion.copy(pq.invert().multiply(worldQ));
    driver[joint].updateMatrixWorld(true);
  }
  driver.root.updateMatrixWorld(true);

  /* ---- per-bone rest offsets ---- */
  const links = [];
  for (const [joint, name] of MAP) {
    if (!bones[name]) continue;
    const dq = new THREE.Quaternion(); driver[joint].getWorldQuaternion(dq);
    links.push({ joint, bone: bones[name], offset: dq.invert().multiply(restQ[name]) });
  }
  const hipsRest = new THREE.Vector3(); driver.hips.getWorldPosition(hipsRest);
  const pelvisOffset = at("Hips").sub(driver.root.worldToLocal(hipsRest.clone()));

  /* ---- retarget each frame ---- */
  const tmpQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), hipsPos = new THREE.Vector3();
  function retarget() {
    driver.root.updateMatrixWorld(true);
    driver.hips.getWorldPosition(hipsPos);
    const local = driver.root.worldToLocal(hipsPos).add(pelvisOffset);
    driver.root.localToWorld(local);
    bones.Hips.parent.updateMatrixWorld(true);
    bones.Hips.position.copy(bones.Hips.parent.worldToLocal(local));
    for (const link of links) {
      driver[link.joint].getWorldQuaternion(tmpQ).multiply(link.offset);
      link.bone.parent.getWorldQuaternion(parentQ);
      link.bone.quaternion.copy(parentQ.invert().multiply(tmpQ));
      link.bone.updateMatrixWorld(true);
    }
  }
  retarget();

  /* ---- kit: bat, gloves, pads, helmet ---- */
  const white = new THREE.MeshStandardMaterial({ color: "#f6f6f2", roughness: 0.7 });
  const wp = (name) => { const v = new THREE.Vector3(); bones[name].getWorldPosition(v); return v; };
  const place = (mesh, bone, world) => { driver.root.add(mesh); mesh.position.copy(driver.root.worldToLocal(world.clone())); mesh.updateMatrixWorld(true); bone.attach(mesh); mesh.castShadow = true; return mesh; };

  /* bat mount keeps the driver hand's orientation, so the pose bat angles hold */
  const mount = new THREE.Object3D();
  driver.root.add(mount);
  mount.position.copy(driver.root.worldToLocal(wp("LeftHand").add(wp("LeftHand").sub(wp("LeftForeArm")).normalize().multiplyScalar(0.06))));
  driver.haL.getWorldQuaternion(mount.quaternion);
  mount.updateMatrixWorld(true);
  bones.LeftHand.attach(mount);
  mount.add(driver.bat);
  driver.bat.position.set(0, 0, 0);
  driver.batHandle = new THREE.Object3D();
  driver.batHandle.position.y = -0.12;
  driver.bat.add(driver.batHandle);
  driver.bat.traverse((obj) => { if (obj.isMesh) obj.visible = true; });

  const UP = new THREE.Vector3(0, 1, 0);
  const along = (mesh, from, to) => { mesh.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize()); return mesh; };
  for (const side of ["Left", "Right"]) {
    const elbow = wp(side + "ForeArm"), wrist = wp(side + "Hand");
    const fingers = wp(side + "HandMiddle1") || wrist.clone().add(wrist.clone().sub(elbow).setLength(0.08));
    const glove = along(new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.07, 4, 8), white), wrist, fingers);
    glove.scale.set(1.1, 1, 0.85);
    place(glove, bones[side + "Hand"], wrist.clone().lerp(fingers, 0.7));
    const cuff = along(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.09, 10), white), elbow, wrist);
    place(cuff, bones[side + "ForeArm"], elbow.clone().lerp(wrist, 0.84));
    /* pads: from just above the knee down to the top of the boot, on the front of the shin */
    const hip = wp(side + "UpLeg"), knee = wp(side + "Leg"), ankle = wp(side + "Foot");
    const top = knee.clone().lerp(hip, 0.16), bottom = ankle.clone().lerp(knee, 0.08);
    const pad = along(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, top.distanceTo(bottom) - 0.08, 4, 12), white), bottom, top);
    pad.scale.set(1.15, 1, 0.8);
    place(pad, bones[side + "Leg"], top.clone().lerp(bottom, 0.5).add(new THREE.Vector3(0, 0, 0.035)));
    const kneeRoll = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 8), white);
    kneeRoll.scale.set(1.15, 0.8, 0.85);
    place(kneeRoll, bones[side + "Leg"], knee.clone().add(new THREE.Vector3(0, 0.02, 0.05)));
  }

  /* helmet: shell over the skull, peak over the eyes, grille in front of the face */
  const helmetMat = new THREE.MeshStandardMaterial({ color: kit.helmet, roughness: 0.3, metalness: 0.1 });
  const head = wp("Head"), crown = wp("HeadTop_End"), eye = wp("LeftEye").lerp(wp("RightEye"), 0.5);
  const skull = head.distanceTo(crown) * 0.54;
  const centre = new THREE.Vector3(0, eye.y + skull * 0.15, head.z + (crown.z - head.z) * 0.6 - skull * 0.12);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(skull * 1.13, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), helmetMat);
  shell.scale.set(0.95, 1, 1.08);
  place(shell, bones.Head, centre);
  const peak = new THREE.Mesh(new THREE.CylinderGeometry(skull * 1.16, skull * 1.2, 0.012, 20, 1, false, -Math.PI * 0.42, Math.PI * 0.84), helmetMat);
  peak.rotation.x = -0.12;
  place(peak, bones.Head, new THREE.Vector3(centre.x, eye.y + skull * 0.3, centre.z + 0.012));
  const steel = new THREE.MeshStandardMaterial({ color: "#8e98a4", roughness: 0.35, metalness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(new THREE.TorusGeometry(skull * (1.18 - i * 0.04), 0.0045, 4, 20, Math.PI), steel);
    bar.rotation.x = Math.PI / 2;
    bar.scale.set(0.9, 1.05, 1);
    place(bar, bones.Head, new THREE.Vector3(centre.x, eye.y - skull * (0.18 + i * 0.32), centre.z));
  }
  for (const x of [-0.35, 0.35]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, skull * 0.75, 4), steel);
    place(strut, bones.Head, new THREE.Vector3(centre.x + x * skull, eye.y - skull * 0.5, centre.z + skull * 1.18 * Math.cos(Math.asin(x)) * 1.05));
  }

  /* ---- grip: both hands on the handle (same solver as before) ---- */
  const S = new THREE.Vector3(), E = new THREE.Vector3(), H = new THREE.Vector3(), T = new THREE.Vector3(), G = new THREE.Vector3();
  const SL = new THREE.Vector3(), SR = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), axis = new THREE.Vector3();
  const rq = new THREE.Quaternion(), wq = new THREE.Quaternion(), qq = new THREE.Quaternion(), saveQ = new THREE.Quaternion();
  const armLen = (side) => at(side + "Arm").distanceTo(at(side + "ForeArm")) + at(side + "ForeArm").distanceTo(at(side + "Hand"));
  const armL = armLen("Left"), armR = armLen("Right");
  function rotateWorld(bone, rot) { bone.getWorldQuaternion(wq).premultiply(rot); bone.parent.getWorldQuaternion(qq).invert(); bone.quaternion.copy(qq.multiply(wq)); bone.updateMatrixWorld(true); }
  function setWorldQ(bone, rot) { bone.parent.getWorldQuaternion(qq).invert(); bone.quaternion.copy(qq.multiply(rot)); bone.updateMatrixWorld(true); }
  function clampTo(point, centre, radius) { const d = point.distanceTo(centre); if (d > radius) point.sub(centre).multiplyScalar(radius / d).add(centre); }
  function solveArm(upper, lower, hand, target) {
    upper.getWorldPosition(S); lower.getWorldPosition(E); hand.getWorldPosition(H);
    const a = S.distanceTo(E), b = E.distanceTo(H);
    const d = Math.min(S.distanceTo(target), (a + b) * 0.995);
    v1.subVectors(S, E); v2.subVectors(H, E);
    const wanted = Math.acos(THREE.MathUtils.clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
    axis.crossVectors(v1, v2);
    if (axis.lengthSq() > 1e-10) { rq.setFromAxisAngle(axis.normalize(), wanted - v1.angleTo(v2)); rotateWorld(lower, rq); }
    hand.getWorldPosition(H);
    rq.setFromUnitVectors(v1.subVectors(H, S).normalize(), v2.subVectors(target, S).normalize());
    rotateWorld(upper, rq);
  }

  function update() {
    retarget();
    bones.LeftHand.getWorldQuaternion(saveQ);
    bones.LeftHand.getWorldPosition(G);
    bones.LeftArm.getWorldPosition(SL);
    bones.RightArm.getWorldPosition(SR);
    for (let i = 0; i < 3; i++) { clampTo(G, SR, armR * 0.86); clampTo(G, SL, armL * 0.98); }
    solveArm(bones.LeftArm, bones.LeftForeArm, bones.LeftHand, G);
    setWorldQ(bones.LeftHand, saveQ);
    driver.batHandle.getWorldPosition(T);
    solveArm(bones.RightArm, bones.RightForeArm, bones.RightHand, T);
  }

  /* fingers wrap the handle */
  for (const [name, bone] of Object.entries(bones)) {
    if (/Hand(Index|Middle|Ring|Pinky)[123]$/.test(name)) bone.rotateX(0.85);
  }
  return { driver, update, bones, scale, model: fbx };
}
