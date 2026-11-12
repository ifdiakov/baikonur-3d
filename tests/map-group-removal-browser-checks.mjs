import assert from 'node:assert/strict';
import {REMOVED_MAP_GROUPS} from '../src/map-visible-sites.js';
export async function checkRemovedMapGroups(page,mode){
 const result=await page.evaluate(groups=>{
  const targets=window.__MUSEUM_SHARE.targets(),ids=targets.map(t=>t.id);
  const text=['labelLayer','ui','workshopPanel'].map(id=>document.getElementById(id)?.textContent||'').join('\n');
  const options=[...document.querySelectorAll('#wsObject option')].map(o=>o.value);
  return {targets:ids.length,groups:groups.map(([id,name])=>({id,inScene:__BAIKONUR_QA.siteState(id)!==null,inCards:ids.includes(id),inMenu:!!document.querySelector('[data-site-id="'+id+'"]'),inText:text.includes(name),inEditor:options.includes(id)})),retained:['pad-1','pad-31','pad-81','pad-82','pad-83','pad-92','pad-95','pad-112','pad-113','pad-175','pad-200'].map(id=>({id,scene:!!__BAIKONUR_QA.siteState(id),card:ids.includes(id)}))};
 },REMOVED_MAP_GROUPS);
 for(const row of result.groups)for(const key of ['inScene','inCards','inMenu','inText','inEditor'])assert.equal(row[key],false,row.id+' still present in '+key);
 for(const row of result.retained){assert(row.scene,'Real site missing '+row.id);assert(row.card,'Real card missing '+row.id);}
 for(const [id]of REMOVED_MAP_GROUPS)assert.equal(await page.evaluate(id=>__MUSEUM_SHARE.open({kind:'site',id}),id),false,'Removed link reopened '+id);
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
 return {...result,removedLinksRejected:9,remainingCardSelectionChecked:['pad-82','pad-83','pad-175']};
}
