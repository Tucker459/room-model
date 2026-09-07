# Room Model — Bedroom 6

An interactive 3-D layout of Bedroom 6 (11'-1" × 10'-5") built from the house
floor plan, rendered in the browser with [Three.js](https://threejs.org/).
Walking in through the door: the linen closet nook is beside you on the wall
you came through, the bifold closet is on your left, and the two windows are on
your right — with the concrete pad, AC condenser and drain outside them.
Furniture is a catalogue you tick on and off and drag around the room.

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
- **Furniture** lists every piece; tick to place it, untick to take it away
- **Reset layout** puts every piece back where `room.config.js` starts it

Walls facing the camera are hidden (together with their doors, windows,
wall-mounted furniture and labels), so you can always see into the room.

## Moving furniture

Click a piece to pick it up, then drag it. Floor pieces slide over the floor;
wall pieces slide along their own wall and up and down it. With a piece
selected:

| | |
| --- | --- |
| drag | move it |
| **R** / **Rotate 90°** | turn it a quarter turn about its own centre |
| **W** / **Next wall** | send a wall piece round to the next wall |
| arrow keys | nudge an inch (hold **shift** for 6") |
| **X** / **Z** boxes | type an exact position |
| **Esc** / **Deselect** | put it down |

Everything turns. A floor piece turns in plan (its width and depth swap); a
wall piece turns in the plane of its wall, so the bulletin board goes from
landscape to portrait and the mirror can lie on its side.

Moves snap to the inch and stay inside the room. Nothing else is prevented —
drop the bed in the doorway if you like, and the spec check will tell you what
you have blocked.

## Saving layouts

Where everything stands is kept in your browser, so a refresh does not lose it.
In the **Layout** section:

- **Save** — keep the current arrangement under a name
- **Load** / **Delete** — pick a saved name from the list
- **Reset** — back to the layout in `room.config.js`
- **Export** / **Import** — the same thing as a `.json` file you can keep in
  the repo or send to someone

A saved layout holds positions and sizes only — names, colours and shapes
always come from `room.config.js` — so old layouts keep working when the
furniture catalogue changes. Importing a file that is not a layout says so and
changes nothing.

Browsers refuse local storage on `file://` pages, so open the model through
`npm run serve` if you want any of this to persist.

## Furniture options

Bed, nightstand and dresser are what is in the room today. The rest are
options: sofa, TV on an easel, vanity, cabinet, rug, full-length mirror,
bulletin board, wall-mounted clothes rack and floating shelves.

Only two patches of floor in an 11' × 10' room take a large piece, so the floor
options pair up on a shared slot — **sofa / vanity** under the windows and
**TV-on-easel / cabinet** on the back wall facing the bed. Switch on both halves
of a pair and the spec check names the clash (or just drag one of them
somewhere else). The wall pieces and the rug are independent.

## Describe the room

Edit `room.config.js`. All measurements are in feet; `ft(11, 1)` is 11'-1".
The coordinate system, the meaning of every field, and the list of
assumptions taken from the plan are in `SPEC.md`.

```js
// walls are named as you meet them walking in: back = the wall you came
// through, left = closet, right = windows, front = the wall facing you
room:      { width: ft(11, 1), length: ft(10, 5), height: ft(8) },
openings:  [ { type: 'door', wall: 'back', from: ft(0, 9), width: ft(2, 6), ... }, ... ],
fixtures:  [ { name: 'Linen closet', x: ft(3, 6), z: 0, w: ft(2, 3), d: ft(3), h: ft(8) } ],
furniture: [
  // kind: 'floor' (default) — x/z is the back-left corner, w along x, d along z
  { id: 'bed', name: 'Bed (queen)', enabled: true, x: ft(4, 5), z: ft(4), w: ft(6, 8), d: ft(5), h: ft(2), color: '#7f8cff' },
  // kind: 'wall' — hangs on `wall` at `from` along it, `y` above the floor
  { id: 'shelves', kind: 'wall', shape: 'shelves', shelves: 3, wall: 'front', from: ft(0, 5), w: ft(3), d: ft(0, 10), y: ft(3, 4), h: ft(2) },
  // kind: 'rug' — lies flat; other pieces stand on it
  { id: 'rug', kind: 'rug', shape: 'rug', x: ft(2), z: ft(4, 6), w: ft(8), d: ft(5), h: ft(0, 1) },
],
exterior:  { side: 'front', pad: {...}, ac: {...}, drain: {...} },
```

## Tests

```sh
npm install
npx playwright install chromium   # once, for the browser suite
npm test                          # 50 tests: spec rules, geometry helpers, rendering
```

`npm run test:spec` runs the rule checks without a browser. The render suite
starts a local static server, serves Three.js from `node_modules` so it works
offline, and writes screenshots to `test/output/`.

## Layout

| File | What it is |
| --- | --- |
| `index.html` | the viewer (Three.js scene, side panel) |
| `room.config.js` | the room description you edit |
| `src/geometry.js` | wall/opening geometry, clearance rules, `validate()` |
| `test/spec.test.js` | rule and geometry tests (Node, no browser) |
| `test/render.test.js` | Playwright tests against the rendered page |
| `SPEC.md` | requirements, assumptions, test plan |
