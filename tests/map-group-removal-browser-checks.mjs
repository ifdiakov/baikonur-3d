import assert from 'node:assert/strict';
import {REMOVED_MAP_GROUPS,SITE91_EDITORIAL} from '../src/map-visible-sites.js';
export async function checkRemovedMapGroups(page,mode){
 const result=await page.evaluate(groups=>{
  const targets=window.__MUSEUM_SHARE.targets(),ids=targets.map(t=>t.id);
  const text=['labelLayer','ui','workshopPanel'].map(id=>document.getElementById(id)?.textContent||'').join('\n');
  const options=[...document.querySelectorAll('#wsObject option')].map(o=>o.value);
  return {targets:ids.length,groups:groups.map(([id,name])=>({id,inScene:__BAIKONUR_QA.siteState(id)!==null,inCards:ids.includes(id),inMenu:!!document.querySelector('[data-site-id="'+id+'"]'),inText:text.includes(name),inEditor:options.includes(id)})),retained:['pad-1','pad-31','pad-81','pad-82','pad-83','pad-91','pad-92','pad-95','pad-112','pad-113','pad-175','pad-200'].map(id=>({id,scene:!!__BAIKONUR_QA.siteState(id),card:ids.includes(id)}))};
 },REMOVED_MAP_GROUPS);
 for(const row of result.groups)for(const key of ['inScene','inCards','inMenu','inText','inEditor'])assert.equal(row[key],false,row.id+' still present in '+key);
 for(const row of result.retained){assert(row.scene,'Real site missing '+row.id);assert(row.card,'Real card missing '+row.id);}
 for(const [id]of REMOVED_MAP_GROUPS)assert.equal(await page.evaluate(id=>__MUSEUM_SHARE.open({kind:'site',id}),id),false,'Removed link reopened '+id);
 assert(await page.evaluate(()=>__MUSEUM_SHARE.open({kind:'site',id:'pad-91'})));
 assert.equal((await page.evaluate(()=>__MUSEUM_SHARE.current())).id,'pad-91');
 const info=page.locator('#info');assert(await info.isVisible());
 assert.equal(await page.locator('#infoPurpose').innerText(),SITE91_EDITORIAL.purposeLong);
 const text=await info.innerText();
 for(const expected of ['11Г141','площадке 91А','8–9 ноября 2011 года','Бриз-М','92А-50','нейтрализации'])assert(text.includes(expected),'Verified91 card text missing '+expected);
 assert(!text.includes('здесь обозначена станция 11Г141'),'Old ambiguous91/91A wording still visible');
 assert(await page.locator('#infoShare').isVisible());
 // Source links are in the existing expandable background section.
 // This is a content assertion, not a new editor-layout acceptance claim.
 await page.locator('#detailMore').evaluate(button=>button.click());
 const hrefs=await info.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.href));
 for(const url of SITE91_EDITORIAL.publicReferences)assert(hrefs.includes(url),'Missing source link '+url);
 result.site91={passed:true,card:'pad-91',title:await page.locator('#title').innerText(),purpose:SITE91_EDITORIAL.purposeLong,notesVisible:true,sourceLinks:hrefs.filter(url=>SITE91_EDITORIAL.publicReferences.includes(url)),reviewedOn:SITE91_EDITORIAL.contentReviewedOn};
 await page.locator('#detailMore').evaluate(button=>button.click());
 await page.evaluate(()=>__DELIVERY_FRAME());
 await page.screenshot({path:'qa-delivery/'+mode+'/site91-card.png',timeout:60000});
 for(const id of ['pad-82','pad-83','pad-175']){
  assert(await page.evaluate(id=>__MUSEUM_SHARE.open({kind:'site',id}),id));
  assert.equal((await page.evaluate(()=>__MUSEUM_SHARE.current())).id,id);
 }
 assert(await page.locator('#infoShare').isVisible());
 if(mode==='workshop'){
  await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-175'));
  assert.equal(await page.locator('#wsObject').inputValue(),'pad-175');
 }
 await page.evaluate(()=>__DELIVERY_FRAME());
 return {...result,removedLinksRejected:9,remainingCardSelectionChecked:['pad-91','pad-82','pad-83','pad-175']};
}
