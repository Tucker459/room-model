/*
 * Render tests: open index.html in headless Chromium and check the scene and
 * the viewport behaviour called out in SPEC.md (RN-xx). Three.js is served
 * from node_modules so the tests run offline. Requires `npm install` plus
 * Chromium for Playwright (`npx playwright install chromium`).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');

let chromium;
try { ({ chromium } = require('playwright')); } catch { chromium = null; }

const ROOT = path.resolve(__dirname, '..');
const THREE_DIR = path.join(ROOT, 'node_modules', 'three');
const OUT = path.join(__dirname, 'output');

/*
 * The page is served over http rather than opened as a file:// URL, because
 * browsers refuse localStorage on file:// and the layout save/load tests need
 * it. It is also how the page is really used (`npm run serve`).
 */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
function serveRoot() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}
let PAGE = null;

// `target` is the browser (fresh, isolated storage) or a context (shared storage).
async function openPage(target, { width = 1400, height = 900, deviceScaleFactor = 1 } = {}) {
  const page = target.newContext
    ? await target.newPage({ viewport: { width, height }, deviceScaleFactor })
    : await target.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)$/, route => {
    const rel = route.request().url().match(/three@0\.160\.0\/(.*)$/)[1];
    const file = path.join(THREE_DIR, rel);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'missing ' + rel });
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
  });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__room && window.__room.roomGroup, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  return { page, errors };
}

// counts of objects by userData.kind inside the room group
const countKinds = (page) => page.evaluate(() => {
  const counts = {};
  window.__room.roomGroup.traverse(o => { const k = o.userData?.kind; if (k) counts[k] = (counts[k] || 0) + 1; });
  return counts;
});

test('render suite', { skip: chromium ? false : 'playwright is not installed' }, async (t) => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serveRoot();
  PAGE = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  t.after(async () => { await browser.close(); server.close(); });

  await t.test('RN-01 page loads with no script errors and builds every modelled element', async () => {
    const { page, errors } = await openPage(browser);
    assert.deepEqual(errors, []);
    const kinds = await countKinds(page);
    assert.equal(kinds.door, 1);
    assert.equal(kinds.window, 2);
    assert.equal(kinds.closet, 1);
    assert.equal(kinds.fixture, 1);
    const want = await page.evaluate(() => {
      const { config } = window.__room, G = window.RoomGeometry;
      const on = config.furniture.filter(G.isEnabled);
      return {
        furniture: on.filter(f => G.itemKind(f) !== 'rug').length,
        rug: on.filter(f => G.itemKind(f) === 'rug').length,
      };
    });
    assert.equal(kinds.furniture, want.furniture, 'every switched-on piece is built');
    assert.equal(kinds.rug || 0, want.rug);
    assert.equal(kinds.pad, 1);
    assert.equal(kinds.ac, 1);
    assert.equal(kinds.drain, 1);
    assert.equal(kinds.wall, 4);
    assert.ok(kinds['wall-panel'] >= 4, 'walls are split into panels');
    const labels = await page.evaluate(() => { let n = 0; window.__room.scene.traverse(o => { if (o.userData?.kind === 'label') n++; }); return n; });
    assert.ok(labels >= 10, `labels for openings, solids and exterior (got ${labels})`);
    // wall-mounted pieces hang on their wall, so they cull with it
    const mounted = await page.evaluate(() => {
      const { scene, THREE, config } = window.__room, G = window.RoomGeometry;
      return config.furniture.filter(f => G.isEnabled(f) && G.itemKind(f) === 'wall').map(f => {
        const g = scene.getObjectByName(f.id);
        const p = g.getWorldPosition(new THREE.Vector3());
        // the group sits on the wall line, centred on the piece's span
        const [cx, cz] = G.toWorld(G.wallFrame(config.room, f.wall), f.from + f.w / 2, 0);
        return { id: f.id, parent: g.parent.name, x: p.x, z: p.z, cx, cz, wall: f.wall };
      });
    });
    assert.ok(mounted.length >= 4, 'the wall-mounted options are built');
    for (const m of mounted) {
      assert.equal(m.parent, 'wall-' + m.wall, `${m.id} is parented to its wall group`);
      assert.ok(Math.abs(m.x - m.cx) < 0.01 && Math.abs(m.z - m.cz) < 0.01,
        `${m.id} sits on the ${m.wall} wall (got ${m.x.toFixed(2)}, ${m.z.toFixed(2)})`);
    }
    const winLabels = await page.evaluate(() => {
      const { config } = window.__room, G = window.RoomGeometry; const out = [];
      for (const w of config.openings.filter(o => o.type === 'window')) {
        const g = window.__room.scene.getObjectByName(w.id);
        const sp = g.children.find(c => c.userData.kind === 'label');
        const p = sp.getWorldPosition(new window.__room.THREE.Vector3());
        const [ex, ez] = G.toWorld(G.wallFrame(config.room, w.wall), w.from + w.width / 2, 0.4);
        out.push({ id: w.id, x: p.x, y: p.y, z: p.z, expectX: ex, expectZ: ez });
      }
      return out;
    });
    for (const l of winLabels) {
      assert.ok(Math.abs(l.x - l.expectX) < 0.01 && Math.abs(l.z - l.expectZ) < 0.01,
        `${l.id} label is above its window (got ${l.x.toFixed(2)}, ${l.z.toFixed(2)}, want ${l.expectX.toFixed(2)}, ${l.expectZ.toFixed(2)})`);
    }
    const text = await page.locator('#room-dims').textContent();
    assert.match(text, /11'-1" × 10'-5"/);
    assert.equal(await page.locator('#issues').textContent(), 'All spec rules pass.');
    await page.screenshot({ path: path.join(OUT, 'default.png') });
    await page.close();
  });

  await t.test('RN-02 the canvas fills its container on a 2x (HiDPI) display', async () => {
    const { page } = await openPage(browser, { deviceScaleFactor: 2 });
    const m = await page.evaluate(() => {
      const v = document.getElementById('view').getBoundingClientRect();
      const c = document.querySelector('#view canvas');
      const r = c.getBoundingClientRect();
      return { view: [v.width, v.height], canvas: [r.width, r.height], buffer: [c.width, c.height], dpr: window.devicePixelRatio };
    });
    assert.equal(m.dpr, 2);
    assert.ok(Math.abs(m.canvas[0] - m.view[0]) < 1 && Math.abs(m.canvas[1] - m.view[1]) < 1,
      `canvas ${m.canvas} must match container ${m.view}`);
    assert.ok(m.buffer[0] >= m.view[0] * 2 - 2, 'drawing buffer uses the device pixel ratio');
    await page.screenshot({ path: path.join(OUT, 'hidpi.png') });
    await page.close();
  });

  await t.test('RN-03 the room is centred in the default view and fully visible', async () => {
    const { page } = await openPage(browser);
    const r = await page.evaluate(() => {
      const { THREE, camera, config } = window.__room;
      const { width: W, length: L, height: H } = config.room;
      const proj = (x, y, z) => new THREE.Vector3(x, y, z).project(camera);
      const c = proj(W / 2, H * 0.35, L / 2);
      const corners = [];
      for (const x of [0, W]) for (const y of [0, H]) for (const z of [0, L]) corners.push(proj(x, y, z));
      return { center: [c.x, c.y], maxAbs: Math.max(...corners.flatMap(p => [Math.abs(p.x), Math.abs(p.y)])) };
    });
    assert.ok(Math.abs(r.center[0]) < 0.1 && Math.abs(r.center[1]) < 0.1, `room centre projects to ${r.center}, expected near (0,0)`);
    assert.ok(r.maxAbs < 1, 'every room corner is inside the viewport');
    await page.close();
  });

  await t.test('RN-04 walls between the camera and the room are hidden, the far walls shown', async () => {
    const { page } = await openPage(browser);
    const vis = await page.evaluate(() => {
      const { scene, camera } = window.__room;
      const out = {};
      for (const w of ['back', 'front', 'left', 'right']) out[w] = scene.getObjectByName('wall-' + w).visible;
      return { ...out, cam: [camera.position.x, camera.position.z] };
    });
    // default camera sits at +x, +z: the front and right walls face it and must be culled
    assert.equal(vis.back, true); assert.equal(vis.left, true);
    assert.equal(vis.front, false); assert.equal(vis.right, false);
    await page.click('#btn-top');
    await page.waitForTimeout(200);
    const top = await page.evaluate(() => ['back', 'front', 'left', 'right'].map(w => window.__room.scene.getObjectByName('wall-' + w).visible));
    assert.deepEqual(top, [true, true, true, true], 'from above every wall is visible');
    const orient = await page.evaluate(() => {
      const { THREE, camera, config } = window.__room;
      const p = (x, z) => new THREE.Vector3(x, 0, z).project(camera);
      const back = p(config.room.width / 2, 0), front = p(config.room.width / 2, config.room.length);
      const left = p(0, config.room.length / 2), right = p(config.room.width, config.room.length / 2);
      return { backAbove: back.y > front.y, rightIsRight: right.x > left.x, level: Math.abs(back.x - front.x) < 0.01 && Math.abs(left.y - right.y) < 0.01 };
    });
    assert.ok(orient.backAbove && orient.rightIsRight && orient.level, `top view is oriented like the plan: ${JSON.stringify(orient)}`);
    await page.screenshot({ path: path.join(OUT, 'top.png') });
    await page.close();
  });

  await t.test('RN-05 editing a room dimension rebuilds the model and re-runs the spec check', async () => {
    const { page, errors } = await openPage(browser);
    await page.fill('#in-width', '9');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({
      floor: window.__room.roomGroup.getObjectByName('floor').geometry.parameters.width,
      dims: document.getElementById('room-dims').textContent,
      issues: document.getElementById('issues').textContent,
    }));
    assert.equal(after.floor, 9);
    assert.match(after.dims, /9'-0"/);
    assert.match(after.issues, /runs past the end of the back wall|extends outside the room/, 'narrowing the room now violates the spec');
    assert.deepEqual(errors, []);
    await page.close();
  });

  await t.test('RN-06 labels can be toggled', async () => {
    const { page } = await openPage(browser);
    const visibleLabels = () => page.evaluate(() => {
      const v = []; window.__room.scene.traverse(o => { if (o.userData?.kind === 'label') v.push(o.visible); }); return v;
    });
    assert.ok((await visibleLabels()).every(Boolean), 'labels start visible');
    await page.uncheck('#chk-labels');
    assert.ok((await visibleLabels()).every(v => v === false), 'all labels hidden');
    await page.check('#chk-labels');
    assert.ok((await visibleLabels()).every(Boolean), 'all labels shown again');
    await page.close();
  });

  await t.test('RN-08 furniture options can be switched on and off from the panel', async () => {
    const { page, errors } = await openPage(browser);
    const built = (id) => page.evaluate(i => !!window.__room.roomGroup.getObjectByName(i), id);

    assert.equal(await built('sofa'), true, 'the sofa starts placed');
    assert.equal(await built('vanity'), false, 'the vanity starts off');

    await page.uncheck('#fx-sofa');
    await page.waitForTimeout(150);
    assert.equal(await built('sofa'), false, 'unticking removes it from the scene');

    await page.check('#fx-vanity');
    await page.waitForTimeout(150);
    assert.equal(await built('vanity'), true, 'ticking places the alternative');
    assert.equal(await page.locator('#issues').textContent(), 'All spec rules pass.');

    // both halves of a slot at once is a clash the panel must report
    await page.check('#fx-sofa');
    await page.waitForTimeout(150);
    assert.match(await page.locator('#issues').textContent(), /R-08.*(sofa|vanity)/);

    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(OUT, 'options.png') });
    await page.close();
  });

  await t.test('RN-09 furniture can be picked up and dragged around the floor', async () => {
    const { page, errors } = await openPage(browser);
    await page.click('#btn-top');                 // straight down: screen x/y map to floor x/z
    await page.waitForTimeout(250);

    // screen position of a point on the floor plan
    const screenOf = (x, y, z) => page.evaluate(([x, y, z]) => {
      const { THREE, camera, renderer } = window.__room;
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - (v.y + 1) / 2) * r.height };
    }, [x, y, z]);
    const item = (id) => page.evaluate(i => {
      const f = window.__room.config.furniture.find(f => f.id === i);
      return { x: f.x, z: f.z, w: f.w, d: f.d, facing: f.facing };
    }, id);

    const before = await item('sofa');
    const grab = await screenOf(before.x + before.w / 2, before.h || 1.5, before.z + before.d / 2);
    const camBefore = await page.evaluate(() => [...window.__room.camera.position.toArray()]);

    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    assert.equal(await page.evaluate(() => window.__room.selectedId), 'sofa', 'pressing on a piece selects it');

    // drag it to the middle of the room
    const target = await page.evaluate(() => {
      const { width: W, length: L } = window.__room.config.room;
      return { x: W / 2, z: L / 2 };
    });
    const drop = await screenOf(target.x, 1.5, target.z);
    await page.mouse.move((grab.x + drop.x) / 2, (grab.y + drop.y) / 2);
    await page.mouse.move(drop.x, drop.y);
    await page.mouse.up();
    await page.waitForTimeout(200);

    const after = await item('sofa');
    assert.notDeepEqual([after.x, after.z], [before.x, before.z], 'the sofa moved');
    assert.ok(Math.abs(after.x + after.w / 2 - target.x) < 0.6 && Math.abs(after.z + after.d / 2 - target.z) < 0.6,
      `the sofa landed where it was dropped (got ${after.x}, ${after.z})`);
    for (const v of [after.x, after.z]) assert.ok(Math.abs(v * 12 - Math.round(v * 12)) < 1e-6, 'snapped to the inch');
    assert.deepEqual(await page.evaluate(() => [...window.__room.camera.position.toArray()]), camBefore,
      'dragging a piece must not orbit the camera');
    assert.match(await page.locator('#issues').textContent(), /R-08|R-13|All spec rules pass/);

    // the panel follows the selection, and a quarter turn swaps the footprint
    assert.match(await page.locator('#sel-name').textContent(), /Sofa/);
    await page.click('#btn-rotate');
    await page.waitForTimeout(150);
    const turned = await item('sofa');
    assert.deepEqual([turned.w, turned.d], [after.d, after.w], 'rotate swaps w and d');
    assert.deepEqual([turned.x + turned.w / 2, turned.z + turned.d / 2], [after.x + after.w / 2, after.z + after.d / 2],
      'about its own centre');

    // and "Reset layout" puts everything back
    await page.click('#btn-reset-layout');
    await page.waitForTimeout(200);
    assert.deepEqual(await item('sofa'), before, 'reset restores the starting layout');
    assert.equal(await page.locator('#issues').textContent(), 'All spec rules pass.');

    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(OUT, 'drag.png') });
    await page.close();
  });

  await t.test('RN-10 a wall piece slides along its wall and cannot leave it', async () => {
    const { page, errors } = await openPage(browser);
    const shelves = () => page.evaluate(() => {
      const f = window.__room.config.furniture.find(f => f.id === 'shelves');
      return { from: f.from, y: f.y, w: f.w, h: f.h };
    });
    const before = await shelves();
    // nudge it along the wall with the keyboard, then run it off the end
    await page.evaluate(() => window.__room.select('shelves'));
    assert.equal(await page.locator('#lab-a').textContent(), 'Along wall');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    const nudged = await shelves();
    assert.ok(Math.abs((before.from - nudged.from) - 3 / 12) < 1e-6, 'three presses move it three inches');
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    const pushed = await shelves();
    const wallLen = await page.evaluate(() => window.__room.config.room.width);
    assert.ok(Math.abs(pushed.from + pushed.w - wallLen) < 1e-6, 'it stops at the end of the wall');
    assert.deepEqual(errors, []);
    await page.close();
  });

  await t.test('RN-11 every piece turns, and wall pieces can change wall', async () => {
    const { page, errors } = await openPage(browser);
    const shape = (id) => page.evaluate(i => {
      const f = window.__room.config.furniture.find(f => f.id === i);
      return { wall: f.wall, from: f.from, y: f.y, x: f.x, z: f.z, w: f.w, d: f.d, h: f.h, facing: f.facing };
    }, id);

    // a wall piece turns in the plane of its wall: w and h swap
    await page.evaluate(() => window.__room.select('board'));
    assert.equal(await page.locator('#btn-rotate').isDisabled(), false, 'rotate works on wall pieces too');
    const before = await shape('board');
    await page.click('#btn-rotate');
    await page.waitForTimeout(150);
    const turned = await shape('board');
    assert.deepEqual([turned.w, turned.h], [before.h, before.w], 'w and h swap');
    assert.equal(turned.d, before.d, 'how far it stands off the wall does not change');
    assert.equal(turned.wall, before.wall, 'and it stays on its wall');

    // "Next wall" sends it round; the room stays valid to rebuild
    await page.click('#btn-next-wall');
    await page.waitForTimeout(150);
    const moved = await shape('board');
    assert.notEqual(moved.wall, before.wall, 'the board changed wall');
    const wallLen = await page.evaluate(w => (w === 'back' || w === 'front')
      ? window.__room.config.room.width : window.__room.config.room.length, moved.wall);
    assert.ok(moved.from >= 0 && moved.from + moved.w <= wallLen + 1e-6, 'and landed inside the new wall');
    assert.equal(await page.evaluate(() => !!window.__room.roomGroup.getObjectByName('board')), true);

    // floor pieces still turn, and "Next wall" is not offered for them
    await page.evaluate(() => window.__room.select('bed'));
    assert.equal(await page.locator('#btn-next-wall').isDisabled(), true);
    const bed = await shape('bed');
    await page.click('#btn-rotate');
    await page.waitForTimeout(150);
    const bedTurned = await shape('bed');
    assert.deepEqual([bedTurned.w, bedTurned.d], [bed.d, bed.w]);

    assert.deepEqual(errors, []);
    await page.close();
  });

  await t.test('RN-12 a layout can be saved, reloaded, exported and imported', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const { page, errors } = await openPage(ctx);
    const posOf = (id) => page.evaluate(i => {
      const f = window.__room.config.furniture.find(f => f.id === i);
      return { x: f.x, z: f.z, w: f.w, d: f.d };
    }, id);

    const original = await posOf('bed');
    // move the bed somewhere memorable, then save the layout under a name
    await page.evaluate(() => {
      const { config } = window.__room, G = window.RoomGeometry;
      G.placeFloorItem(config.room, config.furniture.find(f => f.id === 'bed'), 0.5, 0.5);
      window.__room.buildRoom();
    });
    const moved = await posOf('bed');
    assert.notDeepEqual(moved, original);

    await page.fill('#in-layout-name', 'bed by the door');
    await page.click('#btn-save-layout');
    await page.waitForTimeout(100);
    assert.match(await page.locator('#layout-msg').textContent(), /Saved "bed by the door"/);
    assert.deepEqual(await page.locator('#sel-layout option').allTextContents(), ['bed by the door']);

    // Reset goes back to the committed layout
    await page.click('#btn-reset-layout');
    await page.waitForTimeout(150);
    assert.deepEqual(await posOf('bed'), original, 'reset restores room.config.js');
    assert.equal(await page.locator('#issues').textContent(), 'All spec rules pass.');

    // Load brings the saved one back
    await page.selectOption('#sel-layout', 'bed by the door');
    await page.click('#btn-load-layout');
    await page.waitForTimeout(150);
    assert.deepEqual(await posOf('bed'), moved, 'the saved layout came back');

    // Export hands over the same JSON as a file
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
    const dumped = path.join(os.tmpdir(), `room-layout-${process.pid}.json`);
    await download.saveAs(dumped);
    const exported = JSON.parse(fs.readFileSync(dumped, 'utf8'));
    assert.equal(exported.version, 1);
    const exportedBed = exported.furniture.find(f => f.id === 'bed');
    assert.ok(Math.abs(exportedBed.x - moved.x) < 1e-6 && Math.abs(exportedBed.z - moved.z) < 1e-6);
    await page.close();

    // reopening in the same browser picks up where it left off
    const { page: page2, errors: errors2 } = await openPage(ctx);
    const posOf2 = (id) => page2.evaluate(i => {
      const f = window.__room.config.furniture.find(f => f.id === i);
      return { x: f.x, z: f.z, w: f.w, d: f.d };
    }, id);
    assert.deepEqual(await posOf2('bed'), moved, 'the working layout survived the reload');
    assert.match(await page2.locator('#layout-msg').textContent(), /Picked up where you left off/);
    assert.deepEqual(await page2.locator('#sel-layout option').allTextContents(), ['bed by the door'],
      'and so did the named layouts');

    // Import replaces it from a file
    const hand = { ...exported, furniture: exported.furniture.map(f => f.id === 'bed' ? { ...f, x: 2, z: 2 } : f) };
    fs.writeFileSync(dumped, JSON.stringify(hand));
    await page2.setInputFiles('#file-import', dumped);
    await page2.waitForTimeout(200);
    assert.match(await page2.locator('#layout-msg').textContent(), /Imported .* pieces/);
    const imported = await posOf2('bed');
    assert.deepEqual([imported.x, imported.z], [2, 2]);

    // rubbish in is reported, not thrown
    fs.writeFileSync(dumped, JSON.stringify({ version: 99, furniture: [] }));
    await page2.setInputFiles('#file-import', dumped);
    await page2.waitForTimeout(200);
    assert.match(await page2.locator('#layout-msg').textContent(), /version 99 is not supported/);
    assert.deepEqual(await posOf2('bed'), imported, 'and nothing moved');

    // Delete clears the named layout
    await page2.click('#btn-delete-layout');
    await page2.waitForTimeout(100);
    assert.match(await page2.locator('#layout-msg').textContent(), /Deleted "bed by the door"/);
    assert.equal(await page2.locator('#btn-load-layout').isDisabled(), true);

    fs.rmSync(dumped, { force: true });
    assert.deepEqual([...errors, ...errors2], []);
    await ctx.close();
  });

  await t.test('RN-07 inside view renders without errors', async () => {
    const { page, errors } = await openPage(browser);
    await page.click('#btn-inside');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'inside.png') });
    assert.deepEqual(errors, []);
    await page.close();
  });
});
