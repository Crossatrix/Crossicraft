# MyCraft

A tiny browser-based Minecraft clone using Three.js. Right now it's a flat
64×64 island of dirt with randomly generated oak trees, which you can walk
around, break, and place blocks on — a starting point to build on.

## Add your textures

Put your textures here (exact paths matter):

```
assets/textures/dirt.png
assets/textures/cobblestone.png
assets/textures/oak_log_side.png
assets/textures/oak_log_top.png
assets/textures/oak_leaves.png
```

Use small square images (e.g. 16×16) for the classic pixel-art look —
the renderer uses nearest-neighbor filtering so they stay crisp instead of
blurry. `oak_leaves.png` should have transparent pixels (use a PNG with
alpha) for gaps in the canopy.

To add more block types later, add an entry to the `BLOCK_TYPES` array near
the top of `main.js` — it automatically appears in the hotbar. Blocks with
a top/bottom texture different from their sides (like logs) use
`textureTop` / `textureSide` instead of a single `texture`.

## Run locally

Any static file server works, e.g.:

```
python3 -m http.server 8080
```

Then open http://localhost:8080. (Opening index.html directly via
`file://` won't work — browsers block module/texture loading from disk.)

## Controls

**Desktop**
- **Click** the page to lock the mouse and start playing
- **WASD** — move
- **Space** — jump
- **Mouse** — look around
- **Left click** — break the block you're looking at
- **Right click** — place the selected hotbar block
- **1 / 2 / 3 / 4** — switch hotbar block (dirt / cobblestone / oak log / oak leaves)
- **Esc** — release the mouse

**Mobile / touch**
- Touch device is auto-detected (iPad included) — the touch UI appears
  automatically, no desktop controls are shown
- **Left-side joystick** — move
- **Drag anywhere on screen** — look around
- **↑ button** — jump
- **× button** — break the block in the crosshair
- **+ button** — place the selected hotbar block
- **Hotbar icons (top center)** — tap to switch block type

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo (root, or a `/docs` folder — your choice)
2. Repo Settings → Pages → set source to that branch/folder
3. Your site will be live at `https://<username>.github.io/<repo>/`

## Project structure

```
index.html   — page shell, imports Three.js via CDN import map
style.css    — HUD/crosshair styling
main.js      — world generation, rendering, physics, controls
assets/textures/dirt.png  — your texture goes here
```

## Extending it

`main.js` is intentionally simple and commented. Natural next steps:
- Add more block types (grass, stone) — load more textures, give each
  a key on a hotbar, pass the selected material into `addBlock`
- Swap the flat layer for real terrain (e.g. simplex/Perlin noise heightmap)
- Chunk the world instead of one mesh per block, for performance at scale
