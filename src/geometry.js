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
   * Furniture kinds. 'floor' pieces stand on the floor and take part in the
   * overlap/clearance rules; 'wall' pieces hang off a wall at height y and
   * only have to keep clear of openings and of whatever stands under them;
   * 'rug' pieces lie flat, so anything may stand on them.
   */
  const itemKind = (f) => f.kind || 'floor';
  const isEnabled = (f) => f.enabled !== false;
  const activeFurniture = (config) => (config.furniture || []).filter(isEnabled);
  const furnitureOfKind = (config, kind) => activeFurniture(config).filter(f => itemKind(f) === kind);

  // Footprint of a wall-mounted piece: w along the wall, d out from it.
  const wallItemRect = (room, f) => localRect(wallFrame(room, f.wall), f.from, 0, f.w, f.d);
  // Vertical extent of a wall-mounted piece.
  const wallItemSpan = (f) => ({ bottom: f.y || 0, top: (f.y || 0) + f.h });

  const RUG_MAX_THICKNESS = 0.25; // ft — thicker than this and it is not a rug

  /*
   * How far a rect reaches inside a wall: the largest inward distance of its
   * four corners, measured along that wall's inward normal. <= 0 means the
   * whole rect is on the outside (a closet alcove, the exterior pad).
   */
  function inwardDepth(room, wall, rect) {
    const f = wallFrame(room, wall);
    const corners = [[rect.x, rect.z], [rect.x + rect.w, rect.z],
                     [rect.x, rect.z + rect.d], [rect.x + rect.w, rect.z + rect.d]];
    return Math.max(...corners.map(([x, z]) => (x - f.origin[0]) * f.n[0] + (z - f.origin[1]) * f.n[1]));
  }

  // ---------- moving furniture ----------
  const NUDGE = 1 / 12;                            // ft — positions snap to the inch
  const FACINGS = ['z+', 'x+', 'z-', 'x-'];        // 90° steps, clockwise in plan
  const snapTo = (v, step = NUDGE) => Math.round(v / step) * step;

  // Keep a footprint of w × d inside the room outline.
  function clampToRoom(room, w, d, x, z) {
    return {
      x: Math.min(Math.max(x, 0), Math.max(0, room.width - w)),
      z: Math.min(Math.max(z, 0), Math.max(0, room.length - d)),
    };
  }
  // Keep a wall piece inside its wall and under the ceiling.
  function clampToWall(room, f, from, y) {
    const len = wallFrame(room, f.wall).length;
    return {
      from: Math.min(Math.max(from, 0), Math.max(0, len - f.w)),
      y: Math.min(Math.max(y, 0), Math.max(0, room.height - f.h)),
    };
  }
  /*
   * A quarter turn about the piece's own centre. A floor piece turns in plan:
   * w and d swap and x/z shift so the centre stays put. A wall piece turns in
   * the plane of its wall: w and h swap (landscape <-> portrait) about the
   * centre of the panel, and its projection out from the wall (d) is unchanged.
   */
  function rotatedItem(f) {
    if (itemKind(f) === 'wall') {
      const ca = f.from + f.w / 2, cy = (f.y || 0) + f.h / 2;
      return { w: f.h, h: f.w, from: ca - f.h / 2, y: cy - f.w / 2 };
    }
    const facing = FACINGS[(FACINGS.indexOf(f.facing || 'z+') + 1) % FACINGS.length];
    const cx = f.x + f.w / 2, cz = f.z + f.d / 2;
    return { facing, w: f.d, d: f.w, x: cx - f.d / 2, z: cz - f.w / 2 };
  }
  /*
   * Send a wall piece round to the next wall, keeping how far along it sits as
   * a fraction so it lands in a comparable spot on a wall of another length.
   */
  function nextWall(room, f) {
    const wall = WALLS[(WALLS.indexOf(f.wall) + 1) % WALLS.length];
    const was = wallFrame(room, f.wall).length, now = wallFrame(room, wall).length;
    const t = was > f.w ? (f.from / (was - f.w)) : 0;
    return { wall, from: Math.max(0, now - f.w) * t };
  }
  // Turn a piece a quarter turn in place, keeping it inside the room / wall.
  function rotateItem(room, f) {
    Object.assign(f, rotatedItem(f));
    if (itemKind(f) === 'wall') Object.assign(f, clampToWall(room, f, f.from, f.y || 0));
    else Object.assign(f, clampToRoom(room, f.w, f.d, f.x, f.z));
    return f;
  }

  // Move a piece to a new position, snapped and clamped. Mutates and returns it.
  function placeFloorItem(room, f, x, z) {
    const p = clampToRoom(room, f.w, f.d, snapTo(x), snapTo(z));
    f.x = p.x; f.z = p.z;
    return f;
  }
  function placeWallItem(room, f, from, y) {
    const p = clampToWall(room, f, snapTo(from), snapTo(y));
    f.from = p.from; f.y = p.y;
    return f;
  }

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

  /*
   * ---------- saving and loading a layout ----------
   * A layout is just where every piece stands, plus the room it stands in —
   * enough to put a dragged-around room back together, and small enough to
   * keep in localStorage or hand around as a file. It carries no names,
   * colours or shapes: those always come from room.config.js, so a saved
   * layout keeps working when the catalogue changes.
   */
  const LAYOUT_VERSION = 1;
  const NUMERIC = ['w', 'd', 'h', 'x', 'z', 'from', 'y'];

  function layoutOf(config) {
    return {
      version: LAYOUT_VERSION,
      room: { width: config.room.width, length: config.room.length, height: config.room.height },
      furniture: (config.furniture || []).map(f => {
        const o = { id: f.id, enabled: isEnabled(f), w: f.w, d: f.d, h: f.h };
        if (itemKind(f) === 'wall') { o.wall = f.wall; o.from = f.from; o.y = f.y || 0; }
        else { o.x = f.x; o.z = f.z; if (f.facing) o.facing = f.facing; }
        return o;
      }),
    };
  }

  /*
   * Apply a layout to a config, in place. Anything unrecognised is skipped
   * rather than trusted: ids that are no longer in the catalogue, values that
   * are not finite numbers, positions outside the room. Returns the ids that
   * were actually moved; throws only if the payload is not a layout at all.
   */
  function applyLayout(config, layout) {
    if (!layout || typeof layout !== 'object' || !Array.isArray(layout.furniture))
      throw new Error('that file is not a saved layout');
    if (layout.version !== LAYOUT_VERSION)
      throw new Error(`layout version ${layout.version} is not supported (this is version ${LAYOUT_VERSION})`);

    const room = layout.room || {};
    for (const k of ['width', 'length', 'height']) {
      if (Number.isFinite(room[k]) && room[k] > 0) config.room[k] = room[k];
    }
    const byId = new Map((config.furniture || []).map(f => [f.id, f]));
    const applied = [];
    for (const saved of layout.furniture) {
      const f = saved && byId.get(saved.id);
      if (!f) continue;
      if (typeof saved.enabled === 'boolean') f.enabled = saved.enabled;
      for (const k of NUMERIC) if (Number.isFinite(saved[k])) f[k] = saved[k];
      if (FACINGS.includes(saved.facing)) f.facing = saved.facing;
      if (itemKind(f) === 'wall') {
        if (WALLS.includes(saved.wall)) f.wall = saved.wall;
        placeWallItem(config.room, f, f.from, f.y || 0);
      } else {
        placeFloorItem(config.room, f, f.x, f.z);
      }
      applied.push(f.id);
    }
    return applied;
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

    // Only switched-on furniture is modelled; sort it by kind.
    const active = furniture.map((f, i) => ({ f, label: name(f, i) })).filter(e => isEnabled(e.f));
    const floorItems = active.filter(e => itemKind(e.f) === 'floor');
    const wallItems  = active.filter(e => itemKind(e.f) === 'wall');
    const rugs       = active.filter(e => itemKind(e.f) === 'rug');
    for (const e of active) {
      const k = itemKind(e.f);
      if (!['floor', 'wall', 'rug'].includes(k)) say('R-07', `${e.label}: unknown furniture kind "${k}"`);
    }

    const solids = [
      ...fixtures.map((f, i) => ({ kind: 'fixture', label: name(f, i), rect: itemRect(f), h: f.h })),
      ...floorItems.map(e => ({ kind: 'furniture', label: e.label, rect: itemRect(e.f), h: e.f.h })),
    ];
    for (const s of solids) {
      if (!(s.rect.w > 0 && s.rect.d > 0 && s.h > 0)) say('R-07', `${s.label}: w, d and h must be positive`);
      else if (!rectInside(s.rect, rr)) say('R-07', `${s.label} extends outside the room`);
    }
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      if (rectsOverlap(solids[i].rect, solids[j].rect))
        say('R-08', `${solids[i].label} overlaps ${solids[j].label}`);
    }

    // R-12 wall-mounted pieces: on a real wall, inside it, under the ceiling,
    // clear of the openings, of anything standing under them, and of each other.
    const mounted = [];
    for (const { f, label } of wallItems) {
      if (!WALLS.includes(f.wall)) { say('R-12', `${label}: unknown wall "${f.wall}"`); continue; }
      if (!(f.w > 0 && f.d > 0 && f.h > 0)) { say('R-12', `${label}: w, d and h must be positive`); continue; }
      const len = wallFrame(room, f.wall).length;
      const span = wallItemSpan(f);
      if (f.from < -EPS || f.from + f.w > len + EPS)
        say('R-12', `${label} runs past the end of the ${f.wall} wall (${fmtFt(len)})`);
      if (span.bottom < -EPS) say('R-12', `${label} is mounted below the floor`);
      if (span.top > H + EPS) say('R-12', `${label} reaches ${fmtFt(span.top)}, above the ceiling (${fmtFt(H)})`);
      openings.forEach((o, i) => {
        if (o.wall !== f.wall || !WALLS.includes(o.wall)) return;
        if (!spansOverlap(f.from, f.from + f.w, o.from, o.from + o.width)) return;
        const os = openingSpan(o);
        if (spansOverlap(span.bottom, span.top, os.bottom, os.top)) say('R-12', `${label} covers ${name(o, i)}`);
      });
      const rect = wallItemRect(room, f);
      for (const s of solids) {
        if (rectsOverlap(rect, s.rect) && spansOverlap(span.bottom, span.top, 0, s.h))
          say('R-12', `${label} runs into ${s.label}`);
      }
      for (const m of mounted) {
        if (rectsOverlap(rect, m.rect) && spansOverlap(span.bottom, span.top, m.span.bottom, m.span.top))
          say('R-12', `${label} runs into ${m.label}`);
      }
      mounted.push({ label, rect, span });
    }

    // R-13 rugs lie flat inside the room; anything may stand on them.
    for (const { f, label } of rugs) {
      if (!(f.w > 0 && f.d > 0 && f.h > 0)) { say('R-13', `${label}: w, d and h must be positive`); continue; }
      if (!rectInside(itemRect(f), rr)) say('R-13', `${label} extends outside the room`);
      if (f.h > RUG_MAX_THICKNESS + EPS)
        say('R-13', `${label} is ${fmtFt(f.h)} thick; a rug must lie flat (${fmtFt(RUG_MAX_THICKNESS)} or less)`);
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
    itemKind, isEnabled, activeFurniture, furnitureOfKind, wallItemRect, wallItemSpan,
    inwardDepth, snapTo, clampToRoom, clampToWall, rotatedItem, rotateItem, nextWall,
    placeFloorItem, placeWallItem, layoutOf, applyLayout,
    CLOSET_CLEARANCE, WINDOW_ZONE, AC_WALL_CLEARANCE, RUG_MAX_THICKNESS, NUDGE, FACINGS,
    LAYOUT_VERSION,
  };
});
