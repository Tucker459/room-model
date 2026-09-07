/*
 * Room geometry helpers shared by the viewer (index.html) and the test suite.
 * Plain script: in the browser it defines window.RoomGeometry, in Node it is
 * a CommonJS module. All lengths are in feet. See SPEC.md for the coordinate
 * system and the rules enforced by validate().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoomGeometry = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const EPS = 1e-6;
  const WALLS = ['back', 'front', 'left', 'right'];

  const ft = (feet, inches = 0) => feet + inches / 12;

  // 11.0833 -> 11'-1"
  function fmtFt(x) {
    const totalIn = Math.round(x * 12);
    const sign = totalIn < 0 ? '-' : '';
    const abs = Math.abs(totalIn);
    return `${sign}${Math.floor(abs / 12)}'-${abs % 12}"`;
  }

  /*
   * Wall frame: origin (world x,z), u = unit vector along the wall, n = unit
   * inward normal, length. "from" positions along a wall are measured in the
   * u direction from the origin: from the plan's left edge (x = 0) for the
   * back/front walls and from the plan's top edge (z = 0) for left/right.
   */
  function wallFrame(room, wall) {
    const { width: W, length: L } = room;
    switch (wall) {
      case 'back':  return { wall, origin: [0, 0], u: [1, 0], n: [0, 1],  length: W };
      case 'front': return { wall, origin: [0, L], u: [1, 0], n: [0, -1], length: W };
      case 'left':  return { wall, origin: [0, 0], u: [0, 1], n: [1, 0],  length: L };
      case 'right': return { wall, origin: [W, 0], u: [0, 1], n: [-1, 0], length: L };
      default: throw new Error(`unknown wall "${wall}"`);
    }
  }

  // wall-local (along, inward) -> world [x, z]
  function toWorld(frame, along, inward) {
    return [
      frame.origin[0] + frame.u[0] * along + frame.n[0] * inward,
      frame.origin[1] + frame.u[1] * along + frame.n[1] * inward,
    ];
  }

  // Axis-aligned world rect {x, z, w, d} from a wall-local box.
  function localRect(frame, along, inward, w, d) {
    const [x0, z0] = toWorld(frame, along, inward);
    const [x1, z1] = toWorld(frame, along + w, inward + d);
    return { x: Math.min(x0, x1), z: Math.min(z0, z1), w: Math.abs(x1 - x0), d: Math.abs(z1 - z0) };
  }

  // Vertical extent of an opening.
  function openingSpan(o) {
    const bottom = o.type === 'window' ? (o.sill || 0) : 0;
    return { bottom, top: bottom + o.height };
  }

  /*
   * Split one wall into solid rectangular panels around its openings.
   * openings: [{from, width, bottom, top}] -> panels: [{u, v, w, h}]
   * (u along the wall, v up). Panels never overlap and together with the
   * openings tile the whole wall.
   */
  function wallPanels(length, height, openings) {
    const os = openings.slice().sort((a, b) => a.from - b.from);
    const panels = [];
    let cursor = 0;
    for (const o of os) {
      if (o.from > cursor + EPS) panels.push({ u: cursor, v: 0, w: o.from - cursor, h: height });
      if (o.bottom > EPS) panels.push({ u: o.from, v: 0, w: o.width, h: o.bottom });
      if (o.top < height - EPS) panels.push({ u: o.from, v: o.top, w: o.width, h: height - o.top });
      cursor = o.from + o.width;
    }
    if (cursor < length - EPS) panels.push({ u: cursor, v: 0, w: length - cursor, h: height });
    return panels;
  }

  // ---------- 2-D footprint helpers (plan view) ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS &&
           a.z < b.z + b.d - EPS && b.z < a.z + a.d - EPS;
  }
  function rectInside(inner, outer) {
    return inner.x >= outer.x - EPS && inner.z >= outer.z - EPS &&
           inner.x + inner.w <= outer.x + outer.w + EPS &&
           inner.z + inner.d <= outer.z + outer.d + EPS;
  }
  function rectIntersection(a, b) {
    const x = Math.max(a.x, b.x), z = Math.max(a.z, b.z);
    const x2 = Math.min(a.x + a.w, b.x + b.w), z2 = Math.min(a.z + a.d, b.z + b.d);
    if (x2 - x <= EPS || z2 - z <= EPS) return null;
    return { x, z, w: x2 - x, d: z2 - z };
  }
  function circleRectOverlap(cx, cz, r, rect) {
    const nx = clamp(cx, rect.x, rect.x + rect.w);
    const nz = clamp(cz, rect.z, rect.z + rect.d);
    const dx = nx - cx, dz = nz - cz;
    return dx * dx + dz * dz < r * r - EPS;
  }
  const spansOverlap = (a0, a1, b0, b1) => a0 < b1 - EPS && b0 < a1 - EPS;

  const roomRect = (room) => ({ x: 0, z: 0, w: room.width, d: room.length });
  const itemRect = (f) => ({ x: f.x, z: f.z, w: f.w, d: f.d });

  /*
   * Door swing: a quarter disc centred on the hinge with radius = leaf width,
   * swinging into the room. Its bounding square is the opening width along
   * the wall by the opening width into the room.
   */
  function doorSwing(room, door) {
    const frame = wallFrame(room, door.wall);
    const hingeAlong = door.hinge === 'end' ? door.from + door.width : door.from;
    const [cx, cz] = toWorld(frame, hingeAlong, 0);
    return { cx, cz, r: door.width, rect: localRect(frame, door.from, 0, door.width, door.width) };
  }
  function doorSwingHits(swing, rect) {
    const inter = rectIntersection(swing.rect, rect);
    return !!inter && circleRectOverlap(swing.cx, swing.cz, swing.r, inter);
  }

  const CLOSET_CLEARANCE = 2;   // ft of free floor in front of a closet opening
  const WINDOW_ZONE = 0.5;      // ft in front of a window where tall items would block it
  const AC_WALL_CLEARANCE = 1;  // ft between the house wall and the condenser

  function closetAlcove(room, c) {
    const frame = wallFrame(room, c.wall);
    const afrom = c.alcoveFrom ?? c.from, aw = c.alcoveWidth ?? c.width;
    return localRect(frame, afrom, -c.depth, aw, c.depth);
  }
  function closetClearance(room, c) {
    return localRect(wallFrame(room, c.wall), c.from, 0, c.width, CLOSET_CLEARANCE);
  }
  function windowZone(room, w) {
    return localRect(wallFrame(room, w.wall), w.from, 0, w.width, WINDOW_ZONE);
  }

  // Exterior items sit beyond the outer face of one wall. "out" is the
  // distance from that outer face; x is measured along the wall like "from".
  function exteriorRect(room, ex, item) {
    const frame = wallFrame(room, ex.side);
    const t = ex.wallThickness ?? 0;
    return localRect(frame, item.x, -(t + item.out + item.d), item.w, item.d);
  }
  function drainRect(room, ex, drain) {
    const r = (drain.diameter ?? 0.5) / 2;
    return exteriorRect(room, ex, { x: drain.x - r, out: drain.out - r, w: 2 * r, d: 2 * r });
  }

  // ---------- spec validation ----------
  function validate(config) {
    const issues = [];
    const say = (id, msg) => issues.push(`[${id}] ${msg}`);
    const room = config.room || {};
    const openings = config.openings || [];
    const fixtures = config.fixtures || [];
    const furniture = config.furniture || [];
    const name = (o, i) => o.id || o.name || `#${i + 1}`;

    for (const k of ['width', 'length', 'height']) {
      if (!(room[k] > 0)) say('R-01', `room.${k} must be a positive number`);
    }
    if (issues.length) return issues;
    const H = room.height;
    const rr = roomRect(room);

    // Openings sit on a real wall, inside it, and within the ceiling height.
    openings.forEach((o, i) => {
      const id = name(o, i);
      if (!WALLS.includes(o.wall)) { say('R-02', `${id}: unknown wall "${o.wall}"`); return; }
      const len = wallFrame(room, o.wall).length;
      if (!(o.width > 0)) say('R-02', `${id}: width must be positive`);
      if (o.from < -EPS) say('R-02', `${id}: starts before the wall begins`);
      if (o.from + o.width > len + EPS) say('R-02', `${id}: runs past the end of the ${o.wall} wall (${fmtFt(len)})`);
      const { bottom, top } = openingSpan(o);
      if (!(o.height > 0)) say('R-02', `${id}: height must be positive`);
      if (bottom < -EPS) say('R-02', `${id}: sill below the floor`);
      if (top > H + EPS) say('R-02', `${id}: top (${fmtFt(top)}) is above the ceiling (${fmtFt(H)})`);
    });
    // No two openings on the same wall overlap.
    for (let i = 0; i < openings.length; i++) for (let j = i + 1; j < openings.length; j++) {
      const a = openings[i], b = openings[j];
      if (a.wall === b.wall && spansOverlap(a.from, a.from + a.width, b.from, b.from + b.width))
        say('R-03', `${name(a, i)} and ${name(b, j)} overlap on the ${a.wall} wall`);
    }

    const solids = [
      ...fixtures.map((f, i) => ({ kind: 'fixture', label: name(f, i), rect: itemRect(f), h: f.h })),
      ...furniture.map((f, i) => ({ kind: 'furniture', label: name(f, i), rect: itemRect(f), h: f.h })),
    ];
    for (const s of solids) {
      if (!(s.rect.w > 0 && s.rect.d > 0 && s.h > 0)) say('R-07', `${s.label}: w, d and h must be positive`);
      else if (!rectInside(s.rect, rr)) say('R-07', `${s.label} extends outside the room`);
    }
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      if (rectsOverlap(solids[i].rect, solids[j].rect))
        say('R-08', `${solids[i].label} overlaps ${solids[j].label}`);
    }

    openings.forEach((o, i) => {
      if (!WALLS.includes(o.wall)) return;
      const id = name(o, i);
      if (o.type === 'door') {
        if (!['start', 'end'].includes(o.hinge)) say('R-04', `${id}: hinge must be "start" or "end"`);
        if (o.swing !== 'in') say('R-04', `${id}: only swing: "in" is modelled`);
        const swing = doorSwing(room, o);
        for (const s of solids) if (doorSwingHits(swing, s.rect)) say('R-04', `${s.label} is inside the swing of ${id}`);
      } else if (o.type === 'closet') {
        if (!(o.depth > 0)) say('R-05', `${id}: depth must be positive`);
        const afrom = o.alcoveFrom ?? o.from, aw = o.alcoveWidth ?? o.width;
        if (o.from < afrom - EPS || o.from + o.width > afrom + aw + EPS) say('R-05', `${id}: opening is wider than its alcove`);
        const zone = closetClearance(room, o);
        for (const s of solids) if (rectsOverlap(zone, s.rect)) say('R-05', `${s.label} is within ${fmtFt(CLOSET_CLEARANCE)} of the ${id} opening`);
      } else if (o.type === 'window') {
        const zone = windowZone(room, o);
        for (const s of solids) {
          if (!rectsOverlap(zone, s.rect)) continue;
          if (s.kind === 'fixture') say('R-06', `${s.label} covers ${id}`);
          else if (s.h > (o.sill || 0) + EPS) say('R-06', `${s.label} (${fmtFt(s.h)} tall) rises above the sill of ${id} (${fmtFt(o.sill || 0)})`);
        }
      } else say('R-02', `${id}: unknown opening type "${o.type}"`);
    });

    const ex = config.exterior;
    if (ex) {
      if (!WALLS.includes(ex.side)) say('R-09', `exterior.side "${ex.side}" is not a wall`);
      else {
        const pad = ex.pad && exteriorRect(room, ex, ex.pad);
        const ac = ex.ac && exteriorRect(room, ex, ex.ac);
        const drain = ex.drain && drainRect(room, ex, ex.drain);
        if (!pad) say('R-09', 'exterior.pad is required when exterior items are modelled');
        if (ac) {
          if (pad && !rectInside(ac, pad)) say('R-09', 'AC unit is not fully on the pad');
          if (ex.ac.out < AC_WALL_CLEARANCE - EPS) say('R-10', `AC unit needs ${fmtFt(AC_WALL_CLEARANCE)} clearance from the house wall (has ${fmtFt(ex.ac.out)})`);
          if (!(ex.ac.h > 0)) say('R-09', 'AC unit height must be positive');
        }
        if (drain) {
          if (pad && !rectInside(drain, pad)) say('R-11', 'drain is not on the pad');
          if (ac && rectsOverlap(drain, ac)) say('R-11', 'drain is underneath the AC unit');
        }
      }
    }
    return issues;
  }

  return {
    EPS, WALLS, ft, fmtFt, wallFrame, toWorld, localRect, openingSpan, wallPanels,
    rectsOverlap, rectInside, rectIntersection, circleRectOverlap, spansOverlap,
    roomRect, itemRect, doorSwing, doorSwingHits, closetAlcove, closetClearance,
    windowZone, exteriorRect, drainRect, validate,
    CLOSET_CLEARANCE, WINDOW_ZONE, AC_WALL_CLEARANCE,
  };
});
