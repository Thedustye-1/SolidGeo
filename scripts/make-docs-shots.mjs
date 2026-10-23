import { chromium } from 'playwright-core';
import fs from 'node:fs';
fs.mkdirSync('docs/screenshots',{recursive:true});
const browser = await chromium.launch({ executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true, args:['--no-sandbox','--disable-crash-reporter','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1620,height:1020}, deviceScaleFactor:1 });
page.on('pageerror',e=>console.log('PAGEERROR',String(e)));
await page.goto('http://127.0.0.1:4173/?demo=1',{waitUntil:'networkidle'});
await page.waitForTimeout(1800);
await page.evaluate(()=>{ const s=window.__solidgeoStore.getState(); const cube=s.entities.find(e=>e.type==='solid'); s.setSelection([{id:cube.id}]); s.setSettings({theme:'dark',showMeasures:true}); s.setRightTab('props'); window.__solidgeoEngine.fitAll(); window.__solidgeoStore.setState({toasts:[]}); });
await page.waitForTimeout(900);
await page.screenshot({path:'docs/screenshots/main-dark.png'});

await page.evaluate(()=>{ window.__solidgeoStore.getState().setSettings({theme:'light'}); window.__solidgeoStore.setState({toasts:[]}); });
await page.waitForTimeout(1000);
await page.screenshot({path:'docs/screenshots/main-light.png'});

await page.evaluate(()=>{
  const store=window.__solidgeoStore.getState();
  store.setSettings({theme:'dark'});
  store.newProject();
  store.createSolid('cube',{size:2.2,cx:-3.2,cy:0,cz:0});
  store.createSolid('sphere',{radius:1.1,cx:0,cy:0,cz:1.1});
  store.createSolid('cylinder',{radius:0.9,height:2.2,cx:3.2,cy:0,cz:0});
  store.createSolid('cone',{radius:1.0,height:2.1,cx:6.3,cy:0,cz:0});
  store.createSolid('prism',{sides:6,radius:1.0,height:2.0,cx:9.4,cy:0,cz:0});
  store.createSolid('pyramid',{sides:4,radius:1.2,height:2.3,cx:12.4,cy:0,cz:0});
  store.setSelection([]);
  window.__solidgeoStore.setState({toasts:[]});
  setTimeout(()=>window.__solidgeoEngine.fitAll(),50);
});
await page.waitForTimeout(1200);
await page.screenshot({path:'docs/screenshots/gallery.png'});

await page.evaluate(()=>{
  const store=window.__solidgeoStore.getState();
  store.newProject();
  store.createSolid('cube',{size:2.2,cx:0,cy:0,cz:0});
  store.createPointAt([-3.4,0,1.1]);
  store.createPointAt([3.4,0,1.1]);
  const st=window.__solidgeoStore.getState();
  const pts=st.entities.filter(e=>e.type==='point');
  st.setActiveTool('segment');
  st.handleCanvasPick({id:pts[0].id},pts[0].pos,false);
  st.handleCanvasPick({id:pts[1].id},pts[1].pos,false);
  const st2=window.__solidgeoStore.getState();
  const seg=st2.entities.find(e=>e.type==='segment');
  st2.setActiveTool('select');
  st2.setSelection([{id:seg.id}]);
  st2.setRightTab('animate');
  st2.setSettings({theme:'dark'});
  window.__solidgeoStore.setState({toasts:[]});
  window.__solidgeoEngine.fitAll();
});
await page.waitForTimeout(900);
await page.screenshot({path:'docs/screenshots/animation.png'});
await browser.close();
