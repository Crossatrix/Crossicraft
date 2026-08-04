# MyCraft

A tiny browser-based Minecraft clone using Three.js. Right now it's a flat
32×32 layer of dirt blocks you can walk around, break, and place — a starting
point to build on.

## Add your texture

Put your texture here (exact path matters):

```
assets/textures/dirt.png
```

Use a small square image (e.g. 16×16) for the classic pixel-art look —
the renderer uses nearest-neighbor filtering so it stays crisp instead of
blurry.

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
- **Right click** — place a dirt block
- **Esc** — release the mouse

**Mobile / touch**
- Touch device is auto-detected — the touch UI appears automatically, no
  desktop controls are shown
- **Left-side joystick** — move
- **Drag anywhere on screen** — look around
- **↑ button** — jump
- **× button** — break the block in the crosshair
- **+ button** — place a dirt block

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
