/* ==========================================================================
   Realistic players: Quaternius "Universal Base Characters" (CC0) driven by
   the pose system in figure.js.

   The simple jointed figure from figure.js stays in the scene as an invisible
   "driver". Each frame every real bone is set to the driver joint's world
   rotation (plus a fixed rest offset), so all the existing batting and
   bowling poses play on the realistic body. The kit is painted onto the body
   in the shader; bat, pads, gloves, helmet and cap are attached to bones.
   ========================================================================== */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildFigure, applyPose } from "./figure.js?v=5";

const BASE = new URL("../assets/players/", import.meta.url).href;
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

/* Driver joint -> model bones that copy its world rotation. */
const MAP = [
  ["hips", "pelvis"], ["spine", "spine_01"], ["spine", "spine_02"], ["chest", "spine_03"],
  ["neck", "neck_01"], ["neck", "Head"],
  ["shL", "upperarm_l"], ["elL", "lowerarm_l"], ["haL", "hand_l"],
  ["shR", "upperarm_r"], ["elR", "lowerarm_r"], ["haR", "hand_r"],
  ["hipL", "thigh_l"], ["knL", "calf_l"], ["anL", "foot_l"],
  ["hipR", "thigh_r"], ["knR", "calf_r"], ["anR", "foot_r"]
];
const T_POSE = { shL: [0, 0, Math.PI / 2], shR: [0, 0, -Math.PI / 2] };
/* Bones the animation clips drive, parents before children. */
const CLIP_BONES = ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
  "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l", "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
  "thigh_l", "calf_l", "foot_l", "ball_l", "thigh_r", "calf_r", "foot_r", "ball_r"];
const ARM_BONE = /clavicle|upperarm|lowerarm|hand/;
const DRIVEN = new Set(MAP.map(([, bone]) => bone));

let assetsPromise = null;
export function loadPlayerAssets() {
  if (!assetsPromise) {
    const tex = (file, srgb = true) => new Promise((resolve, reject) => textureLoader.load(BASE + file, (t) => {
      t.flipY = false;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      resolve(t);
    }, undefined, reject));
    assetsPromise = Promise.all([
      tex("body_dark.webp"), tex("body_light.webp"),
      loader.loadAsync(BASE + "hair_buzzed.gltf"), loader.loadAsync(BASE + "hair_parted.gltf"), loader.loadAsync(BASE + "beard.gltf"),
      loader.loadAsync(BASE + "anims.glb"), loader.loadAsync(BASE + "bat.glb")
    ]).then(([skinDark, skinLight, hairBuzzed, hairParted, beard, anims, bat]) => ({ skinDark, skinLight, hair: { buzzed: hairBuzzed, parted: hairParted }, beard, anims, bat: normalizeBat(bat.scene) }));
  }
  return assetsPromise;
}

/* Take one bat from the model file and line it up with the game's bat:
   handle at the top (y = 0), blade hanging down -y, face towards +z,
   86 cm long. Uses the shape's own principal axes, so the file's
   orientation doesn't matter. */
function normalizeBat(scene) {
  let mesh = null;
  scene.traverse((obj) => { if (obj.isMesh && (!mesh || obj.name === "Cube.001")) mesh = obj; });
  if (!mesh) return null;
  const g = mesh.geometry.clone();
  const pos = g.attributes.position, n = pos.count, v = new THREE.Vector3();
  const centre = new THREE.Vector3();
  for (let i = 0; i < n; i++) centre.add(v.fromBufferAttribute(pos, i));
  centre.divideScalar(n);
  g.translate(-centre.x, -centre.y, -centre.z);
  const principal = (project) => {
    let a = new THREE.Vector3(0.3, 1, 0.2).normalize();
    for (let it = 0; it < 30; it++) {
      const next = new THREE.Vector3();
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i); if (project) v.y = 0; next.addScaledVector(v, v.dot(a)); }
      if (project) next.y = 0;
      a = next.normalize();
    }
    return a;
  };
  /* long axis -> -y */
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(principal(false), new THREE.Vector3(0, -1, 0)));
  /* blade width (second axis) -> x, so the face points along z */
  const wide = principal(true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(wide, new THREE.Vector3(1, 0, 0)));
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  /* the handle is the narrow end: compare widths near each end */
  const span = max.y - min.y;
  let topW = 0, bottomW = 0;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y > max.y - span * 0.1) topW = Math.max(topW, Math.abs(v.x));
    if (v.y < min.y + span * 0.1) bottomW = Math.max(bottomW, Math.abs(v.x));
  }
  if (topW > bottomW) g.rotateX(Math.PI);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.max.y, 0);
  g.scale(0.86 / span, 0.86 / span, 0.86 / span);
  g.computeVertexNormals();
  const bat = new THREE.Mesh(g, mesh.material);
  bat.castShadow = true;
  return bat;
}

/* Paint the kit onto the body using its rest-pose position (T-pose, metres). */
function kitMaterial(base, kit, batter) {
  const material = base.clone();
  const uniforms = {
    uShirt: { value: new THREE.Color(kit.shirt) },
    uTrim: { value: new THREE.Color(kit.trim) },
    uTrousers: { value: new THREE.Color(kit.trousers) },
    uShoe: { value: new THREE.Color("#f3f3f1") },
    uBatter: { value: batter ? 1 : 0 }
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRest;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRest = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vRest;
uniform vec3 uShirt; uniform vec3 uTrim; uniform vec3 uTrousers; uniform vec3 uShoe; uniform float uBatter;
float kitShirt() {
  float ax = abs(vRest.x);
  float torso = step(0.93, vRest.y) * (1.0 - step(1.515 - 0.03 * step(0.04, vRest.z), vRest.y)) * (1.0 - step(0.26, ax));
  float sleeve = step(1.24, vRest.y) * (1.0 - step(1.6, vRest.y)) * step(0.15, ax) * (1.0 - step(0.47, ax));
  return max(torso, sleeve);
}
float kitTrousers() { return step(0.085, vRest.y) * (1.0 - step(0.95, vRest.y)) * (1.0 - step(0.3, abs(vRest.x))); }
float kitShoe() { return 1.0 - step(0.085, vRest.y); }
float kitGlove() { return uBatter * step(0.62, abs(vRest.x)) * step(1.2, vRest.y); }
float kitPad() { return uBatter * step(0.085, vRest.y) * (1.0 - step(0.6, vRest.y)) * (1.0 - step(0.3, abs(vRest.x))); }
float kitMask() { return max(max(max(kitShirt(), kitTrousers()), kitShoe()), max(kitGlove(), kitPad())); }`)
      .replace("#include <map_fragment>", `#include <map_fragment>
{
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float shade = 0.82 + 0.3 * lum;
  float cuff = kitShirt() * step(0.43, abs(vRest.x));
  float collar = kitShirt() * step(1.49, vRest.y) * (1.0 - step(0.2, abs(vRest.x)));
  vec3 shirt = mix(uShirt, uTrim, max(cuff, collar));
  float ridge = 0.9 + 0.1 * step(0.5, fract(abs(vRest.x) * 38.0));
  vec3 pad = vec3(0.95, 0.95, 0.93) * ridge;
  vec3 kit = kitShoe() > 0.5 ? uShoe : kitGlove() > 0.5 ? vec3(0.96) : kitPad() > 0.5 ? pad : (kitShirt() > 0.5 ? shirt : uTrousers);
  diffuseColor.rgb = mix(diffuseColor.rgb, kit * shade, kitMask());
}`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, kitMask());")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, kitMask() * 0.8));");
  };
  material.customProgramCacheKey = () => "wcc-kit";
  return material;
}

function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  return mesh;
}

/* Build a player. Returns the driver joints (used by the game exactly like
   the old figure) plus an update() to call after posing each frame. */
export async function createPlayer({ kit, batter = false, skin = "dark", hair = "buzzed", beard = false }) {
  const assets = await loadPlayerAssets();
  const gltf = await loader.loadAsync(BASE + "player.gltf");
  const model = gltf.scene;

  /* Invisible driver figure, same as before; only its bat stays visible. */
  const driver = buildFigure({ kit, batter });
  driver.root.traverse((obj) => { if (obj.isMesh) obj.visible = false; });
  if (batter) driver.bat.traverse((obj) => { if (obj.isMesh) obj.visible = true; });

  const bones = {};
  let body = null;
  model.traverse((obj) => {
    if (obj.isBone) bones[obj.name] = obj;
    if (obj.isSkinnedMesh) {
      obj.castShadow = true;
      obj.frustumCulled = false;
      if (obj.material && obj.material.name === "MI_Superhero_Male") body = obj;
    }
  });
  if (body) {
    const material = kitMaterial(body.material, kit, batter);
    material.map = skin === "light" ? assets.skinLight : assets.skinDark;
    body.material = material;
  }

  /* Scale the model so its legs match the driver's (keeps feet on the ground). */
  model.updateMatrixWorld(true);
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  bones.thigh_l.getWorldPosition(p); bones.foot_l.getWorldPosition(q);
  const modelLeg = p.y - q.y;
  const driverLeg = 0.45 + 0.43;
  const scale = driverLeg / modelLeg;
  model.scale.setScalar(scale);
  driver.root.add(model);

  /* Rest offsets: driver in T-pose vs model bind pose. */
  applyPose(driver, { ...T_POSE, hipY: 0.95 });
  driver.root.updateMatrixWorld(true);
  /* Give the driver the model's shoulder width and arm lengths, so the bat
     and both hands land where the real arms can reach. */
  const at = (name) => { const v = new THREE.Vector3(); bones[name].getWorldPosition(v); return v; };
  for (const [S, s2] of [["L", "l"], ["R", "r"]]) {
    driver["sh" + S].position.copy(driver.chest.worldToLocal(at("upperarm_" + s2)));
    driver["el" + S].position.y = -at("upperarm_" + s2).distanceTo(at("lowerarm_" + s2));
    driver["ha" + S].position.y = -at("lowerarm_" + s2).distanceTo(at("hand_" + s2));
  }
  driver.root.updateMatrixWorld(true);
  const rootInv = new THREE.Quaternion();
  driver.root.getWorldQuaternion(rootInv).invert();
  const links = [];
  for (const [joint, boneName] of MAP) {
    const bone = bones[boneName];
    if (!bone) continue;
    const dq = new THREE.Quaternion(), bq = new THREE.Quaternion();
    driver[joint].getWorldQuaternion(dq);
    bone.getWorldQuaternion(bq);
    links.push({ joint, bone, offset: dq.clone().invert().multiply(bq) });
  }
  /* Clip layer: the animation skeleton, posed by a mixer, mapped bone by
     bone through rest offsets taken in matching T-poses. */
  const source = assets.anims.scene.clone(true);
  source.scale.setScalar(scale);
  driver.root.add(source);
  const src = {};
  source.traverse((obj) => { if (obj.name) src[obj.name] = obj; });
  const mixer = new THREE.AnimationMixer(source);
  const clips = {};
  for (const clip of assets.anims.animations) {
    /* keep the clips in place: drop any root translation */
    const tracks = clip.tracks.filter((t) => !/^root\.position/.test(t.name));
    clips[clip.name] = mixer.clipAction(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  const tpose = clips.A_TPose;
  tpose.play(); mixer.update(0); source.updateMatrixWorld(true);
  const clipLinks = [];
  for (const name of CLIP_BONES) {
    if (!bones[name] || !src[name]) continue;
    const sq = new THREE.Quaternion(), bq = new THREE.Quaternion();
    src[name].getWorldQuaternion(sq); bones[name].getWorldQuaternion(bq);
    clipLinks.push({ name, bone: bones[name], src: src[name], offset: sq.clone().invert().multiply(bq), rest: bones[name].quaternion.clone(), arm: ARM_BONE.test(name) });
  }
  const srcPelvisRest = new THREE.Vector3(); src.pelvis.getWorldPosition(srcPelvisRest);
  const pelvisRestWorld = new THREE.Vector3(); bones.pelvis.getWorldPosition(pelvisRestWorld);
  const clipPelvisOffset = driver.root.worldToLocal(pelvisRestWorld.clone()).sub(driver.root.worldToLocal(srcPelvisRest.clone()));
  tpose.stop();
  let currentClip = null;
  function playClip(name, fade = 0.25) {
    if (name === currentClip) return;
    const next = name && clips[name];
    const prev = currentClip && clips[currentClip];
    if (next) { next.reset().setEffectiveWeight(1).play(); if (prev) prev.crossFadeTo(next, fade, false); }
    else if (prev) prev.fadeOut(fade);
    currentClip = name;
  }

  /* Pelvis height relative to the driver's hips. */
  const pelvisRest = new THREE.Vector3(), hipsRest = new THREE.Vector3();
  bones.pelvis.getWorldPosition(pelvisRest);
  driver.hips.getWorldPosition(hipsRest);
  const pelvisOffset = driver.root.worldToLocal(pelvisRest.clone()).sub(driver.root.worldToLocal(hipsRest.clone()));

  /* Props on bones, placed while both skeletons are in the T-pose. */
  const white = new THREE.MeshStandardMaterial({ color: "#f6f6f2", roughness: 0.7 });
  const kitMat = (c, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const head = new THREE.Vector3(); bones.Head.getWorldPosition(head);
  const place = (mesh, bone, worldPos) => { mesh.position.copy(worldPos); driver.root.add(mesh); mesh.updateMatrixWorld(true); bone.attach(mesh); };

  if (batter) {
    /* Bat: sits in the model's top (left) hand. */
    /* A mount on the model's hand that keeps the driver hand's orientation,
       so the bat angles in the poses still mean the same thing. */
    const grip = new THREE.Vector3(); bones.hand_l.getWorldPosition(grip);
    grip.x += 0.05;
    const mount = new THREE.Object3D();
    driver.root.add(mount);
    mount.position.copy(grip);
    driver.haL.getWorldQuaternion(mount.quaternion);
    mount.updateMatrixWorld(true);
    bones.hand_l.attach(mount);
    mount.add(driver.bat);
    driver.bat.position.set(0, -0.02, 0);
    /* swap the simple box bat for the modelled one */
    if (assets.bat) {
      driver.bat.children.forEach((child) => { if (child.isMesh) child.visible = false; });
      const realBat = assets.bat.clone();
      realBat.position.y = 0.02;
      driver.bat.add(realBat);
    }
    driver.batHandle = new THREE.Object3D();
    driver.batHandle.position.y = -0.12;
    driver.bat.add(driver.batHandle);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135 * scale, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), kitMat(kit.helmet, 0.35));
    helmet.castShadow = true;
    place(helmet, bones.Head, head.clone().add(new THREE.Vector3(0, 0.1 * scale, -0.01)));
    const peak = box(0.22 * scale, 0.015, 0.09, kitMat(kit.helmet, 0.35));
    place(peak, bones.Head, head.clone().add(new THREE.Vector3(0, 0.12 * scale, 0.12 * scale)));
    const grille = new THREE.Mesh(new THREE.TorusGeometry(0.115 * scale, 0.007, 4, 18, Math.PI), kitMat("#9aa3ae", 0.3));
    grille.rotation.set(Math.PI / 2 + 0.25, 0, 0);
    place(grille, bones.Head, head.clone().add(new THREE.Vector3(0, 0.04 * scale, 0.05 * scale)));
  } else {
    const hairScene = assets.hair[hair] || assets.hair.buzzed;
    const hairMesh = hairScene.scene.clone(true);
    hairMesh.scale.setScalar(scale);
    hairMesh.traverse((obj) => { if (obj.isMesh) obj.castShadow = true; });
    driver.root.add(hairMesh); hairMesh.updateMatrixWorld(true); bones.Head.attach(hairMesh);
    if (beard) {
      const beardMesh = assets.beard.scene.clone(true);
      beardMesh.scale.setScalar(scale);
      driver.root.add(beardMesh); beardMesh.updateMatrixWorld(true); bones.Head.attach(beardMesh);
    }
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.122 * scale, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), kitMat(kit.trim, 0.6));
    cap.castShadow = true;
    place(cap, bones.Head, head.clone().add(new THREE.Vector3(0, 0.1 * scale, -0.01)));
    const brim = box(0.17 * scale, 0.012, 0.1, kitMat(kit.trim, 0.6));
    place(brim, bones.Head, head.clone().add(new THREE.Vector3(0, 0.15 * scale, 0.11 * scale)));
    /* Ball sits in the model's right hand. */
    bones.hand_r.attach(driver.ballHold);
  }

  /* Curl the fingers into a grip. */
  for (const [name, bone] of Object.entries(bones)) {
    if (/^(index|middle|ring|pinky)_0[123]_[lr]$/.test(name)) bone.rotateZ(name.endsWith("_l") ? -0.9 : 0.9);
  }

  /* Two-bone IK: bend the elbow, then aim the arm so the hand reaches a target. */
  const S = new THREE.Vector3(), E = new THREE.Vector3(), H = new THREE.Vector3(), T = new THREE.Vector3();
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), axis = new THREE.Vector3();
  const rq = new THREE.Quaternion(), wq = new THREE.Quaternion(), pq = new THREE.Quaternion();
  function rotateWorld(bone, q) {
    bone.getWorldQuaternion(wq).premultiply(q);
    bone.parent.getWorldQuaternion(pq).invert();
    bone.quaternion.copy(pq.multiply(wq));
    bone.updateMatrixWorld(true);
  }
  const G = new THREE.Vector3(), SL = new THREE.Vector3(), SR = new THREE.Vector3(), saveQ = new THREE.Quaternion();
  const armLength = (side) => { const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    bones["upperarm_" + side].getWorldPosition(a); bones["lowerarm_" + side].getWorldPosition(b); bones["hand_" + side].getWorldPosition(c);
    return a.distanceTo(b) + b.distanceTo(c); };
  const armL = armLength("l"), armR = armLength("r");
  function clampTo(point, centre, radius) {
    const d = point.distanceTo(centre);
    if (d > radius) point.sub(centre).multiplyScalar(radius / d).add(centre);
  }
  function setWorldQuaternion(bone, q) {
    bone.parent.getWorldQuaternion(pq).invert();
    bone.quaternion.copy(pq.multiply(q));
    bone.updateMatrixWorld(true);
  }
  function solveArm(upper, lower, hand, target) {
    upper.getWorldPosition(S); lower.getWorldPosition(E); hand.getWorldPosition(H);
    const a = S.distanceTo(E), b = E.distanceTo(H);
    const d = Math.min(S.distanceTo(target), (a + b) * 0.995);
    v1.subVectors(S, E); v2.subVectors(H, E);
    const current = v1.angleTo(v2);
    const wanted = Math.acos(THREE.MathUtils.clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
    axis.crossVectors(v1, v2);
    if (axis.lengthSq() > 1e-8) { rq.setFromAxisAngle(axis.normalize(), wanted - current); rotateWorld(lower, rq); }
    hand.getWorldPosition(H);
    v1.subVectors(H, S).normalize(); v2.subVectors(target, S).normalize();
    rq.setFromUnitVectors(v1, v2);
    rotateWorld(upper, rq);
  }

  const tmpQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), hipsPos = new THREE.Vector3();
  const driverWorld = new Map(), clipQ = new THREE.Quaternion(), drvQ = new THREE.Quaternion(), clipPos = new THREE.Vector3();
  /* layer: { clip, weight (1 = clip only), armWeight, timeScale, dt } */
  function update(layer = {}) {
    const weight = layer.clip ? (layer.weight ?? 1) : 0;
    const armWeight = layer.clip ? (layer.armWeight ?? weight) : 0;
    playClip(layer.clip || null, layer.fade ?? 0.25);
    if (layer.clip && clips[layer.clip]) clips[layer.clip].timeScale = layer.timeScale ?? 1;
    mixer.update(layer.dt || 0);
    for (const link of clipLinks) if (!DRIVEN.has(link.name)) link.bone.quaternion.copy(link.rest);
    driver.root.updateMatrixWorld(true);
    /* Pelvis follows the driver's hips. */
    driver.hips.getWorldPosition(hipsPos);
    const local = driver.root.worldToLocal(hipsPos).add(pelvisOffset);
    driver.root.localToWorld(local);
    bones.pelvis.parent.worldToLocal(local);
    bones.pelvis.position.copy(local);
    /* Bones copy the driver's world rotations, parents first. */
    for (const link of links) {
      driver[link.joint].getWorldQuaternion(tmpQ).multiply(link.offset);
      link.bone.parent.getWorldQuaternion(parentQ);
      link.bone.quaternion.copy(parentQ.invert().multiply(tmpQ));
      link.bone.updateMatrixWorld(true);
    }
    /* Blend in the clip layer. */
    if (weight > 0.001 || armWeight > 0.001) {
      source.updateMatrixWorld(true);
      driverWorld.clear();
      for (const link of clipLinks) driverWorld.set(link.name, link.bone.getWorldQuaternion(new THREE.Quaternion()));
      src.pelvis.getWorldPosition(clipPos);
      const clipLocal = driver.root.worldToLocal(clipPos).add(clipPelvisOffset);
      driver.root.localToWorld(clipLocal);
      bones.pelvis.parent.worldToLocal(clipLocal);
      bones.pelvis.position.lerp(clipLocal, weight);
      bones.pelvis.updateMatrixWorld(true);
      for (const link of clipLinks) {
        const w = link.arm ? armWeight : weight;
        if (w <= 0.001) {
          drvQ.copy(driverWorld.get(link.name));
        } else {
          link.src.getWorldQuaternion(clipQ).multiply(link.offset);
          drvQ.copy(driverWorld.get(link.name)).slerp(clipQ, w);
        }
        link.bone.parent.getWorldQuaternion(parentQ);
        link.bone.quaternion.copy(parentQ.invert().multiply(drvQ));
        link.bone.updateMatrixWorld(true);
      }
    }
    /* Batter: both hands on the handle. Pull the grip to a point both arms
       can reach, move the top hand there (keeping the bat angle), then put
       the bottom hand on the handle just below it. */
    if (batter && driver.batHandle && armWeight < 0.5) {
      bones.hand_l.getWorldQuaternion(saveQ);
      bones.hand_l.getWorldPosition(G);
      bones.upperarm_l.getWorldPosition(SL);
      bones.upperarm_r.getWorldPosition(SR);
      for (let i = 0; i < 3; i++) {
        clampTo(G, SR, armR * 0.86);
        clampTo(G, SL, armL * 0.98);
      }
      solveArm(bones.upperarm_l, bones.lowerarm_l, bones.hand_l, G);
      setWorldQuaternion(bones.hand_l, saveQ);
      driver.batHandle.getWorldPosition(T);
      solveArm(bones.upperarm_r, bones.lowerarm_r, bones.hand_r, T);
    }
  }
  return { driver, model, bones, update, scale };
}
