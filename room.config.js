/*
 * Bedroom 6 — the room being modelled. Edit this file to change the room.
 * All measurements are in feet; ft(feet, inches) converts from feet-inches.
 * See SPEC.md for the source plan, the coordinate system and every rule the
 * test suite checks against this file.
 */
(function (root) {
  const ft = (feet, inches = 0) => feet + inches / 12;

  const config = {
    name: 'Bedroom 6',
    units: 'feet',

    // Interior dimensions from the plan. Ceiling height is an assumption.
    room: { width: ft(11, 1), length: ft(10, 5), height: ft(8) },

    /*
     * Walls, named as you meet them walking in through the door:
     *   back  (z = 0)      — the wall you come through: entry door + linen nook
     *   left  (x = 0)      — on your left: the bifold closet
     *   right (x = width)  — on your right: the two windows, exterior beyond
     *   front (z = length) — the blank wall facing you
     * "from" runs along the wall: from x = 0 on the back/front walls and from
     * z = 0 (the door end) on the left/right walls.
     */
    openings: [
      { id: 'door',     type: 'door',   wall: 'back',  from: ft(0, 9), width: ft(2, 6), height: ft(6, 8),
        hinge: 'start', swing: 'in' },
      { id: 'closet',   type: 'closet', wall: 'left',  from: ft(6, 4), width: ft(3, 6), height: ft(6, 8),
        depth: ft(2), alcoveFrom: ft(5, 8), alcoveWidth: ft(4, 9), door: 'bifold' },
      { id: 'window-1', type: 'window', wall: 'right', from: ft(2, 6), width: ft(2, 6), sill: ft(3), height: ft(4) },
      { id: 'window-2', type: 'window', wall: 'right', from: ft(5, 4), width: ft(2, 6), sill: ft(3), height: ft(4) },
    ],

    // Built-in solids inside the room outline (not movable furniture).
    // The linen closet is a box hanging off the back (hall) wall just right
    // of the entry door, exactly as it is drawn on the plan — the same wall,
    // not the left one.
    fixtures: [
      { id: 'linen', name: 'Linen closet (opens to hall)', x: ft(3, 6), z: 0, w: ft(2, 3), d: ft(3), h: ft(8) },
    ],

    /*
     * Furniture. Every piece can be switched on and off from the panel
     * (`enabled`), so this list doubles as the catalogue of options.
     *
     *   kind: 'floor' (default) — a box standing on the floor. x/z is the
     *         back-left corner; w along x, d along z, h up. Takes part in the
     *         overlap and clearance rules.
     *   kind: 'wall'  — mounted on `wall` at `from` along it, `y` off the
     *         floor; w along the wall, d out from it, h up.
     *   kind: 'rug'   — lies flat on the floor; other things stand on it.
     *
     *   facing: which way a floor piece looks ('x+', 'x-', 'z+', 'z-').
     *   shape:  how it is drawn; anything unknown falls back to a plain box.
     *
     * Positions here are the starting layout. Pieces can be dragged around the
     * floor (and along their wall) in the viewer; "Reset layout" puts them back.
     *
     * Only two patches of floor are big enough for a large piece in a room
     * this size, so the options come in pairs: sofa / vanity go under the
     * windows on the right, TV-on-easel / cabinet take the back wall facing
     * the bed. Turn on both of a pair and the spec check will say so.
     */
    furniture: [
      // --- in place today -------------------------------------------------
      // Bed head against the blank wall facing the door, clear of the closet.
      { id: 'bed',        name: 'Bed (queen)', enabled: true,
        x: ft(2, 7),  z: ft(3, 9),  w: ft(5),    d: ft(6, 8), h: ft(2),     color: '#7f8cff', facing: 'z-' },
      { id: 'nightstand', name: 'Nightstand', enabled: true,
        x: ft(7, 9),  z: ft(8, 11), w: ft(1, 8), d: ft(1, 6), h: ft(2),     color: '#c9a26b', shape: 'cabinet', facing: 'x-' },
      { id: 'dresser',    name: 'Dresser', enabled: true,
        x: ft(9, 5),  z: 0,         w: ft(1, 8), d: ft(3, 6), h: ft(2, 10), color: '#a3775b', shape: 'cabinet', facing: 'x-' },

      // --- floor options --------------------------------------------------
      // Sofa / vanity sit under the windows: both are below the 3'-0" sill.
      { id: 'sofa',     name: 'Sofa (two-seater)', enabled: true,  kind: 'floor', shape: 'sofa',     facing: 'x-',
        x: ft(8, 5),  z: ft(3, 8), w: ft(2, 8), d: ft(4, 6), h: ft(2, 8),  color: '#6d7f8f' },
      { id: 'vanity',   name: 'Vanity',            enabled: false, kind: 'floor', shape: 'vanity',   facing: 'x-',
        x: ft(9, 7),  z: ft(3, 8), w: ft(1, 6), d: ft(3, 6), h: ft(2, 6),  color: '#d8c3a5' },
      // TV / cabinet take the back wall between the linen nook and the dresser.
      { id: 'tv-easel', name: 'TV on easel',       enabled: true,  kind: 'floor', shape: 'easel-tv', facing: 'z+',
        x: ft(5, 11), z: 0,        w: ft(3, 6), d: ft(1, 8), h: ft(5),     color: '#b98a5a' },
      { id: 'cabinet',  name: 'Cabinet',           enabled: false, kind: 'floor', shape: 'cabinet',  facing: 'z+', doors: 2,
        x: ft(5, 11), z: 0,        w: ft(3, 6), d: ft(1, 8), h: ft(3),     color: '#7a6a58' },

      // --- rug ------------------------------------------------------------
      { id: 'rug',      name: 'Rug (8\' × 5\')',   enabled: true,  kind: 'rug',   shape: 'rug',
        x: ft(1, 6),  z: ft(4, 6), w: ft(8),    d: ft(5),    h: ft(0, 1),  color: '#8c6b73' },

      // --- wall-mounted options -------------------------------------------
      { id: 'mirror',   name: 'Full-length mirror', enabled: true, kind: 'wall',  shape: 'mirror',
        wall: 'left',  from: ft(0, 6),  w: ft(1, 6), d: ft(0, 2),  y: ft(0, 10), h: ft(5),    color: '#cfe3f0' },
      { id: 'board',    name: 'Bulletin board',     enabled: true, kind: 'wall',  shape: 'board',
        wall: 'front', from: ft(0, 5),  w: ft(3),    d: ft(0, 2),  y: ft(3, 6),  h: ft(2),    color: '#b98b5e' },
      { id: 'rack',     name: 'Clothes rack (wall)', enabled: true, kind: 'wall', shape: 'rack',
        wall: 'left',  from: ft(2, 9),  w: ft(2, 6), d: ft(1),     y: ft(4, 10), h: ft(1),    color: '#b6bcc4' },
      { id: 'shelves',  name: 'Floating shelves',   enabled: true, kind: 'wall',  shape: 'shelves', shelves: 3,
        wall: 'front', from: ft(8, 1),  w: ft(3),    d: ft(0, 10), y: ft(3, 4),  h: ft(2),    color: '#c9a26b' },
    ],

    // Outside the window wall. x is measured like "from" on that wall; "out"
    // is the distance beyond the wall's exterior face.
    exterior: {
      side: 'right',
      wallThickness: ft(0, 6),
      pad:   { id: 'pad',   name: 'Concrete pad',  x: -ft(0, 9), out: 0,        w: ft(11, 10), d: ft(4, 6) },
      ac:    { id: 'ac',    name: 'AC condenser',  x: ft(1),     out: ft(1),    w: ft(3),      d: ft(3), h: ft(3) },
      drain: { id: 'drain', name: 'Drain',         x: ft(5),     out: ft(2, 4), diameter: ft(0, 6) },
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = config;
  else root.ROOM_CONFIG = config;
})(typeof self !== 'undefined' ? self : this);
