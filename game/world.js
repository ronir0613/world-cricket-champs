/* ==========================================================================
   The ground: outfield, pitch, stumps, rope, stands, sight screens, lights
   and the stadium. Everything is built in code, so there are no model files
   to load.
   ========================================================================== */
import * as THREE from "three";
import { PITCH } from "./ball.js?v=5";

function canvasTexture(width, height, draw, repeat) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(repeat[0], repeat[1]); }
  return texture;
}

function noise(ctx, w, h, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const shade = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

/* Outfield: mown stripes, light grain. */
function grassTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const stripes = 16;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? "#3f8a3a" : "#4a9a42";
      ctx.fillRect(0, (i * h) / stripes, w, h / stripes + 1);
    }
    noise(ctx, w, h, 60000, 0.08);
  });
}

/* Pitch: worn strip with creases painted at both ends. */
function pitchTexture() {
  return canvasTexture(256, 2048, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#b9a372"); grad.addColorStop(0.5, "#cdb989"); grad.addColorStop(1, "#b9a372");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 40000, 0.12);
    /* scuffs where the bowlers land */
    ctx.fillStyle = "rgba(120,96,60,0.25)";
    for (const y of [0.16, 0.84]) for (let i = 0; i < 40; i++) ctx.fillRect(w * 0.3 + Math.random() * w * 0.4, h * y + (Math.random() - 0.5) * 60, 6, 4);
    /* The strip runs from z = -1.5 to z = 21.62 (23.12 m). */
    const zToY = (z) => h - ((z + 1.5) / 23.12) * h;
    const mPerPx = w / 3.05;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    const line = (z, half) => ctx.fillRect(w / 2 - half * mPerPx, zToY(z) - 2.5, half * 2 * mPerPx, 5);
    for (const end of [0, PITCH.length]) {
      const dir = end === 0 ? 1 : -1;
      line(end, 1.32);                                   /* bowling crease */
      line(end + dir * PITCH.poppingCrease, 1.52);       /* popping crease */
      for (const x of [-1.32, 1.32]) {                   /* return creases */
        const y1 = zToY(end - dir * 1.0), y2 = zToY(end + dir * PITCH.poppingCrease);
        ctx.fillRect(w / 2 + x * mPerPx - 2.5, Math.min(y1, y2), 5, Math.abs(y2 - y1));
      }
    }
  });
}

/* Stand seating: one sector of rows, aisles at both edges, filled with a
   crowd. "bob" draws the same crowd a little higher, so swapping the two
   makes the crowd look alive. */
const CROWD_SHIRTS = ["#e6e9ef", "#1f5fbf", "#2f6fd6", "#f2c230", "#f08a3c", "#d43c3c", "#3aa35b", "#1d1f24", "#7a1f3d", "#ffffff"];
const CROWD_SKIN = ["#e0b48f", "#c99a76", "#a8774f", "#7d5236", "#5e3d27"];
function crowdLayout(rows, cols, fill, seed) {
  let x = seed;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (c < 3 || c >= cols - 3) continue;                       /* aisles */
    if (rnd() > fill) continue;
    out.push({ r, c, shirt: CROWD_SHIRTS[(rnd() * CROWD_SHIRTS.length) | 0], skin: CROWD_SKIN[(rnd() * CROWD_SKIN.length) | 0], hop: rnd() < 0.55, arms: rnd() < 0.18 });
  }
  return out;
}
function seatTexture({ rows, cols, seat, seatAlt, fill, seed, bob = false, repeat }) {
  const W = 1024, H = Math.round((1024 / cols) * rows * 1.25);
  const people = crowdLayout(rows, cols, fill, seed);
  return canvasTexture(W, H, (ctx, w, h) => {
    const cw = w / cols, rh = h / rows;
    ctx.fillStyle = "#2a2f38"; ctx.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) {
      /* concrete step, then the seat row on it */
      ctx.fillStyle = r % 2 ? "#3a404a" : "#353b45"; ctx.fillRect(0, r * rh, w, rh);
      for (let c = 3; c < cols - 3; c++) {
        ctx.fillStyle = (c + r) % 7 === 0 ? seatAlt : seat;
        ctx.fillRect(c * cw + 1, r * rh + rh * 0.25, cw - 2, rh * 0.6);
      }
    }
    /* aisle steps */
    ctx.fillStyle = "#6b717b";
    for (let r = 0; r < rows; r++) for (const c0 of [0, cols - 3]) ctx.fillRect(c0 * cw, r * rh + rh * 0.5, cw * 3, rh * 0.12);
    for (const p of people) {
      const up = bob && p.hop ? rh * 0.22 : 0;
      const x = p.c * cw, y = p.r * rh + rh * 0.12 - up;
      ctx.fillStyle = p.shirt; ctx.fillRect(x + cw * 0.12, y + rh * 0.35, cw * 0.76, rh * 0.55);
      ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(x + cw / 2, y + rh * 0.22, Math.min(cw, rh) * 0.2, 0, Math.PI * 2); ctx.fill();
      if (bob && p.arms) { ctx.fillRect(x + cw * 0.08, y - rh * 0.3, cw * 0.14, rh * 0.55); ctx.fillRect(x + cw * 0.78, y - rh * 0.3, cw * 0.14, rh * 0.55); }
    }
    /* row shadows give the rake depth */
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let r = 0; r < rows; r++) ctx.fillRect(0, r * rh, w, rh * 0.1);
  }, repeat);
}

/* LED ribbon between the tiers: scrolling messages. */
function ribbonTexture(title = "PRACTICE NETS") {
  return canvasTexture(2048, 64, (ctx, w, h) => {
    const panels = [["#0b1d3f", "#ffffff", "WORLD CRICKET CHAMPS"], ["#15945e", "#ffffff", "FOUR"], ["#0f1c33", "#f2c230", title], ["#12357a", "#ffffff", "WORLD CRICKET CHAMPS"], ["#0f1c33", "#f08a3c", "SIX"], ["#e6e9ef", "#0b1d3f", "WCC"]];
    const pw = w / panels.length;
    panels.forEach(([bg, fg, text], i) => {
      ctx.fillStyle = bg; ctx.fillRect(i * pw, 0, pw, h);
      ctx.fillStyle = fg; ctx.font = "bold 40px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, i * pw + pw / 2, h / 2 + 2, pw - 20);
    });
    /* LED dot pattern */
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
  }, [-3, 1]);
}

/* Floodlight head: a grid of lamps. */
function lampTexture() {
  return canvasTexture(256, 160, (ctx) => {
    ctx.fillStyle = "#2b3038"; ctx.fillRect(0, 0, 256, 160);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
      const x = 16 + c * 30, y = 16 + r * 30;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 13);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#eef4ff"); g.addColorStop(1, "#7d8897");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
    }
  });
}

/* Big screen and scoreboard faces. */
function screenTexture(lines) {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b1d3f"); g.addColorStop(1, "#12357a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#15945e"; ctx.fillRect(0, h - 70, w, 70);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const [text, size, colour, y] of lines) { ctx.fillStyle = colour; ctx.font = "bold " + size + "px Arial"; ctx.fillText(text, w / 2, y * h, w - 60); }
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  });
}

function skyDome() {
  const geometry = new THREE.SphereGeometry(600, 32, 16);
  const colours = [];
  const top = new THREE.Color("#4f8fd8"), horizon = new THREE.Color("#d8e7f5"), below = new THREE.Color("#c9d7e6");
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i) / 600;
    const c = y > 0 ? horizon.clone().lerp(top, Math.pow(y, 0.55)) : below;
    colours.push(c.r, c.g, c.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }));
}

function makeStumps(z, material, bailMaterial) {
  const group = new THREE.Group();
  const geometry = new THREE.CylinderGeometry(0.018, 0.018, PITCH.stumpHeight, 10);
  const stumps = [];
  for (const x of [-0.095, 0, 0.095]) {
    const stump = new THREE.Mesh(geometry, material);
    stump.position.set(x, PITCH.stumpHeight / 2, z);
    stump.castShadow = true;
    group.add(stump);
    stumps.push(stump);
  }
  const bails = [];
  for (const x of [-0.0475, 0.0475]) {
    const bail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, 0.014), bailMaterial);
    bail.position.set(x, PITCH.stumpHeight + 0.008, z);
    bail.castShadow = true;
    group.add(bail);
    bails.push(bail);
  }
  return { group, stumps, bails, home: { stumps: stumps.map((s) => s.position.clone()), bails: bails.map((b) => b.position.clone()) } };
}

/* The stadium bowl: two tiers of seating with an LED ribbon between them,
   a cantilevered roof on steel ribs, floodlight towers, a big screen and a
   scoreboard. Angles: 0 is +z (the bowler's end), PI is -z (behind the
   striker). */
const BOWL = { inner: 88, wall: 2.2, lowTop: 104, lowH: 14, ribbonH: 2.4, upTop: 126, upH: 38, roofIn: 106, roofH: 46 };
/* labels: what the LED ribbon and the big screens show (nets by default) */
function stadium(quality, labels = {}) {
  const title = labels.title || "PRACTICE NETS";
  const group = new THREE.Group();
  const seg = quality.segments * 2;
  const B = BOWL;
  const concrete = new THREE.MeshStandardMaterial({ color: "#8c939d", roughness: 0.95, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: "#1b2330", roughness: 0.9, side: THREE.DoubleSide });
  const steel = new THREE.MeshStandardMaterial({ color: "#a7afba", roughness: 0.45, metalness: 0.6 });

  /* perimeter wall in front of the first row */
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(B.inner, B.inner, B.wall, seg, 1, true), new THREE.MeshStandardMaterial({ color: "#0f1c33", roughness: 0.8, side: THREE.BackSide }));
  wall.position.y = B.wall / 2;
  group.add(wall);

  /* lower tier */
  const lowTex = [false, true].map((bob) => seatTexture({ rows: 22, cols: 72, seat: "#1f4f9a", seatAlt: "#2a5fae", fill: 0.72, seed: 11, bob, repeat: [16, 1] }));
  const lowMat = new THREE.MeshStandardMaterial({ map: lowTex[0], roughness: 0.92, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(B.inner, B.wall), new THREE.Vector2(B.lowTop, B.lowH)], seg), lowMat));

  /* concourse slab, and the LED ribbon on the front of the upper tier */
  group.add(new THREE.Mesh(new THREE.RingGeometry(B.lowTop, B.lowTop + 3, seg).rotateX(-Math.PI / 2).translate(0, B.lowH, 0), concrete));
  const ribbon = ribbonTexture(title);
  const ribbonMesh = new THREE.Mesh(new THREE.CylinderGeometry(B.lowTop + 0.3, B.lowTop + 0.3, B.ribbonH, seg, 1, true),
    new THREE.MeshStandardMaterial({ map: ribbon, emissive: "#ffffff", emissiveMap: ribbon, emissiveIntensity: 0.55, roughness: 0.5, side: THREE.BackSide }));
  ribbonMesh.position.y = B.lowH + B.ribbonH / 2 + 0.3;
  group.add(ribbonMesh);

  /* upper tier */
  const upTex = [false, true].map((bob) => seatTexture({ rows: 30, cols: 72, seat: "#2c3a52", seatAlt: "#f08a3c", fill: 0.6, seed: 23, bob, repeat: [18, 1] }));
  const upMat = new THREE.MeshStandardMaterial({ map: upTex[0], roughness: 0.92, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(B.lowTop + 0.3, B.lowH + B.ribbonH + 0.6), new THREE.Vector2(B.upTop, B.upH)], seg), upMat));

  /* back wall and outer facade */
  const back = new THREE.Mesh(new THREE.CylinderGeometry(B.upTop, B.upTop + 4, B.roofH, seg, 1, true), dark);
  back.position.y = B.roofH / 2;
  group.add(back);

  /* roof: a sloping ring over the upper tier with a fascia at its edge */
  const roofMat = new THREE.MeshStandardMaterial({ color: "#eef1f5", emissive: "#59616d", roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });  /* lit underside */
  group.add(new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(B.roofIn, B.roofH), new THREE.Vector2(B.upTop + 4, B.roofH - 3)], seg), roofMat));
  const fascia = new THREE.Mesh(new THREE.CylinderGeometry(B.roofIn, B.roofIn, 2.2, seg, 1, true), new THREE.MeshStandardMaterial({ color: "#d9dee5", roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }));
  fascia.position.y = B.roofH - 0.9;
  group.add(fascia);
  /* steel ribs over the roof, columns behind the top row */
  const ribs = 48, ribLen = B.upTop + 4 - B.roofIn;
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, ribLen), steel);
    rib.position.set(Math.sin(a) * (B.roofIn + ribLen / 2), B.roofH - 1.3, Math.cos(a) * (B.roofIn + ribLen / 2));
    rib.rotation.order = "YXZ";
    rib.rotation.set(Math.atan2(3, ribLen), a, 0);
    rib.position.y += 0.9;
    group.add(rib);
    if (i % 2 === 0) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, B.roofH - B.upH, 6), steel);
      column.position.set(Math.sin(a) * (B.upTop - 0.8), B.upH + (B.roofH - B.upH) / 2, Math.cos(a) * (B.upTop - 0.8));
      group.add(column);
    }
  }

  /* sight screens: white panels across the lower tier at both ends */
  const screenMat = new THREE.MeshStandardMaterial({ color: "#f4f6f8", emissive: "#c9ced6", roughness: 0.85, side: THREE.DoubleSide });
  for (const end of [0, Math.PI]) {
    const width = 26 / (B.inner + 1);
    const screen = new THREE.Mesh(new THREE.CylinderGeometry(B.inner + 1, B.inner + 1, 11, 12, 1, true, end - width / 2, width), screenMat);
    screen.position.y = 5.5;
    group.add(screen);
  }

  /* big screen behind the striker, scoreboard at the bowler's end */
  const boards = [
    [Math.PI, screenTexture([["WORLD CRICKET CHAMPS", 64, "#ffffff", 0.28], [title, 92, "#f2c230", 0.55], ["LIVE", 46, "#ffffff", 0.93]])],
    [0, screenTexture((labels.board || [["NETS SESSION", 70, "#ffffff", 0.22], ["0 / 0", 150, "#ffffff", 0.52], ["OVERS 0.0", 46, "#ffffff", 0.93]]))]
  ];
  for (const [a, tex] of boards) {
    const frame = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(36, 18), new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.7, roughness: 0.4 }));
    face.position.z = 0.8;
    frame.add(new THREE.Mesh(new THREE.BoxGeometry(38, 20, 1.5), dark), face);
    for (const side of [-12, 12]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 1), steel);
      leg.position.set(side, -16, 0);
      frame.add(leg);
    }
    const r = B.upTop - 2;
    frame.position.set(Math.sin(a) * r, B.roofH + 12, Math.cos(a) * r);
    frame.lookAt(0, 12, 0);
    group.add(frame);
  }

  /* floodlight towers outside the bowl, heads tilted at the square */
  const lamp = lampTexture();
  const headMat = new THREE.MeshStandardMaterial({ map: lamp, emissive: "#ffffff", emissiveMap: lamp, emissiveIntensity: 0.8, roughness: 0.4 });
  for (const a of [0.62, 2.52, 3.76, 5.66]) {
    const tower = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, 78, 10), steel);
    mast.position.y = 39;
    const head = new THREE.Mesh(new THREE.BoxGeometry(18, 11, 1.2), [dark, dark, dark, dark, headMat, dark]);
    head.position.y = 82;
    head.rotation.x = 0.5;
    tower.add(mast, head);
    tower.position.set(Math.sin(a) * (B.upTop + 14), 0, Math.cos(a) * (B.upTop + 14));
    tower.lookAt(0, 0, 0);
    group.add(tower);
  }

  /* crowd motion: swap between the still and the bobbing crowd */
  let excitement = 0, flip = 0, shown = false;
  function update(time, dt) {
    ribbon.offset.x = (time * 0.012) % 1;
    excitement = Math.max(0, excitement - dt * 0.35);
    flip += dt * (0.9 + excitement * 7);
    const bob = Math.floor(flip) % 2 === 1 && (excitement > 0.05 || Math.floor(time * 0.37) % 5 === 0);
    if (bob !== shown) {
      lowMat.map = lowTex[bob ? 1 : 0];
      upMat.map = upTex[bob ? 1 : 0];
      shown = bob;
    }
  }
  function cheer(amount = 1) { excitement = Math.min(1, excitement + amount); }
  return { group, update, cheer };
}

export function buildWorld(renderer, quality, labels = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#cfdceb", 220, 700);
  scene.add(skyDome());

  /* Lights: soft sky fill plus a low sun for shape and shadows. */
  scene.add(new THREE.HemisphereLight("#dbe9ff", "#4a6b3a", 1.15));
  const sun = new THREE.DirectionalLight("#fff4e2", 2.6);
  sun.position.set(-28, 46, 18);
  sun.target.position.set(0, 0, 6);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    const cam = sun.shadow.camera;
    cam.left = -9; cam.right = 9; cam.top = 16; cam.bottom = -16; cam.near = 10; cam.far = 110;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
  }
  scene.add(sun, sun.target);

  /* Outfield */
  const grass = grassTexture();
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(6, 6);
  const field = new THREE.Mesh(new THREE.CircleGeometry(BOWL.inner + 0.5, quality.segments), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
  field.rotation.x = -Math.PI / 2;
  field.receiveShadow = true;
  scene.add(field);

  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 23.12), new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.92 }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.set(0, 0.01, PITCH.length / 2);
  pitch.receiveShadow = true;
  scene.add(pitch);

  /* Boundary rope */
  const rope = new THREE.Mesh(new THREE.TorusGeometry(PITCH.boundary, 0.12, 6, quality.segments * 2), new THREE.MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.6 }));
  rope.rotation.x = Math.PI / 2;
  rope.position.y = 0.12;
  scene.add(rope);
  /* Advertising boards just beyond the rope */
  const boards = new THREE.Mesh(new THREE.CylinderGeometry(PITCH.boundary + 4, PITCH.boundary + 4, 0.9, quality.segments, 1, true),
    new THREE.MeshStandardMaterial({ map: canvasTexture(1024, 64, (ctx, w, h) => {
      const fills = ["#12357a", "#15945e", "#0f1c33", "#e6e9ef"];
      for (let i = 0; i < 16; i++) { ctx.fillStyle = fills[i % fills.length]; ctx.fillRect((i * w) / 16, 0, w / 16, h); }
      ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = "bold 30px Arial"; ctx.textBaseline = "middle";
      for (let i = 0; i < 16; i++) if (i % 4 !== 3) ctx.fillText("WORLD CRICKET CHAMPS", (i * w) / 16 + 4, h / 2, w / 16 - 8);
    }, [-4, 1]), side: THREE.BackSide, roughness: 0.7 }));
  boards.position.y = 0.45;
  scene.add(boards);

  const bowl = stadium(quality, labels);
  scene.add(bowl.group);

  const stumpMat = new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.5 });
  const bailMat = new THREE.MeshStandardMaterial({ color: "#f0d84a", roughness: 0.5 });
  const strikerStumps = makeStumps(0, stumpMat, bailMat);
  const bowlerStumps = makeStumps(PITCH.length, stumpMat, bailMat);
  scene.add(strikerStumps.group, bowlerStumps.group);

  return { scene, sun, strikerStumps, bowlerStumps, update: bowl.update, cheer: bowl.cheer };
}

/* The ball, its ground shadow and a short trail. */
export function buildBall(scene) {
  /* Leather with a raised seam and two rows of stitching round the middle. */
  const leather = canvasTexture(256, 128, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#9e0b22"); grad.addColorStop(0.5, "#c8102e"); grad.addColorStop(1, "#9e0b22");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f3e7d0"; ctx.fillRect(0, h / 2 - 3, w, 6);
    ctx.fillStyle = "#7a0818"; ctx.fillRect(0, h / 2 - 1, w, 2);
    ctx.fillStyle = "#fff4dc";
    for (let x = 0; x < w; x += 6) { ctx.fillRect(x, h / 2 - 8, 3, 2); ctx.fillRect(x + 3, h / 2 + 6, 3, 2); }
  });
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(PITCH.ballRadius * 1.45, 24, 16),
    new THREE.MeshStandardMaterial({ map: leather, roughness: 0.32, emissive: "#5a0010", emissiveIntensity: 0.25 })
  );
  ball.rotation.z = 0.35;
  ball.castShadow = true;
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.35, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.16, 24), new THREE.MeshBasicMaterial({ color: "#ffe14d", transparent: true, opacity: 0.85, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  const trailCount = 14;
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(trailCount * 3), 3));
  const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55 }));
  trail.frustumCulled = false;
  scene.add(ball, blob, marker, trail);
  const history = [];
  return {
    ball, blob, marker, trail,
    place(p) {
      ball.position.set(p.x, p.y, p.z);
      blob.position.set(p.x, 0.015, p.z);
      const s = Math.max(0.35, 1 - p.y / 12);
      blob.scale.setScalar(s);
      blob.material.opacity = 0.35 * s;
      history.unshift([p.x, p.y, p.z]);
      if (history.length > trailCount) history.pop();
      const array = trailGeometry.attributes.position.array;
      for (let i = 0; i < trailCount; i++) { const h = history[Math.min(i, history.length - 1)]; array[i * 3] = h[0]; array[i * 3 + 1] = h[1]; array[i * 3 + 2] = h[2]; }
      trailGeometry.attributes.position.needsUpdate = true;
    },
    resetTrail() { history.length = 0; },
    show(visible) { ball.visible = blob.visible = trail.visible = visible; }
  };
}
