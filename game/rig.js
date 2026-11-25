/* ==========================================================================
   The squad rig: one character model for every role, one skeleton for every clip.

   assets/players/rig/character.glb holds the skeleton plus outfit pieces
   (body, helmet, cap, umpire_hat, bat_pads, keeper_pads, bat_gloves,
   keeper_gloves), each at LOD0/1/2. A player is the body plus its role's
   pieces, merged into one SkinnedMesh per LOD, so each player is one draw call.
   All pieces sample one 32x16 palette; a team kit is a repainted palette.

   Clips live in anim_<group>.glb packs and bind by bone name, so every clip
   plays on every player. Props (bat, ball, stumps, bails) are separate models.
   Built by tools/blender/build_all.py.
   ========================================================================== */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const RIG = new URL("../assets/players/rig/", import.meta.url).href;
const PROPS = new URL("../assets/props/", import.meta.url).href;
const loader = new GLTFLoader();

export const KITS = {
  blue: { shirt: "#1f5fbf", trousers: "#1b2a55", helmet: "#14213d", cap: "#14213d", trim: "#f2b705", badge: "#f2b705", grip: "#c8102e" },
  green: { shirt: "#0f7a3d", trousers: "#0b3d22", helmet: "#0b3d22", cap: "#0b3d22", trim: "#f2c200", badge: "#f2c200", grip: "#111111" },
  whites: { shirt: "#f4f2ea", trousers: "#f4f2ea", helmet: "#1c2541", cap: "#1c2541", trim: "#1c2541", badge: "#d4af37", grip: "#2a4d9b" },
  umpire: { shirt: "#f4f2ea", sleeve: "#f4f2ea", trousers: "#2b2f36", hat: "#f2efe6", trim: "#f4f2ea" }
};

let shared = null;
const palettes = new Map();

/* Load the character, the animation packs and the props once. */
export function loadRig(groups = ["batting", "bowling", "fielding", "umpire"]) {
  if (shared) return shared;
  shared = (async () => {
    const [manifest, charBuf, ...packs] = await Promise.all([
      fetch(RIG + "clips.json").then((r) => r.json()),
      fetch(RIG + "character.glb").then((r) => r.arrayBuffer()),
      ...groups.map((g) => loader.loadAsync(RIG + `anim_${g}.glb`))
    ]);
    const clips = {};
    for (const pack of packs) for (const clip of pack.animations) clips[clip.name] = clip;
    const [bat, ball, stumps, bails] = await Promise.all(["bat", "ball", "stumps", "bails"].map((n) => loader.loadAsync(PROPS + n + ".glb")));
    const props = { bat: bat.scene, ball: ball.scene, stumps: stumps.scene, bails: bails.scene };
    return { manifest, charBuf, clips, props, createPlayer, kitTexture: (kit) => paletteTexture(manifest, kit) };
  })();
  return shared;
}

/* One canvas texture per kit, shared by every player in that kit. */
function paletteTexture(manifest, kit) {
  const key = JSON.stringify(kit);
  if (palettes.has(key)) return palettes.get(key);
  const { size, cell, columns, regions } = manifest.palette;
  const base = { skin: "#b98563", white: "#f1f1ec", steel: "#9aa3ad", shoe: "#efefea", sole: "#2b2b2b", wood: "#e2c48f",
    dark: "#1a1410", strap: "#c3c7cc", hair: "#17110c", sticker: "#c8102e", sleeve: kit.skin || "#b98563", hat: "#f2efe6",
    kglove: "#f1f1ec", kweb: "#2b2b2b", kpad: "#f1f1ec", ball: "#b3121f", seam: "#f3e9d2", stump: "#efe6cf", bail: "#efe6cf", logo: "#c8102e" };
  const colors = { ...base, ...kit };
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = size;
  const ctx = canvas.getContext("2d");
  const rows = size[1] / cell;
  regions.forEach((region, i) => {
    ctx.fillStyle = colors[region] || "#ff00ff";
    /* glTF textures are not flipped: row 0 of the palette is the bottom of the image */
    ctx.fillRect((i % columns) * cell, (rows - 1 - Math.floor(i / columns)) * cell, cell, cell);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  palettes.set(key, tex);
  return tex;
}

/* role: batter | bowler | fielder | keeper | umpire */
async function createPlayer(role, { kit = KITS.blue, lod = 0 } = {}) {
  const rig = await shared;
  const gltf = await loader.parseAsync(rig.charBuf.slice(0), RIG);
  const root = gltf.scene;
  const pieces = rig.manifest.outfits[role];
  const byName = {};
  root.traverse((o) => { if (o.isSkinnedMesh) byName[o.name] = o; });
  const material = new THREE.MeshStandardMaterial({ map: paletteTexture(rig.manifest, kit), roughness: 0.72, metalness: 0 });
  const lods = [];
  for (let i = 0; i < 3; i++) {
    const parts = pieces.map((p) => byName[`${p}_LOD${i}`]);
    const first = parts[0];
    const geo = mergeGeometries(parts.map((m) => m.geometry), false);
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.name = `${role}_LOD${i}`;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    first.parent.add(mesh);
    mesh.bind(first.skeleton, first.bindMatrix);
    mesh.visible = i === lod;
    lods.push(mesh);
  }
  for (const m of Object.values(byName)) m.parent.remove(m);

  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  root.updateMatrixWorld(true);

  /* bat: the prop's rest placement matches the bat bone's bind pose */
  let bat = null;
  if (role === "batter") {
    bat = rig.props.bat.clone();
    const boneInv = bones.bat.matrixWorld.clone().invert();
    bat.updateMatrixWorld(true);
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(boneInv);
    holder.add(bat);
    bones.bat.add(holder);
  }
  const ball = rig.props.ball.clone();
  ball.visible = false;
  bones.prop_R.add(ball);

  const mixer = new THREE.AnimationMixer(root);
  let current = null;
  function play(name, { fade = 0.2, loop } = {}) {
    const clip = rig.clips[name];
    if (!clip) throw new Error("unknown clip " + name);
    const info = rig.manifest.clips[name];
    const action = mixer.clipAction(clip);
    const looping = loop ?? info.loop;
    action.reset();
    action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !looping;
    if (current && current !== action && fade > 0) action.crossFadeFrom(current, fade, false);
    else if (current && current !== action) current.stop();
    action.play();
    current = action;
    return action;
  }
  return {
    role, root, bones, mixer, play, bat, ball, lods,
    get action() { return current; },
    setLod(i) { lods.forEach((m, k) => { m.visible = k === i; }); },
    setKit(k) { material.map = paletteTexture(rig.manifest, k); material.needsUpdate = true; },
    update(dt) { mixer.update(dt); }
  };
}
