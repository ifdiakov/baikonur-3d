import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright';
import {fileURLToPath} from 'node:url';
import {SHARE_EVENTS,parseShareTarget} from '../src/card-share.js';
const data=JSON.parse(await readFile(new URL('../data/encyclopedia.json',import.meta.url),'utf8'));
const archive=JSON.parse(await readFile(new URL('../data/buran-knowledge.json',import.meta.url),'utf8'));
const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
const map=new Map(data.items.map(x=>[x.id,x]));
const siteIds=new Set(catalog.sites.map(x=>x.id));
assert.equal(map.size,data.items.length,'Unique article IDs');
for(const a of data.items){
 assert.ok(data.types[a.type],a.id+' type');
 for(const id of a.links||[])assert.ok(map.has(id),a.id+' broken link '+id);
 for(const id of a.siteIds||[])assert.ok(siteIds.has(id),a.id+' unknown site '+id);
 for(const id of a.scenarioIds||[]){
  assert.ok(data.scenarioRegistry[id],a.id+' unknown scenario '+id);
  const target=parseShareTarget(new URLSearchParams({share:id}).toString());assert.ok(target,id);
  if(target.kind==='event')assert.ok(SHARE_EVENTS[target.id],id);
  if(target.kind==='story')assert.ok(archive.stories[target.id],id);
 }
 for(const section of [...(a.sections||[]),...(a.timeline||[])])for(const id of section.sourceIds||[])assert.ok(data.sourceRegistry[id],a.id+' missing source '+id);
 for(const url of a.sources||[])assert.ok(/^https?:\/\//.test(url),a.id+' invalid source URL');
}
for(const id of ['chief-designers','korolev','ryazansky','pilyugin','vkuznetsov','buran-crews','buran-cooperation','soyuz5-development'])assert.ok(map.get(id).sections.length>=3,id+' substantive sections');
assert.equal(map.get('chief-designers').links.includes('vkuznetsov'),true);
assert.match(map.get('event-buran').summary,/Людей на борту не было/);
assert.match(map.get('event-soyuz5-first').summary,/суборбитальн/);
assert.equal(map.get('story-baikal-secret-flight').evidenceType,'hoax');
assert.ok(!map.get('soyuzcraft').links.includes('energia'),'Spacecraft builder must be enterprise, not rocket');
assert.ok(map.get('soyuzcraft').links.includes('energiaorg'));
for(const [id,s] of Object.entries(data.siteRegistry))for(const a of s.articleIds)assert.ok(map.get(a).siteIds.includes(id));
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8879/';
const out=new URL('../../knowledge-expansion-2026-11-17/qa/',import.meta.url);
await mkdir(out,{recursive:true});
const results=[];
for(const [name,engine,viewport] of [['desktop-chromium',chromium,{width:1440,height:1000}],['mobile-webkit',webkit,{width:390,height:844}]]){
 const browser=await engine.launch({headless:true,...(name.includes('chromium')&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const page=await browser.newPage({viewport});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(new URL('encyclopedia.html#chief-designers',base).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ENCYCLOPEDIA_QA?.stats().selectedId==='chief-designers');
  assert.equal(await page.locator('#detail .article-section').count(),map.get('chief-designers').sections.length);
  await page.locator('#search').fill('СКБ НИИ-10');
  assert.ok(await page.locator('[data-article-id="vkuznetsov"]').count(),'Search full article text');
  await page.locator('#search').fill('Королев');
  assert.ok(await page.locator('[data-article-id="korolev"]').count(),'Normalize ё to е');
  await page.locator('#search').fill('');
  await page.locator('#detail .related button').filter({hasText:'Михаил Сергеевич Рязанский'}).click();
  await page.waitForFunction(()=>location.hash==='#ryazansky');
  assert.ok((await page.locator('#detail').innerText()).includes('Радиотехническая школа'));
  const siteLink=page.locator('#detail a').filter({hasText:'Площадка № 5 —'}).first();
  const hrefs=await page.locator('#detail .context-links a').evaluateAll(els=>els.map(e=>e.href));
  assert.ok(hrefs.some(h=>new URL(h).searchParams.get('share')==='site:pad-5'));
  assert.ok(hrefs.some(h=>new URL(h).searchParams.get('share')==='history:people'));
  await page.screenshot({path:fileURLToPath(new URL(name+'-ryazansky.png',out))});
  await page.getByRole('button',{name:'← К списку статей',exact:true}).click();
  await page.locator('#search').fill('экипажи Бурана');
  // Multiword search uses the full text, including both words independently.
  assert.ok(await page.locator('[data-article-id="buran-crews"]').count());
  await page.locator('[data-article-id="buran-crews"]').click();
  await page.waitForFunction(()=>location.hash==='#buran-crews');
  assert.match(await page.locator('#detail').innerText(),/без экипажа/);
  if(name.startsWith('mobile'))await page.evaluate(()=>document.querySelector('#detail').scrollIntoView({behavior:'instant',block:'start'}));
  await page.screenshot({path:fileURLToPath(new URL(name+'-crews.png',out))});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
  if(name.startsWith('mobile')){
   const positions=await page.evaluate(()=>({detail:document.querySelector('#detail').getBoundingClientRect().top,cards:document.querySelector('#cards').getBoundingClientRect().top}));
   assert.ok(positions.detail<positions.cards,'Selected article before long mobile results');
  }
  await page.goto(new URL('encyclopedia.html?site=pad-45#soyuz5-development',base).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ENCYCLOPEDIA_QA?.stats().selectedId==='soyuz5-development');
  assert.equal(await page.locator('#cards .card').count(),data.siteRegistry['pad-45'].articleIds.length);
  assert.equal(await page.locator('#detail .article-timeline li').count(),5);
  assert.ok((await page.locator('#detail').innerText()).includes('30 апреля'));
  await page.goto(new URL('encyclopedia.html#story-baikal-secret-flight',base).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ENCYCLOPEDIA_QA?.stats().selectedId==='story-baikal-secret-flight');
  assert.match(await page.locator('#detail .article-note').first().innerText(),/Первоапрельский розыгрыш/);
  assert.deepEqual(errors,[]);
  results.push({name,pass:true,errors});
 }catch(error){await page.screenshot({path:fileURLToPath(new URL(name+'-failure.png',out))});await writeFile(new URL(name+'-failure.json',out),JSON.stringify({error:error.message,errors},null,2));throw error;}finally{await browser.close();}
}
await writeFile(new URL('results.json',out),JSON.stringify({pass:true,articles:data.items.length,structuralChecks:true,results},null,2));
console.log('ENCYCLOPEDIA_KNOWLEDGE_PASS',JSON.stringify(results));
