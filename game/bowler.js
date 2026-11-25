/* ==========================================================================
   The bowler: a dressed cricketer model with real bowling animations
   ("Cricket Bowling Animations Pack" by Hamza Khan, Unity Asset Store,
   Standard Unity Asset Store EULA). Loaded straight from the pack's FBX.

   Each clip contains the whole run-up, delivery and follow-through with
   root motion. We pick the clip for the delivery, place the model so the
   bowling hand is at our release point at the release moment, and play
   the clip on the game clock so release lines up with the ball.
   ========================================================================== */
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const BASE = new URL("../assets/players/cricketer/", import.meta.url).href;
/* the bowler's popping crease, 1.22 m in front of the stumps at z = 20.12 */
const POPPING_Z = 20.12 - 1.22;

/* Measured from the clips (centimetres in the model's own space): clip time
   of release, and where the bowling hand is at that moment. */
const CLIPS = {
  fast:   { name: "RightArmFastBowler",       release: 6.35,  handX: -24.8, handZ: 3799.2 },
  medium: { name: "RightArmMediumFastBowler", release: 4.067, handX: -25.0, handZ: 2267.6 },
  off:    { name: "RightArmOffSpinner",       release: 1.617, handX: 19.9,  handZ: 234.2 },
  leg:    { name: "RightArmLegSpinner",       release: 2.433, handX: -14.1, handZ: 343.0 }
};

/* The FBX names its original Unity textures; we apply our own, so answer
   those requests with a blank image instead of a 404. */
function quietManager() {
  const manager = new THREE.LoadingManager();
  const blank = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  manager.setURLModifier((url) => (/\.(png|jpe?g|tga|tiff?|psd|bmp)$/i.test(url) ? blank : url));
  return manager;
}

let texPromise = null, bufferPromise = null;
function loadTextures() {
  if (texPromise) return texPromise;
  const tl = new THREE.TextureLoader();
  const tex = (file, srgb = true) => new Promise((resolve) => tl.load(BASE + file, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; resolve(t); }, undefined, () => resolve(null)));
  texPromise = Promise.all([
    tex("skin.webp"), tex("skin_n.webp", false), tex("shirt.webp"), tex("shirt_n.webp", false),
    tex("trousers_n.webp", false), tex("shoes.webp"), tex("shoes_n.webp", false),
    tex("eye.webp"), tex("teeth.webp"), tex("hair_n.webp", false)
  ]).then(([skin, skinN, shirt, shirtN, trousersN, shoes, shoesN, eye, teeth, hairN]) =>
    ({ skin, skinN, shirt, shirtN, trousersN, shoes, shoesN, eye, teeth, hairN }));
  return texPromise;
}

/* The pack's cricketer, parsed fresh for each player from one download. */
export async function loadCricketer() {
  if (!bufferPromise) bufferPromise = fetch(BASE + "bowler.fbx").then((r) => { if (!r.ok) throw new Error("bowler.fbx " + r.status); return r.arrayBuffer(); });
  const [buffer, tex] = await Promise.all([bufferPromise, loadTextures()]);
  const fbx = new FBXLoader(quietManager()).parse(buffer, BASE);
  const bones = shareSkeleton(fbx);
  return { fbx, bones, tex };
}

/* FBXLoader gives each mesh its own copy of the skeleton, nested under the
   first, and animation only drives the first. Rebind every mesh to one
   shared skeleton and drop the copies. */
export function shareSkeleton(fbx) {
  const armature = fbx.getObjectByName("Armature");
  const master = {}, dupes = [];
  for (const root of armature.children) {
    if (!root.isBone) continue;
    (function walk(bone) {
      if (!master[bone.name]) master[bone.name] = bone;
      for (const child of [...bone.children]) {
        if (!child.isBone) continue;
        if (child.name === bone.name) { dupes.push([bone, child]); continue; }
        walk(child);
      }
    })(root);
  }
  fbx.traverse((obj) => {
    if (!obj.isSkinnedMesh) return;
    const bones = obj.skeleton.bones.map((b) => master[b.name]);
    if (bones.every(Boolean)) obj.bind(new THREE.Skeleton(bones, obj.skeleton.boneInverses), obj.bindMatrix);
  });
  dupes.forEach(([parent, child]) => parent.remove(child));
  return master;
}

export function dress(fbx, tex) {
  fbx.traverse((obj) => {
    if (!obj.isMesh) return;
    const n = obj.name;
    const m = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    if (/Body|Head/.test(n)) { m.map = tex.skin; m.normalMap = tex.skinN; m.roughness = 0.6; }
    else if (/OutfitTop/.test(n)) { m.map = tex.shirt; m.normalMap = tex.shirtN; }
    else if (/OutfitBottom/.test(n)) { m.color.set("#f2f2ee"); m.normalMap = tex.trousersN; m.roughness = 0.85; }
    else if (/FootWear/.test(n)) { m.map = tex.shoes; m.normalMap = tex.shoesN; }
    else if (/Eye/.test(n)) { m.map = tex.eye; m.roughness = 0.2; }
    else if (/Teeth/.test(n)) { m.map = tex.teeth; }
    else if (/Hair|Beard/.test(n)) { m.color.set("#17110c"); m.normalMap = tex.hairN; m.roughness = 0.85; }
    obj.material = m;
    obj.castShadow = true;
    obj.frustumCulled = false;
    /* facial expressions are never seen from the broadcast camera */
    obj.geometry.morphAttributes = {};
    obj.morphTargetInfluences = undefined;
    obj.morphTargetDictionary = undefined;
  });
}

export async function createBowler() {
  const { fbx, bones, tex } = await loadCricketer();
  dress(fbx, tex);

  /* metres, and facing down the pitch (the clips run towards +z) */
  const root = new THREE.Group();
  fbx.scale.setScalar(0.01);
  root.add(fbx);
  root.rotation.y = Math.PI;

  const mixer = new THREE.AnimationMixer(fbx);
  const actions = {};
  for (const clip of fbx.animations) {
    const key = clip.name.split("|").pop();
    /* keep rotations and the hips' travel; drop scale tracks */
    const tracks = clip.tracks.filter((t) => t.name.endsWith(".quaternion") || t.name === "Hips.position");
    actions[key] = mixer.clipAction(new THREE.AnimationClip(key, clip.duration, tracks));
  }

  /* ball sits at the base of the middle finger */
  const ballHold = new THREE.Object3D();
  (bones.RightHandMiddle1 || bones.RightHand).add(ballHold);

  let current = null, info = null;
  const up = new THREE.Vector3(0, 1, 0);
  let yaw = 0;

  /* Right-arm over the wicket: the bowler runs in to the left of the
     stumps, so the hand comes over about half a metre wide of middle
     stump. The run-up comes in on a slight angle. */
  const RELEASE_X = { fast: -0.34, medium: -0.34, off: -0.62, leg: -0.46 };
  const RUN_ANGLE = { fast: -0.035, medium: -0.04, off: -0.07, leg: -0.06 };
  const handLocal = new THREE.Vector3(), pivot = new THREE.Vector3(), turned = new THREE.Vector3();

  /* Pick and place the clip for a delivery. Returns where the hand will
     release the ball, so the flight can be solved from there. */
  function prepare(delivery, level) {
    let kind = CLIPS[delivery.action] ? delivery.action : null;
    if (!kind) kind = delivery.spin ? (delivery.style === "Leg-spin" ? "leg" : "off") : level === "International" ? "fast" : "medium";
    info = CLIPS[kind];
    const action = actions[info.name];
    if (current && current !== action) current.stop();
    current = action;
    current.reset().play();
    current.paused = true;
    /* hand at the release point when the clip reaches the release frame */
    yaw = RUN_ANGLE[kind];
    root.rotation.y = Math.PI + yaw;
    handLocal.set(info.handX * 0.01, 0, info.handZ * 0.01);
    pivot.set(RELEASE_X[kind], 0, delivery.release.z);
    update(0);
    /* slide along the pitch so the front foot lands just behind the popping
       crease at release (a legal delivery, clear of the stumps) */
    root.updateMatrixWorld(true);
    const foot = new THREE.Vector3();
    (bones.LeftToeBase || bones.LeftFoot).getWorldPosition(foot);
    pivot.z += POPPING_Z + 0.1 - foot.z;
    update(0);
    return info;
  }

  /* tau: seconds relative to release (negative before). After release the
     bowler peels away to his left, off the pitch. */
  function update(tau) {
    if (!current || !info) return;
    const clip = current.getClip();
    const t = THREE.MathUtils.clamp(info.release + tau, 0, Math.min(clip.duration - 0.12, info.release + 1.6));
    current.time = t;
    mixer.update(0);
    /* turn about the release point, not the clip's origin far back up the run */
    const k = THREE.MathUtils.smoothstep(tau, 0.1, 1.0);
    const heading = Math.PI + yaw + k * 0.55;
    turned.copy(handLocal).applyAxisAngle(up, heading);
    root.position.copy(pivot).sub(turned);
    root.position.x -= k * 0.6;
    root.rotation.y = heading;
  }

  return { root, ballHold, prepare, update, clips: CLIPS };
}
