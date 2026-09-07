# Room Model — Bedroom 6

An interactive 3-D layout of Bedroom 6 (11'-1" × 10'-5") built from the house
floor plan, rendered in the browser with [Three.js](https://threejs.org/).
The model includes the entry door, the bifold closet, two windows, the linen
closet nook, and the pad outside the windows with the AC condenser and drain.

**SPEC.md** defines every rule the model must satisfy and how it is tested.

## Run it

Open `index.html` in a browser. Three.js loads from a CDN, so an internet
connection is needed the first time. If your browser refuses module scripts
on `file://` URLs, serve the folder instead:

```sh
npm run serve      # python3 -m http.server 8000, then open http://localhost:8000
```

## Controls

- Left-drag: orbit · scroll: zoom · right-drag: pan
- **Reset view**, **Top view** (oriented like the plan), **Inside**
- **Show labels** toggles the name tags
- Width / Length / Height inputs rebuild the room live; the **Spec check**
  section shows any rule the current layout breaks

Walls facing the camera are hidden (together with their doors, windows and
labels), so you can always see into the room.

## Describe the room

Edit `room.config.js`. All measurements are in feet; `ft(11, 1)` is 11'-1".
The coordinate system, the meaning of every field, and the list of
assumptions taken from the plan are in `SPEC.md`.

```js
room:      { width: ft(11, 1), length: ft(10, 5), height: ft(8) },
openings:  [ { type: 'door', wall: 'back', from: ft(0, 9), width: ft(2, 6), ... }, ... ],
fixtures:  [ { name: 'Linen closet', x: 0, z: ft(3), w: ft(2, 3), d: ft(3), h: ft(8) } ],
furniture: [ { name: 'Bed (queen)', x: ft(4, 5), z: ft(4), w: ft(6, 8), d: ft(5), h: ft(2), color: '#7f8cff' } ],
exterior:  { side: 'front', pad: {...}, ac: {...}, drain: {...} },
```

## Tests

```sh
npm install
npx playwright install chromium   # once, for the browser suite
npm test                          # 29 tests: spec rules, geometry helpers, rendering
```

`npm run test:spec` runs the rule checks without a browser. The render suite
serves Three.js from `node_modules`, so it works offline, and writes
screenshots to `test/output/`.

## Layout

| File | What it is |
| --- | --- |
| `index.html` | the viewer (Three.js scene, side panel) |
| `room.config.js` | the room description you edit |
| `src/geometry.js` | wall/opening geometry, clearance rules, `validate()` |
| `test/spec.test.js` | rule and geometry tests (Node, no browser) |
| `test/render.test.js` | Playwright tests against the rendered page |
| `SPEC.md` | requirements, assumptions, test plan |
