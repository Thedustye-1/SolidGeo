import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';

fs.mkdirSync('shots', { recursive: true });
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox', '--disable-crash-reporter', '--hide-scrollbars', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1620, height: 1020 }, deviceScaleFactor: 1, acceptDownloads: true });
const errors = [];
page.on('pageerror', (err) => {
  errors.push(String(err));
  console.log(`[pageerror] ${err}`);
});
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log(`[console:error] ${msg.text()}`);
});
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__solidgeoEngine));
await page.waitForTimeout(500);

// 1) Create cube, drag a vertex, undo.
const dragResult = await page.evaluate(async () => {
  const store = window.__solidgeoStore.getState();
  const engine = window.__solidgeoEngine;
  store.newProject();
  store.createSolid('cube', { size: 2.2, cx: 0, cy: 0, cz: 0 });
  const s = window.__solidgeoStore.getState();
  const cube = s.entities.find((e) => e.type === 'solid');
  const before = structuredClone(cube.vertices[0]);
  const screen = engine.screenPoint('perspective', before);
  return { id: cube.id, before, screen };
});
assert(dragResult.screen, 'vertex should project');
await page.mouse.move(dragResult.screen.x, dragResult.screen.y);
await page.mouse.down();
await page.mouse.move(dragResult.screen.x + 46, dragResult.screen.y - 24, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(350);
const afterDrag = await page.evaluate((id) => {
  const store = window.__solidgeoStore.getState();
  const cube = store.entities.find((e) => e.id === id);
  return { vertex: cube.vertices[0], selection: store.selection, count: store.past.length };
}, dragResult.id);
assert.notDeepEqual(afterDrag.vertex, dragResult.before, 'drag should move vertex');
await page.screenshot({ path: 'shots/function-drag.png' });
await page.evaluate(() => window.__solidgeoStore.getState().undo());
await page.waitForTimeout(250);
const afterUndo = await page.evaluate((id) => {
  const cube = window.__solidgeoStore.getState().entities.find((e) => e.id === id);
  return cube.vertices[0];
}, dragResult.id);
assert.deepEqual(afterUndo, dragResult.before, 'undo should restore vertex');

// 2) Create points, segment, midpoint, plane through three solid vertices.
const construction = await page.evaluate(() => {
  const store = window.__solidgeoStore.getState();
  store.newProject();
  store.createSolid('cube', { size: 2, cx: 0, cy: 0, cz: 0 });
  store.createPointAt([3, 0, 0]);
  store.createPointAt([4, 1, 0]);
  const state = window.__solidgeoStore.getState();
  const p1 = state.entities.find((e) => e.type === 'point' && e.pos[0] === 3);
  const p2 = state.entities.find((e) => e.type === 'point' && e.pos[0] === 4);
  state.setActiveTool('segment');
  state.handleCanvasPick({ id: p1.id }, p1.pos, false);
  state.handleCanvasPick({ id: p2.id }, p2.pos, false);
  const s2 = window.__solidgeoStore.getState();
  const segment = s2.entities.find((e) => e.type === 'segment');
  s2.setActiveTool('select');
  s2.setSelection([{ id: p1.id }, { id: p2.id }]);
  s2.constructMidpoint();
  const s3 = window.__solidgeoStore.getState();
  const cube = s3.entities.find((e) => e.type === 'solid');
  s3.setSelection([
    { id: cube.id, part: { kind: 'vertex', index: 0 } },
    { id: cube.id, part: { kind: 'vertex', index: 1 } },
    { id: cube.id, part: { kind: 'vertex', index: 2 } },
  ]);
  s3.constructPlaneThree();
  const s4 = window.__solidgeoStore.getState();
  return {
    segment: Boolean(segment),
    points: s4.entities.filter((e) => e.type === 'point').length,
    planes: s4.entities.filter((e) => e.type === 'plane').length,
    entities: s4.entities.map((e) => e.type),
  };
});
assert.equal(construction.segment, true);
assert.equal(construction.planes, 1);

// 3) Demo section + selection + measurement + vector operations.
const analysis = await page.evaluate(() => {
  const store = window.__solidgeoStore.getState();
  store.newProject();
  store.createSolid('cube', { size: 2, cx: 0, cy: 0, cz: 0 });
  const cube = window.__solidgeoStore.getState().entities.find((e) => e.type === 'solid');
  store.setSelection([{ id: cube.id, part: { kind: 'face', index: 0 } }, { id: cube.id, part: { kind: 'face', index: 1 } }]);
  store.measureSelection();
  const faceRel = window.__solidgeoStore.getState().measureReport;
  store.setSelection([{ id: cube.id }]);
  store.createVector([0, 0, 0], [1, 2, 2]);
  store.createVector([0, 0, 0], [2, -1, 1]);
  const vecs = window.__solidgeoStore.getState().entities.filter((e) => e.type === 'vector');
  store.setSelection(vecs.map((v) => ({ id: v.id })));
  store.vectorOp('add');
  const addReport = window.__solidgeoStore.getState().vectorReport;
  store.vectorOp('dot');
  const dotReport = window.__solidgeoStore.getState().vectorReport;
  store.vectorOp('cross');
  const crossReport = window.__solidgeoStore.getState().vectorReport;
  return {
    faceRelations: faceRel?.items?.slice(0, 3).map((i) => i.label),
    add: addReport?.result,
    dot: dotReport?.result,
    cross: crossReport?.result,
    vectorCount: vecs.length,
  };
});
console.log('ANALYSIS', JSON.stringify(analysis));
assert.match(analysis.add ?? '', /模长/);
assert.match(analysis.dot ?? '', /夹角/);
assert.match(analysis.cross ?? '', /叉积|模长/);

// 4) Open a solid dialog through the real UI and create a prism.
await page.evaluate(() => window.__solidgeoStore.getState().newProject());
await page.locator('.solid-tile', { hasText: '棱柱' }).click();
await page.waitForSelector('.modal');
await page.screenshot({ path: 'shots/dialog-prism.png' });
await page.locator('.modal-foot .primary-button').click();
await page.waitForTimeout(400);
const prismCount = await page.evaluate(() => window.__solidgeoStore.getState().entities.filter((e) => e.type === 'solid' && e.solidType === 'prism').length);
assert.equal(prismCount, 1);
await page.evaluate(() => {
  const store = window.__solidgeoStore.getState();
  const cube = store.entities.find((e) => e.type === 'solid');
  store.setSelection([{ id: cube.id }]);
  store.rightTab = 'props';
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/function-prism.png' });

// 5) Face pick via real click in top view, then section from a plane.
const facePick = await page.evaluate(() => {
  const store = window.__solidgeoStore.getState();
  const engine = window.__solidgeoEngine;
  store.newProject();
  store.createSolid('cube', { size: 2.4, cx: 0, cy: 0, cz: 0 });
  const cube = window.__solidgeoStore.getState().entities.find((e) => e.type === 'solid');
  store.setSelectionMode('face');
  const topFace = cube.faces[1].map((i) => cube.vertices[i]);
  const center = topFace.reduce((a, p) => [a[0] + p[0] / topFace.length, a[1] + p[1] / topFace.length, a[2] + p[2] / topFace.length], [0, 0, 0]);
  return { id: cube.id, center, screen: engine.screenPoint('top', center) };
});
await page.mouse.click(facePick.screen.x, facePick.screen.y);
await page.waitForTimeout(300);
const selectedFace = await page.evaluate(() => window.__solidgeoStore.getState().selection);
console.log('FACE_SELECTION', JSON.stringify(selectedFace));
assert.ok(selectedFace[0]?.part?.kind === 'face', 'clicking a face in face mode should select a face');

// 6) Section via plane constructed from three vertices.
const sectionResult = await page.evaluate(() => {
  const store = window.__solidgeoStore.getState();
  const cube = store.entities.find((e) => e.type === 'solid');
  store.setSelection([
    { id: cube.id, part: { kind: 'vertex', index: 0 } },
    { id: cube.id, part: { kind: 'vertex', index: 1 } },
    { id: cube.id, part: { kind: 'vertex', index: 2 } },
  ]);
  store.constructPlaneThree();
  const plane = window.__solidgeoStore.getState().entities.find((e) => e.type === 'plane');
  store.setSelection([{ id: cube.id }, { id: plane.id }]);
  store.openSection();
  const s = window.__solidgeoStore.getState();
  const section = s.entities.find((e) => e.type === 'section');
  const object = window.__solidgeoEngine.getObject(section.id);
  return { sections: s.entities.filter((e) => e.type === 'section').length, area: object?.getArea?.() ?? null, id: section.id };
});
console.log('SECTION', JSON.stringify(sectionResult));
assert.equal(sectionResult.sections, 1);
assert.ok(sectionResult.area > 0);
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/function-section.png' });

// 7) Save project through File menu and read downloaded JSON.
await page.evaluate(() => {
  const s = window.__solidgeoStore.getState();
  s.setSelection([{ id: s.entities.find((e) => e.type === 'cube' || e.type === 'solid').id }]);
});
await page.getByRole('button', { name: '文件', exact: true }).click();
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.locator('.menu-item', { hasText: '保存工程' }).click(),
]);
await download.saveAs('shots/roundtrip.geojson');
const json = JSON.parse(fs.readFileSync('shots/roundtrip.geojson', 'utf8'));
assert.equal(json.format, 'solidgeo');
assert.ok(Array.isArray(json.entities) && json.entities.length >= 3);
console.log('SAVED', json.entities.length, json.camera.projection);

// 8) Keyboard shortcuts.
await page.mouse.click(700, 500);
await page.keyboard.press('r');
await page.waitForTimeout(100);
assert.equal(await page.evaluate(() => window.__solidgeoStore.getState().settings.autoRotate), true);
await page.keyboard.press('r');
await page.keyboard.press('w');
await page.waitForTimeout(100);
assert.equal(await page.evaluate(() => window.__solidgeoStore.getState().settings.wireframe), true);
await page.keyboard.press('w');

// 9) Light theme screenshot.
await page.evaluate(() => {
  const store = window.__solidgeoStore.getState();
  store.setSettings({ theme: 'light' });
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/function-light.png' });
await page.evaluate(() => window.__solidgeoStore.getState().setSettings({ theme: 'dark' }));

// 10) Open saved project through the File menu.
await page.evaluate(() => {
  window.__solidgeoStore.getState().newProject();
  window.__solidgeoStore.getState().setDirty(false);
});
await page.getByRole('button', { name: '文件', exact: true }).click();
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser', { timeout: 15000 }),
  page.locator('.menu-item', { hasText: '打开工程' }).click(),
]);
await chooser.setFiles('shots/roundtrip.geojson');
await page.waitForTimeout(800);
const opened = await page.evaluate(() => {
  const s = window.__solidgeoStore.getState();
  return { entities: s.entities.length, doc: s.docName, dirty: s.dirty };
});
console.log('OPENED', JSON.stringify(opened));
assert.ok(opened.entities >= 3, 'opened project should restore entities');
assert.equal(opened.dirty, false);

console.log('ERRORS', JSON.stringify(errors));
await browser.close();
