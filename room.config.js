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

    // Walls: back (z = 0, hall side), front (z = length, exterior side),
    // left (x = 0), right (x = width). "from" is measured from the plan's
    // left edge for back/front walls and from its top edge for left/right.
    openings: [
      { id: 'door',     type: 'door',   wall: 'back',  from: ft(0, 9), width: ft(2, 6), height: ft(6, 8),
        hinge: 'start', swing: 'in' },
      { id: 'closet',   type: 'closet', wall: 'back',  from: ft(7),    width: ft(3, 6), height: ft(6, 8),
        depth: ft(2), alcoveFrom: ft(6, 4), alcoveWidth: ft(4, 9), door: 'bifold' },
      { id: 'window-1', type: 'window', wall: 'front', from: ft(3, 6), width: ft(2, 6), sill: ft(3), height: ft(4) },
      { id: 'window-2', type: 'window', wall: 'front', from: ft(6, 4), width: ft(2, 6), sill: ft(3), height: ft(4) },
    ],

    // Built-in solids inside the room outline (not movable furniture).
    fixtures: [
      { id: 'linen', name: 'Linen closet (opens to hall)', x: 0, z: ft(3), w: ft(2, 3), d: ft(3), h: ft(8) },
    ],

    // Placeholder furniture to exercise the clearance rules. x/z is the
    // piece's back-left corner on the floor; w along x, d along z, h up.
    furniture: [
      { id: 'bed',        name: 'Bed (queen)', x: ft(4, 5), z: ft(4),    w: ft(6, 8), d: ft(5),    h: ft(2),     color: '#7f8cff' },
      { id: 'nightstand', name: 'Nightstand',  x: ft(9, 4), z: ft(2, 3), w: ft(1, 8), d: ft(1, 6), h: ft(2),     color: '#c9a26b' },
      { id: 'dresser',    name: 'Dresser',     x: ft(0, 2), z: ft(6, 6), w: ft(1, 8), d: ft(3, 6), h: ft(2, 10), color: '#a3775b' },
    ],

    // Outside the front (window) wall. x is measured like "from" on that
    // wall; "out" is the distance beyond the wall's exterior face.
    exterior: {
      side: 'front',
      wallThickness: ft(0, 6),
      pad:   { id: 'pad',   name: 'Concrete pad',  x: -ft(0, 9), out: 0,        w: ft(11, 10), d: ft(4, 6) },
      ac:    { id: 'ac',    name: 'AC condenser',  x: ft(1),     out: ft(1),    w: ft(3),      d: ft(3), h: ft(3) },
      drain: { id: 'drain', name: 'Drain',         x: ft(5),     out: ft(2, 4), diameter: ft(0, 6) },
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = config;
  else root.ROOM_CONFIG = config;
})(typeof self !== 'undefined' ? self : this);
