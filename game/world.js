/* ==========================================================================
   The ground: outfield, pitch, stumps, rope, stands, sight screens, lights
   and sky. Everything is built in code, so there are no model files to load.
   ========================================================================== */
import * as THREE from "three";
import { PITCH } from "./ball.js?v=3";

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

/* Stand seating: rows of coloured seats with a few people. */
function seatTexture(fill) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = "#1d2f52"; ctx.fillRect(0, 0, w, h);
    const rows = 16, cols = 64;
    const colours = ["#e6e9ef", "#d43c3c", "#2f6fd6", "#f2c230", "#2c2c2c", "#f08a3c", "#3aa35b"];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = (c / cols) * w, y = (r / rows) * h;
      const person = Math.random() < fill;
      ctx.fillStyle = person ? colours[(Math.random() * colours.length) | 0] : (r % 2 ? "#2a4f8f" : "#2d5598");
      ctx.fillRect(x + 1, y + 2, w / cols - 2, h / rows - 4);
      if (person) { ctx.fillStyle = "#c99a76"; ctx.fillRect(x + 2.5, y + 1, 3, 3); }
    }
  }, [6, 1]);
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

function stands(quality) {
  const group = new THREE.Group();
  const inner = 80, outer = 106, low = 1.4, high = 19;
  /* Low wall in front of the first row */
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(inner, inner, low, quality.segments, 1, true), new THREE.MeshStandardMaterial({ color: "#1b2b4a", roughness: 0.8, side: THREE.BackSide }));
  wall.position.y = low / 2;
  group.add(wall);
  /* Raked seating: one smooth slope so the seat rows map evenly */
  const seats = seatTexture(0.14);
  seats.repeat.set(18, 3);
  const rake = new THREE.Mesh(
    new THREE.LatheGeometry([new THREE.Vector2(inner, low), new THREE.Vector2(outer, high)], quality.segments),
    new THREE.MeshStandardMaterial({ map: seats, roughness: 0.9, side: THREE.DoubleSide })
  );
  group.add(rake);
  /* Back wall */
  const back = new THREE.Mesh(new THREE.CylinderGeometry(outer, outer, high + 4, quality.segments, 1, true), new THREE.MeshStandardMaterial({ color: "#16233d", roughness: 0.9, side: THREE.BackSide }));
  back.position.y = (high + 4) / 2;
  group.add(back);

  /* Roof canopy segments on the back of the stand. */
  const roofMaterial = new THREE.MeshStandardMaterial({ color: "#e9edf3", roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(outer + 1, outer - 12, 2.5, quality.segments, 1, true), roofMaterial);
  roof.position.y = high + 5;
  group.add(roof);

  /* Floodlight towers. */
  const pole = new THREE.MeshStandardMaterial({ color: "#9aa3ae", roughness: 0.5, metalness: 0.6 });
  const lamp = new THREE.MeshStandardMaterial({ color: "#f7f9ff", emissive: "#dfe8ff", emissiveIntensity: 0.6 });
  for (const angle of [0.75, 2.4, 3.9, 5.5]) {
    const tower = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 52, 8), pole);
    mast.position.y = 26;
    const head = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 0.8), lamp);
    head.position.y = 53;
    head.rotation.x = -0.35;
    tower.add(mast, head);
    tower.position.set(Math.sin(angle) * (outer + 8), 0, Math.cos(angle) * (outer + 8));
    tower.lookAt(0, 0, 0);
    group.add(tower);
  }
  return group;
}

/* Sight screens behind each end so the ball stands out. */
function sightScreen(z, rotation) {
  const group = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 0.4), new THREE.MeshStandardMaterial({ color: "#f4f6f8", roughness: 0.85 }));
  board.position.y = 4.5;
  group.add(board);
  group.position.set(0, 0, z);
  group.rotation.y = rotation;
  return group;
}

/* Practice nets off to the side of the square, for flavour. */
function practiceNets() {
  const group = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: "#3a3f47", metalness: 0.4, roughness: 0.6 });
  const net = new THREE.MeshBasicMaterial({
    map: canvasTexture(64, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(25,30,38,0.75)"; ctx.lineWidth = 2;
      for (let i = 0; i <= w; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
    }, [40, 4]),
    transparent: true, side: THREE.DoubleSide, depthWrite: false
  });
  for (let lane = 0; lane < 3; lane++) {
    const x = -50 - lane * 3.6;
    for (const side of [-1.8, 1.8]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 3.4), net);
      wall.rotation.y = Math.PI / 2;
      wall.position.set(x + side, 1.7, 12);
      group.add(wall);
    }
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(3, 24), new THREE.MeshStandardMaterial({ color: "#5d8c4f", roughness: 1 }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.01, 12);
    group.add(strip);
    for (const z of [0, 24]) for (const side of [-1.8, 1.8]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 6), frame);
      post.position.set(x + side, 1.7, z);
      group.add(post);
    }
  }
  return group;
}

export function buildWorld(renderer, quality) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#cfdceb", 160, 520);
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
  const field = new THREE.Mesh(new THREE.CircleGeometry(84, quality.segments), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
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

  scene.add(stands(quality));
  scene.add(sightScreen(-76, 0), sightScreen(96, Math.PI));
  scene.add(practiceNets());

  const stumpMat = new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.5 });
  const bailMat = new THREE.MeshStandardMaterial({ color: "#f0d84a", roughness: 0.5 });
  const strikerStumps = makeStumps(0, stumpMat, bailMat);
  const bowlerStumps = makeStumps(PITCH.length, stumpMat, bailMat);
  scene.add(strikerStumps.group, bowlerStumps.group);

  return { scene, sun, strikerStumps, bowlerStumps };
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
