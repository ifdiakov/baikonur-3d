import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const corpus=JSON.parse(await readFile(new URL('../data/buran-knowledge.json',import.meta.url),'utf8'));
const storyIds=Object.keys(corpus.stories);
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
async function createCase({failFirst=false}={}){
 const page=await browser.newPage();let requests=0,release;
 const gate=new Promise(resolve=>release=resolve);
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/__knowledge-test',route=>route.fulfill({contentType:'text/html',body:
  '<!doctype html><html><body><div id="card"></div></body></html>'}));
 await page.route('**/data/buran-knowledge.json?*',async route=>{
  requests++;
  if(failFirst&&requests===1){await route.fulfill({status:503,contentType:'application/json',body:'{}'});return;}
  await gate;await route.continue();
 });
 await page.goto(new URL('__knowledge-test',base).href);
 await page.addScriptTag({url:new URL('src/museum-startup.js',base).href});
 await page.evaluate(async()=>{
  const {createDeferredKnowledge}=await import('./src/deferred-knowledge.js');
  window.knowledge=createDeferredKnowledge({startup:window.__MUSEUM_STARTUP});
 });
 return {page,release,requests:()=>requests};
}
try{
 const first=await createCase(),page=first.page;
 const snapshot=await page.evaluate(async data=>{
  const {createMuseumKnowledge}=await import('./src/museum-knowledge.js');
  const full=createMuseumKnowledge(data),fast=window.knowledge;
  return {fastMenu:fast.storiesMenu(),fullMenu:full.storiesMenu(),stats:fast.stats(),
   descriptions:Object.entries(data.sites).map(([id,record])=>[fast.siteSummary(id),record.summary]),
   missing:fast.renderStory('not-an-article',document.getElementById('card'))};
 },corpus);
 assert.equal(first.requests(),0,'No full corpus request before the first map frame');
 assert.equal(snapshot.stats.contentLoaded,false);assert.equal(snapshot.stats.loadingState,'queued');
 assert.deepEqual(snapshot.fastMenu,snapshot.fullMenu,'All menu text remains the reviewed text');
 for(const [actual,expected]of snapshot.descriptions)assert.equal(actual,expected);
 assert.equal(snapshot.missing,null);
 await page.evaluate(([firstId,secondId])=>{
  const card=document.getElementById('card');
  window.knowledge.renderStory(firstId,card,{includeTitle:false});
  card.replaceChildren();window.knowledge.renderStory(secondId,card,{includeTitle:false});
  window.__MUSEUM_STARTUP.ready();
 },storyIds);
 await page.waitForFunction(()=>window.knowledge.stats().loadingState==='loading');
 assert.equal(await page.locator('.museum-knowledge-pending').count(),1);
 first.release();await page.evaluate(()=>window.knowledge.ready);
 await page.waitForFunction(()=>!document.querySelector('.museum-knowledge-pending'));
 assert.equal(first.requests(),1,'Concurrent card requests share one background load');
 assert.equal(await page.locator('[data-knowledge-kind="story"]').count(),1);
 assert.equal(await page.locator('[data-knowledge-kind="story"]').getAttribute('data-knowledge-id'),storyIds[1],
  'Completion of an old card cannot replace the current article');
 assert.ok(await page.locator('.museum-knowledge-sources a').count()>0,'Full sources appear after download');
 assert.equal((await page.evaluate(()=>window.knowledge.stats())).contentLoaded,true);
 await page.close();

 const retry=await createCase({failFirst:true});retry.release();
 await retry.page.evaluate(id=>{
  window.knowledge.renderStory(id,document.getElementById('card'));
  window.__MUSEUM_STARTUP.ready();
 },storyIds[0]);
 await retry.page.waitForFunction(()=>window.knowledge.stats().loadingState==='error');
 assert.equal(await retry.page.locator('body').evaluate(el=>el.classList.contains('museum-ready')),true,
  'An article failure leaves the museum interactive');
 assert.equal((await retry.page.evaluate(()=>window.knowledge.stats())).contentLoaded,false);
 await retry.page.getByRole('button',{name:'Повторить',exact:true}).click();
 await retry.page.evaluate(()=>window.knowledge.ready);
 await retry.page.waitForFunction(()=>!document.querySelector('.museum-knowledge-pending'));
 assert.equal(retry.requests(),2,'Retry creates exactly one new corpus request');
 assert.ok(await retry.page.locator('.museum-knowledge-sources a').count()>0);
 assert.equal((await retry.page.evaluate(()=>window.knowledge.stats())).loadingState,'ready');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'passed',cases:['deferred network','exact initial menu','concise descriptions',
  'shared request','stale card ownership','full citations','local failure','retry'],indexEntries:32}));
}finally{await browser.close();}
