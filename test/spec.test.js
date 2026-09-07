/*
 * Spec tests for room.config.js — see SPEC.md for the requirement IDs.
 * Runs with the built-in Node test runner: `node --test test/`.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/geometry');
const config = require('../room.config');

const { ft } = G;
const TOL = 1 / 16 / 12; // one sixteenth of an inch, in feet
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= TOL, `${msg}: expected ${G.fmtFt(b)}, got ${G.fmtFt(a)}`);
const clone = (o) => JSON.parse(JSON.stringify(o));
const byId = (id) => config.openings.find(o => o.id === id);
const issuesMatching = (cfg, re) => G.validate(cfg).filter(i => re.test(i));
// positions are snapped to the inch on every move, so compare them at that scale
const sameLen = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b;

// ---------- R-01 room envelope ----------
test('R-01 room is 11\'-1" wide by 10\'-5" long with a positive ceiling height', () => {
  near(config.room.width, ft(11, 1), 'width');
  near(config.room.length, ft(10, 5), 'length');
  assert.ok(config.room.height >= ft(7, 6), 'ceiling height is at least 7\'-6"');
  assert.equal(config.units, 'feet');
});

// ---------- R-02 / R-03 openings ----------
test('R-02 every opening lies inside its wall and below the ceiling', () => {
  for (const o of config.openings) {
    assert.ok(G.WALLS.includes(o.wall), `${o.id} names a real wall`);
    const len = G.wallFrame(config.room, o.wall).length;
    assert.ok(o.from >= 0 && o.from + o.width <= len + G.EPS, `${o.id} fits on the ${o.wall} wall`);
    assert.ok(G.openingSpan(o).top <= config.room.height + G.EPS, `${o.id} is below the ceiling`);
  }
  assert.deepEqual(issuesMatching(config, /R-02/), []);
});

test('R-03 openings on the same wall never overlap', () => {
  assert.deepEqual(issuesMatching(config, /R-03/), []);
  const bad = clone(config);
  bad.openings.find(o => o.id === 'window-2').from = bad.openings.find(o => o.id === 'window-1').from + 1;
  assert.ok(issuesMatching(bad, /R-03/).length > 0, 'overlapping windows are reported');
});

// ---------- R-04 door ----------
test('R-04 exactly one entry door, on the back wall, hinged at the plan\'s left, swinging in', () => {
  const doors = config.openings.filter(o => o.type === 'door');
  assert.equal(doors.length, 1);
  const [door] = doors;
  assert.equal(door.wall, 'back');
  assert.equal(door.hinge, 'start');
  assert.equal(door.swing, 'in');
  assert.ok(door.width >= ft(2, 4) && door.width <= ft(3), 'a 2\'-4" to 3\'-0" leaf');
  assert.ok(door.height >= ft(6, 6), 'at least 6\'-6" tall');
});

test('R-04 the door swing is clear of fixtures and furniture', () => {
  assert.deepEqual(issuesMatching(config, /R-04/), []);
  const bad = clone(config);
  bad.furniture.push({ id: 'blocker', x: ft(1), z: ft(0, 6), w: 1, d: 1, h: 2 });   // in the doorway
  assert.match(issuesMatching(bad, /R-04/).join('\n'), /blocker is inside the swing of door/);
});

test('R-04 door swing geometry is a quarter disc into the room', () => {
  const door = byId('door');
  const swing = G.doorSwing(config.room, door);
  assert.equal(swing.cx, door.from);
  assert.equal(swing.cz, 0);
  assert.equal(swing.r, door.width);
  // a box tucked in the far corner of the bounding square, outside the arc, is fine
  const corner = { x: door.from + door.width - 0.2, z: door.width - 0.2, w: 0.2, d: 0.2 };
  assert.equal(G.doorSwingHits(swing, corner), false);
  // a box against the hinge wall inside the arc is a hit
  assert.equal(G.doorSwingHits(swing, { x: door.from + 0.5, z: 0.5, w: 0.5, d: 0.5 }), true);
});

// ---------- R-05 closet ----------
test('R-05 a bifold closet on the left wall with a 2 ft deep alcove that contains its opening', () => {
  const closets = config.openings.filter(o => o.type === 'closet');
  assert.equal(closets.length, 1);
  const [c] = closets;
  assert.equal(c.wall, 'left', 'on your left as you walk in');
  assert.equal(c.door, 'bifold');
  near(c.depth, ft(2), 'closet depth');
  const afrom = c.alcoveFrom ?? c.from, aw = c.alcoveWidth ?? c.width;
  assert.ok(c.from >= afrom - G.EPS && c.from + c.width <= afrom + aw + G.EPS, 'opening inside alcove');
  // the alcove is recessed past the wall line, not eating into the room
  const alcove = G.closetAlcove(config.room, c);
  assert.ok(G.inwardDepth(config.room, c.wall, alcove) <= G.EPS, 'alcove is behind the wall line');
  assert.deepEqual(issuesMatching(config, /R-05/), []);
});

test('R-05 nothing stands within 2 ft of the closet opening', () => {
  const c = byId('closet');
  const zone = G.closetClearance(config.room, c);
  const bad = clone(config);
  bad.furniture.push({ id: 'chest', x: zone.x + 0.2, z: zone.z + 0.2, w: 1.5, d: 1.5, h: 2 });
  assert.match(issuesMatching(bad, /R-05/).join('\n'), /chest is within 2'-0" of the closet opening/);
});

// ---------- R-06 windows ----------
test('R-06 two windows on the right (exterior) wall with a 3 ft sill', () => {
  const wins = config.openings.filter(o => o.type === 'window');
  assert.equal(wins.length, 2);
  for (const w of wins) {
    assert.equal(w.wall, 'right', 'on your right as you walk in');
    near(w.sill, ft(3), `${w.id} sill`);
    assert.ok(w.width >= ft(2) && w.height >= ft(3), `${w.id} is a usable size`);
  }
  const [a, b] = wins.slice().sort((p, q) => p.from - q.from);
  assert.ok(b.from >= a.from + a.width, 'windows are side by side');
  assert.ok(b.from - (a.from + a.width) <= ft(1), 'with no more than a 1 ft mullion between them');
});

test('R-06 nothing taller than the sill stands in front of a window', () => {
  assert.deepEqual(issuesMatching(config, /R-06/), []);
  const zone = G.windowZone(config.room, byId('window-1'));
  const at = { x: zone.x, z: zone.z, w: zone.w, d: zone.d };
  const bad = clone(config);
  bad.furniture.push({ id: 'bookcase', ...at, h: ft(6) });
  assert.match(issuesMatching(bad, /R-06/).join('\n'), /bookcase .* rises above the sill of window-1/);
  const ok = clone(config);
  ok.furniture.push({ id: 'bench', ...at, h: ft(1, 6) });
  assert.deepEqual(issuesMatching(ok, /R-06/), [], 'a low bench under the window is fine');
});

// ---------- R-07 / R-08 solids ----------
test('R-07 the linen nook hangs off the door wall, clear of the swing, floor to ceiling', () => {
  const nook = config.fixtures.find(f => f.id === 'linen');
  assert.ok(nook, 'nook exists');
  const door = byId('door');
  assert.equal(nook.z, 0, 'against the back wall — the same wall as the door');
  assert.ok(nook.x >= door.from + door.width, 'starts past the door opening');
  assert.equal(G.doorSwingHits(G.doorSwing(config.room, door), G.itemRect(nook)), false,
    'and clear of the door swing');
  assert.ok(G.rectInside(G.itemRect(nook), G.roomRect(config.room)));
  near(nook.h, config.room.height, 'runs floor to ceiling');
  assert.deepEqual(issuesMatching(config, /R-07/), []);
});

test('R-07 the door and the linen nook share one wall', () => {
  const nook = config.fixtures.find(f => f.id === 'linen');
  const door = byId('door');
  const frame = G.wallFrame(config.room, door.wall);
  // the nook's back face lies flat on the door's wall line
  assert.ok(Math.abs(G.inwardDepth(config.room, door.wall, G.itemRect(nook)) - nook.d) < G.EPS,
    'the nook is flush against the door wall and projects into the room');
  // and it sits within that wall, past the door opening
  const along = (x, z) => (x - frame.origin[0]) * frame.u[0] + (z - frame.origin[1]) * frame.u[1];
  const a0 = along(nook.x, nook.z), a1 = a0 + nook.w;
  assert.ok(a0 >= door.from + door.width - G.EPS, 'starts past the door leaf');
  assert.ok(a1 <= frame.length + G.EPS, 'and stays on the wall');
});

test('R-07 solids outside the room are reported', () => {
  const bad = clone(config);
  bad.furniture.push({ id: 'outside', x: bad.room.width - 1, z: 1, w: 2, d: 1, h: 1 });
  assert.match(issuesMatching(bad, /R-07/).join('\n'), /outside extends outside the room/);
});

test('R-08 fixtures and furniture never overlap each other', () => {
  assert.deepEqual(issuesMatching(config, /R-08/), []);
  const bad = clone(config);
  const bed = bad.furniture.find(f => f.id === 'bed');
  bad.furniture.push({ id: 'lamp', x: bed.x + 1, z: bed.z + 1, w: 1, d: 1, h: 1 });
  assert.match(issuesMatching(bad, /R-08/).join('\n'), /bed overlaps lamp/);
});

// ---------- R-12 wall-mounted furniture ----------
test('R-12 every wall-mounted piece fits its wall, clears the openings and what stands below', () => {
  const mounted = G.furnitureOfKind(config, 'wall');
  assert.ok(mounted.length >= 4, 'mirror, bulletin board, clothes rack and shelves are modelled');
  for (const f of mounted) {
    assert.ok(G.WALLS.includes(f.wall), `${f.id} names a real wall`);
    const len = G.wallFrame(config.room, f.wall).length;
    assert.ok(f.from >= 0 && f.from + f.w <= len + G.EPS, `${f.id} fits on the ${f.wall} wall`);
    assert.ok(G.wallItemSpan(f).top <= config.room.height + G.EPS, `${f.id} is below the ceiling`);
  }
  assert.deepEqual(issuesMatching(config, /R-12/), []);
});

test('R-12 a wall piece over a window, over a tall item, or above the ceiling is reported', () => {
  const w = byId('window-1');
  const overWindow = clone(config);
  overWindow.furniture.push({ id: 'blind-spot', kind: 'wall', wall: w.wall, from: w.from,
    w: 2, d: 0.2, y: w.sill + 0.5, h: 1 });
  assert.match(issuesMatching(overWindow, /R-12/).join('\n'), /blind-spot covers window-1/);

  // a shelf hung at knee height where a floor piece already stands
  const sofa = config.furniture.find(f => f.id === 'sofa');
  const sofaWall = sofa.x + sofa.w >= config.room.width - G.EPS ? 'right' : 'left';
  const fr = G.wallFrame(config.room, sofaWall);
  const along = (sofa.z - fr.origin[1]) * fr.u[1] + (sofa.x - fr.origin[0]) * fr.u[0];
  const intoFurniture = clone(config);
  intoFurniture.furniture.push({ id: 'low-shelf', kind: 'wall', wall: sofaWall,
    from: along + 0.5, w: 1, d: 0.5, y: 0.5, h: 1 });
  assert.match(issuesMatching(intoFurniture, /R-12/).join('\n'), /low-shelf runs into sofa/);

  const tooHigh = clone(config);
  tooHigh.furniture.find(f => f.id === 'mirror').y = config.room.height - 1;
  assert.match(issuesMatching(tooHigh, /R-12/).join('\n'), /above the ceiling/);
});

test('R-12 wall pieces do not take part in the floor rules', () => {
  // somewhere in the layout a wall piece hangs over a floor piece — that is
  // the whole point of mounting things on walls, and no rule may complain
  const pairs = [];
  for (const w of G.furnitureOfKind(config, 'wall')) {
    const rect = G.wallItemRect(config.room, w);
    for (const f of G.furnitureOfKind(config, 'floor')) {
      if (G.rectsOverlap(rect, G.itemRect(f))) pairs.push([w, f]);
    }
  }
  assert.ok(pairs.length > 0, 'at least one wall piece hangs over a floor piece in plan');
  for (const [w, f] of pairs) {
    assert.ok(G.wallItemSpan(w).bottom >= f.h, `${w.id} clears ${f.id} (${G.fmtFt(w.y)} above a ${G.fmtFt(f.h)} piece)`);
  }
  assert.deepEqual(issuesMatching(config, /R-08|R-12/), [], 'so neither rule fires');
});

// ---------- R-13 rugs ----------
test('R-13 the rug lies flat inside the room and nothing collides with it', () => {
  const rugs = G.furnitureOfKind(config, 'rug');
  assert.equal(rugs.length, 1);
  const [rug] = rugs;
  assert.ok(G.rectInside(G.itemRect(rug), G.roomRect(config.room)), 'inside the room');
  assert.ok(rug.h <= G.RUG_MAX_THICKNESS, 'flat enough to walk over');
  assert.equal(G.rectsOverlap(G.itemRect(rug), G.itemRect(config.furniture.find(f => f.id === 'bed'))), true,
    'the bed stands on it');
  assert.deepEqual(issuesMatching(config, /R-13|R-08/), [], 'which is not an overlap');
});

test('R-13 a rug that is too thick or hangs outside the room is reported', () => {
  const thick = clone(config);
  thick.furniture.find(f => f.id === 'rug').h = 1;
  assert.match(issuesMatching(thick, /R-13/).join('\n'), /must lie flat/);
  const outside = clone(config);
  outside.furniture.find(f => f.id === 'rug').x = config.room.width - 1;
  assert.match(issuesMatching(outside, /R-13/).join('\n'), /extends outside the room/);
});

// ---------- furniture options ----------
test('the furniture catalogue offers every requested option and each one places cleanly', () => {
  const want = ['vanity', 'mirror', 'tv-easel', 'board', 'shelves', 'rack', 'cabinet', 'sofa', 'rug'];
  for (const id of want) assert.ok(config.furniture.some(f => f.id === id), `${id} is on offer`);
  // Two patches of floor, two options each: only one of a pair fits at a time.
  const SLOTS = [['sofa', 'vanity'], ['tv-easel', 'cabinet']];
  const slotMates = (id) => (SLOTS.find(s => s.includes(id)) || []).filter(o => o !== id);
  for (const id of want) {
    const cfg = clone(config);
    for (const mate of slotMates(id)) cfg.furniture.find(f => f.id === mate).enabled = false;
    cfg.furniture.find(f => f.id === id).enabled = true;
    assert.deepEqual(G.validate(cfg), [], `${id} keeps the layout valid`);
  }
  // and the pairs really are alternatives, not extras
  for (const [a, b] of SLOTS) {
    const cfg = clone(config);
    for (const id of [a, b]) cfg.furniture.find(f => f.id === id).enabled = true;
    assert.match(G.validate(cfg).join('\n'), new RegExp(`R-08.*(${a}|${b})`),
      `${a} and ${b} share a slot, so both at once is a clash`);
  }
});

test('switched-off furniture is ignored by every rule', () => {
  const cfg = clone(config);
  cfg.furniture.push({ id: 'wardrobe', enabled: false, x: 0, z: 0, w: 4, d: 4, h: 7 });
  assert.deepEqual(G.validate(cfg), [], 'a disabled piece in the doorway changes nothing');
  cfg.furniture.find(f => f.id === 'wardrobe').enabled = true;
  assert.ok(G.validate(cfg).length > 0, 'switching it on breaks the door swing and the nook');
});

// ---------- R-09 .. R-11 exterior ----------
test('R-09 the exterior pad, AC unit and drain are outside the window wall, AC fully on the pad', () => {
  const ex = config.exterior;
  assert.equal(ex.side, config.openings.find(o => o.type === 'window').wall,
    'the pad sits outside the wall the windows are in');
  const pad = G.exteriorRect(config.room, ex, ex.pad);
  const ac = G.exteriorRect(config.room, ex, ex.ac);
  const drain = G.drainRect(config.room, ex, ex.drain);
  for (const [n, r] of [['pad', pad], ['ac', ac], ['drain', drain]])
    assert.ok(G.inwardDepth(config.room, ex.side, r) <= -ex.wallThickness + G.EPS,
      `${n} is beyond the exterior wall face`);
  assert.ok(G.rectInside(ac, pad), 'AC unit on the pad');
  assert.ok(G.rectInside(drain, pad), 'drain on the pad');
  assert.deepEqual(issuesMatching(config, /R-09/), []);
});

test('R-10 the AC unit keeps at least 1 ft from the house wall', () => {
  assert.ok(config.exterior.ac.out >= 1 - G.EPS);
  const bad = clone(config);
  bad.exterior.ac.out = 0.25;
  assert.match(issuesMatching(bad, /R-10/).join('\n'), /needs 1'-0" clearance/);
});

test('R-11 the drain is on the pad and not under the AC unit', () => {
  assert.deepEqual(issuesMatching(config, /R-11/), []);
  const bad = clone(config);
  bad.exterior.drain.x = bad.exterior.ac.x + 1;
  bad.exterior.drain.out = bad.exterior.ac.out + 1;
  assert.match(issuesMatching(bad, /R-11/).join('\n'), /drain is underneath the AC unit/);
});

// ---------- the whole config passes ----------
test('R-00 room.config.js passes every validate() rule', () => {
  assert.deepEqual(G.validate(config), []);
});

// ---------- moving furniture ----------
test('G-05 pieces snap to the inch and stay inside the room when moved', () => {
  const room = { width: 11, length: 10, height: 8 };
  assert.equal(G.snapTo(3.51), 3.5, 'snaps to the nearest inch');
  near(G.snapTo(3 + 1 / 24), 3 + 1 / 12, 'half an inch rounds up to the next one');

  const f = { id: 'x', x: 1, z: 1, w: 4, d: 2, h: 2 };
  G.placeFloorItem(room, f, 2.02, 3.02);
  assert.deepEqual([f.x, f.z], [2, 3], 'moved and snapped');
  G.placeFloorItem(room, f, -5, 99);
  assert.deepEqual([f.x, f.z], [0, 8], 'clamped to the room, footprint included');
  assert.ok(G.rectInside(G.itemRect(f), G.roomRect(room)));

  const wall = { id: 'w', kind: 'wall', wall: 'back', from: 1, y: 3, w: 3, d: 0.5, h: 2 };
  G.placeWallItem(room, wall, 99, 99);
  assert.deepEqual([wall.from, wall.y], [room.width - 3, room.height - 2], 'clamped to wall and ceiling');
  G.placeWallItem(room, wall, -1, -1);
  assert.deepEqual([wall.from, wall.y], [0, 0]);
});

test('G-05 a quarter turn swaps the footprint about the piece\'s own centre', () => {
  const f = { x: 2, z: 3, w: 4, d: 1, facing: 'z+' };
  const before = { cx: f.x + f.w / 2, cz: f.z + f.d / 2 };
  Object.assign(f, G.rotatedItem(f));
  assert.deepEqual([f.w, f.d], [1, 4], 'w and d swap');
  assert.equal(f.facing, 'x+', 'and it turns a quarter step');
  assert.deepEqual([f.x + f.w / 2, f.z + f.d / 2], [before.cx, before.cz], 'the centre stays put');
  for (let i = 0; i < 3; i++) Object.assign(f, G.rotatedItem(f));
  assert.deepEqual([f.w, f.d, f.facing], [4, 1, 'z+'], 'four turns is a full circle');
});

test('moving a piece into the door swing or a window is reported, not prevented', () => {
  const cfg = clone(config);
  const sofa = cfg.furniture.find(f => f.id === 'sofa');
  const door = byId('door');
  const swing = G.doorSwing(config.room, door);
  G.placeFloorItem(cfg.room, sofa, swing.cx, 0);      // dragged into the doorway
  assert.deepEqual([sofa.x, sofa.z], [G.snapTo(swing.cx), 0], 'the move goes through');
  assert.match(G.validate(cfg).join('\n'), /R-04.*sofa is inside the swing of door/);

  const w = byId('window-1');
  const tall = clone(config);
  const zone = G.windowZone(config.room, w);
  const bookcase = { id: 'bookcase', x: 0, z: 0, w: 1.5, d: 1.5, h: w.sill + 2 };
  tall.furniture.push(bookcase);
  G.placeFloorItem(tall.room, bookcase, zone.x, zone.z);   // dragged in front of the window
  assert.match(G.validate(tall).join('\n'), /R-06.*bookcase .* rises above the sill of window-1/);

  // the cabinet is exactly sill height, so it is allowed to live under a window
  const cab = config.furniture.find(f => f.id === 'cabinet');
  assert.ok(cab.h <= w.sill, `a ${G.fmtFt(cab.h)} cabinet clears a ${G.fmtFt(w.sill)} sill`);
});

test('G-05 a wall piece turns in the plane of its wall', () => {
  const room = { width: 11, length: 10, height: 8 };
  const f = { id: 'm', kind: 'wall', wall: 'back', from: 3, y: 2, w: 1.5, d: 0.2, h: 5 };
  const centre = { a: f.from + f.w / 2, y: f.y + f.h / 2 };
  G.rotateItem(room, f);
  assert.deepEqual([f.w, f.h], [5, 1.5], 'w and h swap');
  assert.equal(f.d, 0.2, 'the projection out from the wall is untouched');
  assert.deepEqual([f.from + f.w / 2, f.y + f.h / 2], [centre.a, centre.y], 'about the panel centre');
  assert.equal(f.wall, 'back', 'and it stays on its wall');

  // a turn that would hang the piece off the end is pulled back on
  const wide = { id: 'w', kind: 'wall', wall: 'back', from: 0.2, y: 6, w: 1, d: 0.2, h: 6 };
  G.rotateItem(room, wide);
  assert.ok(wide.from >= 0 && wide.from + wide.w <= room.width + G.EPS, 'clamped onto the wall');
  assert.ok(wide.y >= 0 && wide.y + wide.h <= room.height + G.EPS, 'and under the ceiling');
});

test('G-05 nextWall sends a piece round, keeping how far along it sits', () => {
  const room = { width: 12, length: 6, height: 8 };
  const f = { id: 'm', kind: 'wall', wall: 'back', from: 0, y: 2, w: 2, d: 0.2, h: 2 };
  assert.deepEqual(G.nextWall(room, f), { wall: 'front', from: 0 }, 'flush at the start stays flush');
  f.from = 10;                                   // flush at the far end of a 12 ft wall
  const onLeft = G.nextWall(room, { ...f, wall: 'front' });
  assert.equal(onLeft.wall, 'left');
  assert.ok(Math.abs(onLeft.from - (room.length - f.w)) < G.EPS, 'still flush at the far end of a shorter wall');
  assert.equal(G.nextWall(room, { ...f, wall: 'right' }).wall, 'back', 'and round again');
});

// ---------- saving and loading a layout ----------
test('G-06 a layout round-trips through layoutOf/applyLayout', () => {
  const a = clone(config);
  const bed = a.furniture.find(f => f.id === 'bed');
  const board = a.furniture.find(f => f.id === 'board');
  G.placeFloorItem(a.room, bed, 1, 1);
  G.rotateItem(a.room, bed);
  G.rotateItem(a.room, board);
  a.furniture.find(f => f.id === 'vanity').enabled = true;
  const saved = JSON.parse(JSON.stringify(G.layoutOf(a)));

  const b = clone(config);
  const applied = G.applyLayout(b, saved);
  assert.equal(applied.length, config.furniture.length, 'every piece was placed');
  for (const f of a.furniture) {
    const g = b.furniture.find(x => x.id === f.id);
    for (const k of ['x', 'z', 'w', 'd', 'h', 'from', 'y', 'wall', 'facing', 'enabled']) {
      assert.ok(sameLen(g[k], f[k]), `${f.id}.${k} came back (got ${g[k]}, want ${f[k]})`);
    }
  }
  assert.deepEqual(G.validate(b), G.validate(a), 'and the rules see the same room');
});

test('G-06 applyLayout keeps names and shapes from the config, not the file', () => {
  const cfg = clone(config);
  const saved = G.layoutOf(cfg);
  assert.ok(!('name' in saved.furniture[0]) && !('shape' in saved.furniture[0]) && !('color' in saved.furniture[0]),
    'a layout stores positions only');
  G.applyLayout(cfg, saved);
  assert.equal(cfg.furniture.find(f => f.id === 'bed').name, 'Bed (queen)');
});

test('G-06 applyLayout ignores what it cannot trust and reports what it will not read', () => {
  const cfg = clone(config);
  const bed = cfg.furniture.find(f => f.id === 'bed');
  const was = { x: bed.x, z: bed.z, w: bed.w };
  const applied = G.applyLayout(cfg, {
    version: G.LAYOUT_VERSION,
    room: { width: 'wide', length: -3 },                 // junk dimensions are skipped
    furniture: [
      { id: 'bed', x: 'over there', z: null, w: NaN },   // junk positions are skipped
      { id: 'no-such-piece', x: 1, z: 1 },               // gone from the catalogue
      { id: 'rug', x: 99, z: 99 },                       // out of the room: clamped
    ],
  });
  assert.deepEqual(applied, ['bed', 'rug'], 'only pieces that still exist are touched');
  for (const k of ['x', 'z', 'w']) assert.ok(sameLen(bed[k], was[k]), `the bed's ${k} did not move`);
  assert.deepEqual([cfg.room.width, cfg.room.length], [config.room.width, config.room.length], 'the room did not change');
  const rug = cfg.furniture.find(f => f.id === 'rug');
  assert.ok(G.rectInside(G.itemRect(rug), G.roomRect(cfg.room)), 'the rug was pulled back inside the room');

  for (const junk of [null, 'a string', {}, { version: 1 }, { version: 2, furniture: [] }]) {
    assert.throws(() => G.applyLayout(clone(config), junk), /not a saved layout|not supported/);
  }
});

// ---------- geometry unit tests ----------
test('G-01 wallPanels tiles the wall exactly around its openings', () => {
  const L = 10, H = 8;
  const openings = [
    { from: 1, width: 2.5, bottom: 0, top: 6.67 },   // door
    { from: 6, width: 3, bottom: 3, top: 7 },        // window
  ];
  const panels = G.wallPanels(L, H, openings);
  const area = panels.reduce((s, p) => s + p.w * p.h, 0);
  const openArea = openings.reduce((s, o) => s + o.width * (o.top - o.bottom), 0);
  assert.ok(Math.abs(area + openArea - L * H) < 1e-9, 'panel area + opening area = wall area');
  for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
    const a = panels[i], b = panels[j];
    const overlap = a.u < b.u + b.w - G.EPS && b.u < a.u + a.w - G.EPS && a.v < b.v + b.h - G.EPS && b.v < a.v + a.h - G.EPS;
    assert.equal(overlap, false, `panels ${i} and ${j} overlap`);
  }
  for (const p of panels) assert.ok(p.u >= 0 && p.u + p.w <= L + G.EPS && p.v >= 0 && p.v + p.h <= H + G.EPS);
  assert.equal(G.wallPanels(L, H, []).length, 1, 'a blank wall is a single panel');
});

test('G-02 wall frames map "from" onto the plan consistently', () => {
  const room = { width: 11, length: 10, height: 8 };
  assert.deepEqual(G.toWorld(G.wallFrame(room, 'back'), 2, 0), [2, 0]);
  assert.deepEqual(G.toWorld(G.wallFrame(room, 'front'), 2, 0), [2, 10]);
  assert.deepEqual(G.toWorld(G.wallFrame(room, 'left'), 3, 0), [0, 3]);
  assert.deepEqual(G.toWorld(G.wallFrame(room, 'right'), 3, 0), [11, 3]);
  // inward normals point into the room
  assert.deepEqual(G.toWorld(G.wallFrame(room, 'front'), 0, 1), [0, 9]);
  assert.deepEqual(G.toWorld(G.wallFrame(room, 'right'), 0, 1), [10, 0]);
  assert.throws(() => G.wallFrame(room, 'ceiling'));
});

test('G-03 feet-inches formatting', () => {
  assert.equal(G.fmtFt(ft(11, 1)), '11\'-1"');
  assert.equal(G.fmtFt(ft(10, 5)), '10\'-5"');
  assert.equal(G.fmtFt(8), '8\'-0"');
  assert.equal(G.fmtFt(0.5), '0\'-6"');
  assert.equal(G.fmtFt(-0.75), '-0\'-9"');
});

test('G-04 rectangle helpers', () => {
  const a = { x: 0, z: 0, w: 2, d: 2 }, b = { x: 1, z: 1, w: 2, d: 2 }, c = { x: 2, z: 0, w: 1, d: 1 };
  assert.equal(G.rectsOverlap(a, b), true);
  assert.equal(G.rectsOverlap(a, c), false, 'touching edges do not overlap');
  assert.deepEqual(G.rectIntersection(a, b), { x: 1, z: 1, w: 1, d: 1 });
  assert.equal(G.rectIntersection(a, c), null);
  assert.equal(G.rectInside({ x: 0.5, z: 0.5, w: 1, d: 1 }, a), true);
  assert.equal(G.rectInside(b, a), false);
  assert.equal(G.circleRectOverlap(0, 0, 1, { x: 0.9, z: 0.9, w: 1, d: 1 }), false, 'corner outside the circle');
  assert.equal(G.circleRectOverlap(0, 0, 1, { x: 0.5, z: 0.5, w: 1, d: 1 }), true);
});
