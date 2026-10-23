import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('shots',{recursive:true});
const browser = await chromium.launch({ executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true, args:['--no-sandbox','--disable-crash-reporter','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1620,height:1020} });
const errors=[]; page.on('pageerror',e=>{errors.push(String(e));console.log('PAGEERROR',String(e));});
page.on('console',m=>{ if(m.type()==='error') console.log('CONSOLE',m.text()); });
await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.waitForFunction(()=>Boolean(window.__solidgeoEngine));
await page.waitForTimeout(400);
await page.evaluate(()=>{ const s=window.__solidgeoStore.getState(); s.newProject(); s.setDirty(false); });

// Point dialog
await page.locator('.section-link', { hasText:'输入坐标' }).click();
await page.waitForTimeout(350);
await page.screenshot({path:'shots/dialog-point.png'});
const inputs = page.locator('.modal .number-field input');
await inputs.nth(0).fill('1'); await inputs.nth(1).fill('2'); await inputs.nth(2).fill('3');
await page.locator('.modal-foot .primary-button').click();
await page.waitForTimeout(300);
let count = await page.evaluate(()=>window.__solidgeoStore.getState().entities.length);
assert.equal(count,1);

// Circle dialog
await page.locator('.soft-button', { hasText:'圆 / 圆弧' }).click();
await page.waitForTimeout(300);
await page.locator('.modal-foot .primary-button').click();
await page.waitForTimeout(300);
const circleCount = await page.evaluate(()=>window.__solidgeoStore.getState().entities.filter(e=>e.type==='circle').length);
assert.equal(circleCount,1);

// Vector dialog
await page.locator('.soft-button', { hasText:'空间向量' }).click();
await page.waitForTimeout(300);
await page.locator('.modal-foot .primary-button').click();
await page.waitForTimeout(300);
const vectorCount = await page.evaluate(()=>window.__solidgeoStore.getState().entities.filter(e=>e.type==='vector').length);
assert.equal(vectorCount,1);

// Create cube and axis section via dialog
await page.evaluate(()=>{ const s=window.__solidgeoStore.getState(); s.setDialog({kind:'solid',solidType:'cube'}); });
await page.waitForTimeout(200);
await page.locator('.modal-foot .primary-button').click();
await page.waitForTimeout(300);
await page.evaluate(()=>{ const s=window.__solidgeoStore.getState(); const cube=s.entities.find(e=>e.type==='solid'); s.setSelection([{id:cube.id}]); s.openSection(); });
await page.waitForTimeout(400);
await page.screenshot({path:'shots/dialog-section.png'});
const modalVisible = await page.locator('.modal').count();
console.log('SECTION MODAL', modalVisible);
if(modalVisible){ await page.locator('.modal-foot .primary-button').click(); await page.waitForTimeout(500); }
const sectionCount = await page.evaluate(()=>window.__solidgeoStore.getState().entities.filter(e=>e.type==='section').length);
assert.equal(sectionCount,1);

// Create segment for animations
const segInfo = await page.evaluate(()=>{
  const s=window.__solidgeoStore.getState();
  s.createPointAt([-3,0,1]); s.createPointAt([3,0,1]);
  const st=window.__solidgeoStore.getState();
  const pts=st.entities.filter(e=>e.type==='point');
  const seg={a:pts[pts.length-2],b:pts[pts.length-1]};
  st.setActiveTool('segment');
  st.handleCanvasPick({id:seg.a.id},seg.a.pos,false);
  st.handleCanvasPick({id:seg.b.id},seg.b.pos,false);
  const s2=window.__solidgeoStore.getState();
  const segment=s2.entities.find(e=>e.type==='segment');
  s2.setActiveTool('select');
  s2.setSelection([{id:segment.id}]);
  s2.setRightTab('animate');
  window.__solidgeoEngine.fitAll();
  return {id:segment.id};
});
await page.waitForTimeout(500);
await page.screenshot({path:'shots/animate-tab.png'});
const started = await page.evaluate(()=>window.__solidgeoEngine.startTraceAnimation());
assert.equal(started,true);
await page.waitForTimeout(1600);
await page.screenshot({path:'shots/animate-trace.png'});
await page.evaluate(()=>window.__solidgeoEngine.stopAnimations());
const revolved = await page.evaluate(()=>window.__solidgeoEngine.startRevolveAnimation());
assert.equal(revolved,true);
await page.waitForTimeout(1300);
await page.screenshot({path:'shots/animate-revolve.png'});
await page.evaluate(()=>window.__solidgeoEngine.stopAnimations());

// clip section test and screenshot
await page.evaluate(()=>{
  const s=window.__solidgeoStore.getState();
  const sec=s.entities.find(e=>e.type==='section');
  if(sec){ s.setSelection([{id:sec.id}]); s.updateEntity(sec.id,e=>({...e,clip:true}),'切换剖切'); }
});
await page.waitForTimeout(600);
await page.screenshot({path:'shots/section-clip.png'});

console.log('COUNTS', await page.evaluate(()=>window.__solidgeoStore.getState().entities.map(e=>e.type)));
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
