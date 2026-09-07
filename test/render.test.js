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

let chromium;
try { ({ chromium } = require('playwright')); } catch { chromium = null; }

const ROOT = path.resolve(__dirname, '..');
const THREE_DIR = path.join(ROOT, 'node_modules', 'three');
const OUT = path.join(__dirname, 'output');
const PAGE = 'file://' + path.join(ROOT, 'index.html');

async function openPage(browser, { width = 1400, height = 900, deviceScaleFactor = 1 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
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
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  t.after(() => browser.close());

  await t.test('RN-01 page loads with no script errors and builds every modelled element', async () => {
    const { page, errors } = await openPage(browser);
    assert.deepEqual(errors, []);
    const kinds = await countKinds(page);
    assert.equal(kinds.door, 1);
    assert.equal(kinds.window, 2);
    assert.equal(kinds.closet, 1);
    assert.equal(kinds.fixture, 1);
    assert.equal(kinds.furniture, 3);
    assert.equal(kinds.pad, 1);
    assert.equal(kinds.ac, 1);
    assert.equal(kinds.drain, 1);
    assert.equal(kinds.wall, 4);
    assert.ok(kinds['wall-panel'] >= 4, 'walls are split into panels');
    const labels = await page.evaluate(() => { let n = 0; window.__room.scene.traverse(o => { if (o.userData?.kind === 'label') n++; }); return n; });
    assert.ok(labels >= 10, `labels for openings, solids and exterior (got ${labels})`);
    const winLabels = await page.evaluate(() => {
      const { config } = window.__room; const out = [];
      for (const w of config.openings.filter(o => o.type === 'window')) {
        const g = window.__room.scene.getObjectByName(w.id);
        const sp = g.children.find(c => c.userData.kind === 'label');
        const p = sp.getWorldPosition(new window.__room.THREE.Vector3());
        out.push({ id: w.id, x: p.x, y: p.y, z: p.z, expectX: w.from + w.width / 2, expectZ: config.room.length - 0.4 });
      }
      return out;
    });
    for (const l of winLabels) {
      assert.ok(Math.abs(l.x - l.expectX) < 0.01 && Math.abs(l.z - l.expectZ) < 0.01, `${l.id} label is above its window (got ${l.x.toFixed(2)}, ${l.z.toFixed(2)})`);
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

  await t.test('RN-07 inside view renders without errors', async () => {
    const { page, errors } = await openPage(browser);
    await page.click('#btn-inside');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'inside.png') });
    assert.deepEqual(errors, []);
    await page.close();
  });
});
