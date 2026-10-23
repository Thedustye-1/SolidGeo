import { chromium } from 'playwright-core';
import fs from 'node:fs';
const browser = await chromium.launch({ executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true, args:['--no-sandbox','--disable-crash-reporter','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1620,height:1020} });
page.on('pageerror',e=>console.log('PAGEERROR',String(e)));
await page.goto('http://127.0.0.1:4173/?demo=1',{waitUntil:'networkidle'});
await page.waitForTimeout(1400);
const res = await page.evaluate(()=>{ const svg = window.__solidgeoEngine.exportThreeViewSVG(); return {len:svg.length, head:svg.slice(0,200)}; });
console.log(res);
// write by fetching data URL via page
const data = await page.evaluate(()=>window.__solidgeoEngine.exportThreeViewSVG());
fs.writeFileSync('shots/three-view.svg', data);
await page.evaluate(()=>window.__solidgeoStore.getState().setSelection([]));
await page.waitForTimeout(500);
await page.screenshot({path:'shots/v2-main.png'});
await browser.close();
