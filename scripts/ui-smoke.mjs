import { chromium } from 'playwright-core';
import fs from 'node:fs';

fs.mkdirSync('shots', { recursive: true });
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox', '--disable-crash-reporter', '--hide-scrollbars', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1620, height: 1020 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') console.log(`[console:${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => {
  errors.push(String(err));
  console.log(`[pageerror] ${err}`);
});
await page.goto('http://127.0.0.1:4173/?demo=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
await page.evaluate(() => {
  const store = window.__solidgeoStore.getState();
  store.setSettings({ theme: 'dark' });
});
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/ui-dark.png' });

const info = await page.evaluate(async () => {
  const store = window.__solidgeoStore.getState();
  const engine = window.__solidgeoEngine;
  const grids = [];
  const edgeLines = [];
  engine.scene.traverse((o) => {
    if (o.type === 'GridHelper') grids.push(o.visible);
    if (o.type === 'LineSegments2') edgeLines.push(o.visible);
  });
  const png = await engine.exportActivePNG();
  const svg = engine.exportActiveSVG();
  const obj = engine.exportOBJ();
  const section = store.entities.find((e) => e.type === 'section');
  const secSvg = section ? engine.exportSection(section.id, 'svg') : null;
  const secObj = section ? engine.exportSection(section.id, 'obj') : null;
  return {
    entities: store.entities.map((e) => ({ type: e.type, name: e.name, visible: e.visible })),
    views: [...engine.getViews().keys()],
    canvases: [...document.querySelectorAll('canvas[data-viewport]')].map((c) => ({ id: c.dataset.viewport, w: c.width, h: c.height })),
    grids,
    edgeLines: edgeLines.length,
    visibleEdgeLines: edgeLines.filter(Boolean).length,
    pngLength: png.dataUrl.length,
    pngSize: [png.width, png.height],
    svgLength: svg.length,
    objLength: obj.length,
    secSvgLength: secSvg?.length ?? 0,
    secObjLength: secObj?.length ?? 0,
    camera: engine.getCameraState(),
    selection: store.selection,
  };
});
console.log('INFO', JSON.stringify(info, null, 2));

await page.evaluate(() => {
  const store = window.__solidgeoStore.getState();
  store.setSettings({ theme: 'light', showHidden: true });
});
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/ui-light.png' });

await page.evaluate(() => {
  const store = window.__solidgeoStore.getState();
  store.setSettings({ theme: 'dark' });
  store.newProject();
  store.createSolid('cube', { size: 2.1, cx: -3.2, cy: 0, cz: 0 });
  store.createSolid('sphere', { radius: 1.1, cx: 0, cy: 0, cz: 1.1 });
  store.createSolid('cylinder', { radius: 0.9, height: 2.2, cx: 3.2, cy: 0, cz: 0 });
  store.createSolid('pyramid', { sides: 4, radius: 1.2, height: 2.3, cx: 6.2, cy: 0, cz: 0 });
  store.createSolid('cone', { radius: 1.0, height: 2.1, cx: 9.2, cy: 0, cz: 0 });
  store.createSolid('prism', { sides: 6, radius: 1.0, height: 2.0, cx: 12.2, cy: 0, cz: 0 });
  store.createSolid('tetra', { size: 2.0, cx: 15.1, cy: 0, cz: 0 });
  store.measureSelection();
});
await page.waitForTimeout(500);
await page.evaluate(() => {
  window.__solidgeoEngine.fitAll();
});
await page.waitForTimeout(1000);
await page.screenshot({ path: 'shots/ui-gallery.png' });

console.log('ERRORS', JSON.stringify(errors));
await browser.close();
