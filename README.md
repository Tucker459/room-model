# Room Model

A basic, interactive 3-D layout of a room, rendered in the browser with
[Three.js](https://threejs.org/). No build step, no dependencies to install.

## Run it

Open `index.html` in a browser. It loads Three.js from a CDN, so you need an
internet connection the first time.

If your browser blocks module scripts on `file://` URLs, serve the folder instead:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Controls

- Left-drag: orbit
- Scroll: zoom
- Right-drag: pan
- Side panel: change room width, length, and height live

## Describe your room

Edit the `ROOM_CONFIG` block near the top of `index.html`. All measurements are
in feet.

```js
window.ROOM_CONFIG = {
  room: { width: 12, length: 14, height: 9 },
  furniture: [
    { name: "Bed (queen)", x: 3.5, z: 0.25, w: 5, d: 6.7, h: 2, color: "#7f8cff" },
  ],
};
```

Coordinate system:

- `x` runs along the room's width (left to right), `z` along its length
  (back wall to front), `y` is up.
- `(0, 0)` is the back-left corner of the floor.
- For each piece of furniture, `x`/`z` is the position of its back-left corner,
  `w` is its size along `x`, `d` along `z`, and `h` its height.

Walls are drawn single-sided facing inward, so whichever wall is between the
camera and the room is hidden and you can always see inside.
