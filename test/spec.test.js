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
  bad.furniture.push({ id: 'blocker', x: ft(1), z: ft(0, 6), w: 1, d: 1, h: 2 });
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
test('R-05 a bifold closet on the back wall with a 2 ft deep alcove that contains its opening', () => {
  const closets = config.openings.filter(o => o.type === 'closet');
  assert.equal(closets.length, 1);
  const [c] = closets;
  assert.equal(c.wall, 'back');
  assert.equal(c.door, 'bifold');
  near(c.depth, ft(2), 'closet depth');
  const afrom = c.alcoveFrom ?? c.from, aw = c.alcoveWidth ?? c.width;
  assert.ok(c.from >= afrom - G.EPS && c.from + c.width <= afrom + aw + G.EPS, 'opening inside alcove');
  assert.ok(c.from > byId('door').from + byId('door').width, 'closet is to the right of the door');
  // the alcove sits entirely behind the back wall (z < 0)
  const alcove = G.closetAlcove(config.room, c);
  assert.ok(alcove.z + alcove.d <= G.EPS, 'alcove is behind the wall line');
  assert.deepEqual(issuesMatching(config, /R-05/), []);
});

test('R-05 nothing stands within 2 ft of the closet opening', () => {
  const bad = clone(config);
  bad.furniture.push({ id: 'chest', x: ft(8), z: ft(0, 6), w: 2, d: 1, h: 2 });
  assert.match(issuesMatching(bad, /R-05/).join('\n'), /chest is within 2'-0" of the closet opening/);
});

// ---------- R-06 windows ----------
test('R-06 two windows on the front (exterior) wall with a 3 ft sill', () => {
  const wins = config.openings.filter(o => o.type === 'window');
  assert.equal(wins.length, 2);
  for (const w of wins) {
    assert.equal(w.wall, 'front');
    near(w.sill, ft(3), `${w.id} sill`);
    assert.ok(w.width >= ft(2) && w.height >= ft(3), `${w.id} is a usable size`);
  }
  const [a, b] = wins.slice().sort((p, q) => p.from - q.from);
  assert.ok(b.from >= a.from + a.width, 'windows are side by side');
  assert.ok(b.from - (a.from + a.width) <= ft(1), 'with no more than a 1 ft mullion between them');
});

test('R-06 nothing taller than the sill stands in front of a window', () => {
  assert.deepEqual(issuesMatching(config, /R-06/), []);
  const bad = clone(config);
  const w = bad.openings.find(o => o.id === 'window-1');
  bad.furniture.push({ id: 'bookcase', x: w.from, z: bad.room.length - 1, w: 2, d: 1, h: ft(6) });
  assert.match(issuesMatching(bad, /R-06/).join('\n'), /bookcase .* rises above the sill of window-1/);
  const ok = clone(config);
  ok.furniture.push({ id: 'bench', x: w.from, z: ok.room.length - 1, w: 2, d: 1, h: ft(1, 6) });
  assert.deepEqual(issuesMatching(ok, /R-06/), [], 'a low bench under the window is fine');
});

// ---------- R-07 / R-08 solids ----------
test('R-07 the linen closet nook is on the left wall, below the door, and inside the room', () => {
  const nook = config.fixtures.find(f => f.id === 'linen');
  assert.ok(nook, 'nook exists');
  assert.equal(nook.x, 0, 'against the left wall');
  const door = byId('door');
  assert.ok(nook.z >= door.width, 'starts beyond the door swing');
  assert.ok(G.rectInside(G.itemRect(nook), G.roomRect(config.room)));
  near(nook.h, config.room.height, 'runs floor to ceiling');
  assert.deepEqual(issuesMatching(config, /R-07/), []);
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

// ---------- R-09 .. R-11 exterior ----------
test('R-09 the exterior pad, AC unit and drain are outside the front wall, AC fully on the pad', () => {
  const ex = config.exterior;
  assert.equal(ex.side, 'front');
  const pad = G.exteriorRect(config.room, ex, ex.pad);
  const ac = G.exteriorRect(config.room, ex, ex.ac);
  const drain = G.drainRect(config.room, ex, ex.drain);
  const outerFace = config.room.length + ex.wallThickness;
  for (const [n, r] of [['pad', pad], ['ac', ac], ['drain', drain]])
    assert.ok(r.z >= outerFace - G.EPS, `${n} is beyond the exterior wall face`);
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
