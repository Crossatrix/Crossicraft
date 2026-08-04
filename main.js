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

const IS_TOUCH_DEVICE =
  "ontouchstart" in window || navigator.maxTouchPoints > 0;

if (IS_TOUCH_DEVICE) {
  document.body.classList.add("touch-device");
  document.getElementById("hint").textContent = "Tap to play";
}

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

if (!IS_TOUCH_DEVICE) {
  // Pointer lock for mouse look (desktop only)
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
} else {
  // On touch, just dismiss the hint and start the game on first tap
  document.body.addEventListener(
    "touchstart",
    () => document.body.classList.add("playing"),
    { once: true, passive: true }
  );
}

/* ------------------------------------------------------------------ */
/*  Touch controls: joystick (move), drag zone (look), action buttons  */
/* ------------------------------------------------------------------ */

// Movement input, shared between keyboard (WASD) and joystick.
// Keyboard sets `keys[...]`; joystick writes directly into this vector,
// which updatePlayerPhysics() reads in addition to the keys.
const touchMove = { x: 0, y: 0 }; // x: strafe (-1..1), y: forward/back (-1..1)

if (IS_TOUCH_DEVICE) {
  /* ---------------- Joystick (movement) ---------------- */

  const joystickZone = document.getElementById("joystick-zone");
  const joystickBase = document.getElementById("joystick-base");
  const joystickStick = document.getElementById("joystick-stick");

  let joystickTouchId = null;
  let baseCenter = { x: 0, y: 0 };
  const JOYSTICK_RADIUS = 55; // px, matches #joystick-base half-width

  function setStick(dx, dy) {
    joystickStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  function resetJoystick() {
    joystickTouchId = null;
    touchMove.x = 0;
    touchMove.y = 0;
    setStick(0, 0);
  }

  joystickZone.addEventListener(
    "touchstart",
    (e) => {
      if (joystickTouchId !== null) return;
      const t = e.changedTouches[0];
      joystickTouchId = t.identifier;
      const rect = joystickBase.getBoundingClientRect();
      baseCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      updateJoystick(t);
      e.preventDefault();
    },
    { passive: false }
  );

  function updateJoystick(touch) {
    let dx = touch.clientX - baseCenter.x;
    let dy = touch.clientY - baseCenter.y;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_RADIUS) {
      dx = (dx / dist) * JOYSTICK_RADIUS;
      dy = (dy / dist) * JOYSTICK_RADIUS;
    }
    setStick(dx, dy);
    // Normalize to -1..1, y inverted so "up" = forward
    touchMove.x = dx / JOYSTICK_RADIUS;
    touchMove.y = dy / JOYSTICK_RADIUS;
  }

  window.addEventListener(
    "touchmove",
    (e) => {
      if (joystickTouchId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === joystickTouchId) {
          updateJoystick(t);
          e.preventDefault();
        }
      }
    },
    { passive: false }
  );

  window.addEventListener("touchend", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joystickTouchId) resetJoystick();
    }
  });
  window.addEventListener("touchcancel", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joystickTouchId) resetJoystick();
    }
  });

  /* ---------------- Drag-to-look ---------------- */

  const lookZone = document.getElementById("look-zone");
  let lookTouchId = null;
  let lastLook = { x: 0, y: 0 };
  const LOOK_SENSITIVITY = 0.0055;

  lookZone.addEventListener(
    "touchstart",
    (e) => {
      if (lookTouchId !== null) return;
      const t = e.changedTouches[0];
      lookTouchId = t.identifier;
      lastLook = { x: t.clientX, y: t.clientY };
      e.preventDefault();
    },
    { passive: false }
  );

  lookZone.addEventListener(
    "touchmove",
    (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookTouchId) continue;
        const dx = t.clientX - lastLook.x;
        const dy = t.clientY - lastLook.y;
        lastLook = { x: t.clientX, y: t.clientY };

        player.yaw -= dx * LOOK_SENSITIVITY;
        player.pitch -= dy * LOOK_SENSITIVITY;
        const limit = Math.PI / 2 - 0.05;
        player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
        e.preventDefault();
      }
    },
    { passive: false }
  );

  function endLook(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === lookTouchId) lookTouchId = null;
    }
  }
  lookZone.addEventListener("touchend", endLook);
  lookZone.addEventListener("touchcancel", endLook);

  /* ---------------- Action buttons ---------------- */

  const btnJump = document.getElementById("btn-jump");
  const btnBreak = document.getElementById("btn-break");
  const btnPlace = document.getElementById("btn-place");

  function bindHoldButton(el, onDown, onUp) {
    el.addEventListener(
      "touchstart",
      (e) => {
        el.classList.add("active");
        onDown();
        e.preventDefault();
      },
      { passive: false }
    );
    const release = (e) => {
      el.classList.remove("active");
      if (onUp) onUp();
      if (e) e.preventDefault();
    };
    el.addEventListener("touchend", release, { passive: false });
    el.addEventListener("touchcancel", release, { passive: false });
  }

  bindHoldButton(
    btnJump,
    () => (keys["Space"] = true),
    () => (keys["Space"] = false)
  );

  // Break/place are tap actions (one block per tap), reusing the same
  // raycast-from-screen-center logic as the desktop mouse handlers.
  bindHoldButton(btnBreak, () => performBlockAction("break"));
  bindHoldButton(btnPlace, () => performBlockAction("place"));
}

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

  // Joystick input (touch): x = strafe, y = forward/back, each -1..1
  if (touchMove.x !== 0 || touchMove.y !== 0) {
    move.addScaledVector(right, touchMove.x);
    move.addScaledVector(forward, touchMove.y);
  }

  if (move.lengthSq() > 0) {
    // Clamp so diagonal keyboard+joystick input isn't faster than normal
    if (move.length() > 1) move.normalize();
    move.multiplyScalar(MOVE_SPEED);
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

function performBlockAction(action) {
  raycaster.setFromCamera(centerScreen, camera);
  const hits = raycaster.intersectObjects([...blocks.values()], false);
  if (hits.length === 0) return;

  const hit = hits[0];
  const { x, y, z } = hit.object.userData.gridPos;

  if (action === "break") {
    removeBlock(x, y, z);
  } else if (action === "place") {
    // Place block on the face that was hit
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
}

canvas.addEventListener("mousedown", (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) performBlockAction("break");
  else if (e.button === 2) performBlockAction("place");
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
