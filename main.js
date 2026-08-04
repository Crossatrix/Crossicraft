import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const WORLD_SIZE = 32;     // dirt layer is WORLD_SIZE x WORLD_SIZE blocks
const BLOCK_SIZE = 1;
const REACH = 6;           // how far you can break/place blocks
const GRAVITY = -20;
const JUMP_SPEED = 7.5;
const MOVE_SPEED = 5.5;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;
const EYE_HEIGHT = 1.6;

/* ------------------------------------------------------------------ */
/*  Renderer / Scene / Camera                                          */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 90);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ */
/*  Lighting                                                           */
/* ------------------------------------------------------------------ */

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a3b2a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff4d6, 1.0);
sun.position.set(40, 60, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 150;
scene.add(sun);

/* ------------------------------------------------------------------ */
/*  Textures                                                           */
/* ------------------------------------------------------------------ */

const textureLoader = new THREE.TextureLoader();

function loadBlockTexture(path) {
  const tex = textureLoader.load(
    path,
    undefined,
    undefined,
    () => console.warn(`Texture failed to load: ${path}`)
  );
  tex.magFilter = THREE.NearestFilter; // crisp pixel-art look
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const dirtTexture = loadBlockTexture("assets/textures/dirt.png");
const dirtMaterial = new THREE.MeshLambertMaterial({ map: dirtTexture });

/* ------------------------------------------------------------------ */
/*  World: a flat layer of dirt blocks                                 */
/* ------------------------------------------------------------------ */
/*
  Blocks are stored in a Map keyed by "x,y,z" -> mesh, so we can look
  them up for raycasting / breaking / placing.
*/

const blocks = new Map();
const blockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

function keyFor(x, y, z) {
  return `${x},${y},${z}`;
}

function addBlock(x, y, z, material = dirtMaterial) {
  const k = keyFor(x, y, z);
  if (blocks.has(k)) return;

  const mesh = new THREE.Mesh(blockGeometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.gridPos = { x, y, z };
  scene.add(mesh);
  blocks.set(k, mesh);
}

function removeBlock(x, y, z) {
  const k = keyFor(x, y, z);
  const mesh = blocks.get(k);
  if (!mesh) return;
  scene.remove(mesh);
  blocks.delete(k);
}

function hasBlock(x, y, z) {
  return blocks.has(keyFor(x, y, z));
}

// Generate the flat dirt layer at y = 0
const half = Math.floor(WORLD_SIZE / 2);
for (let x = -half; x < half; x++) {
  for (let z = -half; z < half; z++) {
    addBlock(x, 0, z);
  }
}

/* ------------------------------------------------------------------ */
/*  Player: position, physics, first-person controls                   */
/* ------------------------------------------------------------------ */

const player = {
  position: new THREE.Vector3(0, PLAYER_HEIGHT + 1, 5),
  velocity: new THREE.Vector3(0, 0, 0),
  onGround: false,
  yaw: 0,
  pitch: 0,
};

const keys = {};
window.addEventListener("keydown", (e) => (keys[e.code] = true));
window.addEventListener("keyup", (e) => (keys[e.code] = false));

// Pointer lock for mouse look
document.body.addEventListener("click", () => {
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
});

document.addEventListener("pointerlockchange", () => {
  const playing = document.pointerLockElement === canvas;
  document.body.classList.toggle("playing", playing);
});

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  const sensitivity = 0.0022;
  player.yaw -= e.movementX * sensitivity;
  player.pitch -= e.movementY * sensitivity;
  const limit = Math.PI / 2 - 0.05;
  player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
});

/* ---- Simple AABB collision against the block grid ---- */

function isSolidAt(x, y, z) {
  return hasBlock(Math.floor(x), Math.floor(y), Math.floor(z));
}

function collidesAt(pos) {
  // Check a small box around the player's position against solid blocks
  const r = PLAYER_RADIUS;
  const feet = pos.y - EYE_HEIGHT;
  const head = pos.y - EYE_HEIGHT + PLAYER_HEIGHT;

  for (let yLevel = feet; yLevel < head; yLevel += 0.9) {
    const checkY = Math.min(yLevel, head - 0.01);
    for (const dx of [-r, r]) {
      for (const dz of [-r, r]) {
        if (isSolidAt(pos.x + dx, checkY, pos.z + dz)) return true;
      }
    }
  }
  return false;
}

function updatePlayerPhysics(dt) {
  // -- movement input relative to look direction (yaw only) --
  const forward = new THREE.Vector3(
    Math.sin(player.yaw),
    0,
    Math.cos(player.yaw)
  );
  const right = new THREE.Vector3(
    Math.sin(player.yaw + Math.PI / 2),
    0,
    Math.cos(player.yaw + Math.PI / 2)
  );

  const move = new THREE.Vector3();
  if (keys["KeyW"]) move.sub(forward);
  if (keys["KeyS"]) move.add(forward);
  if (keys["KeyA"]) move.sub(right);
  if (keys["KeyD"]) move.add(right);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(MOVE_SPEED);
  }

  // -- jump / gravity --
  if (keys["Space"] && player.onGround) {
    player.velocity.y = JUMP_SPEED;
    player.onGround = false;
  }
  player.velocity.y += GRAVITY * dt;

  // -- integrate with simple axis-separated collision --
  const next = player.position.clone();

  // X axis
  next.x += move.x * dt;
  if (collidesAt(next)) next.x = player.position.x;

  // Z axis
  next.z += move.z * dt;
  if (collidesAt(next)) next.z = player.position.z;

  // Y axis
  next.y += player.velocity.y * dt;
  if (collidesAt(next)) {
    if (player.velocity.y < 0) player.onGround = true;
    player.velocity.y = 0;
    next.y = player.position.y;
  } else {
    player.onGround = false;
  }

  player.position.copy(next);

  // Fallback: don't fall forever below the world
  if (player.position.y < -20) {
    player.position.set(0, PLAYER_HEIGHT + 5, 5);
    player.velocity.set(0, 0, 0);
  }
}

/* ------------------------------------------------------------------ */
/*  Block breaking / placing via raycasting                            */
/* ------------------------------------------------------------------ */

const raycaster = new THREE.Raycaster();
raycaster.far = REACH;
const centerScreen = new THREE.Vector2(0, 0);

canvas.addEventListener("mousedown", (e) => {
  if (document.pointerLockElement !== canvas) return;

  raycaster.setFromCamera(centerScreen, camera);
  const hits = raycaster.intersectObjects([...blocks.values()], false);
  if (hits.length === 0) return;

  const hit = hits[0];
  const { x, y, z } = hit.object.userData.gridPos;

  if (e.button === 0) {
    // Left click: break block
    removeBlock(x, y, z);
  } else if (e.button === 2) {
    // Right click: place block on the face that was clicked
    const normal = hit.face.normal;
    const nx = x + Math.round(normal.x);
    const ny = y + Math.round(normal.y);
    const nz = z + Math.round(normal.z);

    // Don't place a block inside the player
    const wouldCollide =
      Math.abs(nx - player.position.x) < 0.6 &&
      Math.abs(nz - player.position.z) < 0.6 &&
      ny > player.position.y - EYE_HEIGHT - 0.1 &&
      ny < player.position.y - EYE_HEIGHT + PLAYER_HEIGHT;

    if (!wouldCollide) {
      addBlock(nx, ny, nz);
    }
  }
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

/* ------------------------------------------------------------------ */
/*  Main loop                                                          */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  updatePlayerPhysics(dt);

  camera.position.copy(player.position);
  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  renderer.render(scene, camera);
}

animate();
