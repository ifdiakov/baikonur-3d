import assert from 'node:assert/strict';
import {REMOVED_MAP_GROUPS,HIDDEN_MAP_SITE_IDS} from '../src/map-visible-sites.js';
export async function checkRemovedMapGroups(page,mode){
 const retained=['pad-1','pad-2','pad-2a','pad-3','pad-31','pad-81','pad-82','pad-83','pad-92','pad-94','pad-95','pad-110','pad-112','pad-112a','pad-113','pad-175','pad-200','pad-202','pad-250','airfield'];
 const result=await page.evaluate(({groups,hidden,retained})=>{
  const ids=__MUSEUM_SHARE.targets().map(t=>t.id),options=[...document.querySelectorAll('#wsObject option')].map(o=>o.value);
  const inspect=id=>({id,inScene:__BAIKONUR_QA.siteState(id)!==null,inCards:ids.includes(id),inMenu:!!document.querySelector('[data-site-id="'+id+'"]'),inEditor:options.includes(id)});
  return {targets:ids.length,groups:groups.map(([id])=>inspect(id)),hiddenSites:hidden.map(inspect),retained:retained.map(id=>({id,scene:!!__BAIKONUR_QA.siteState(id),card:ids.includes(id)})),silos:__BAIKONUR_QA.silo.stats().map(s=>s.siteId||s.id)};
 },{groups:REMOVED_MAP_GROUPS,hidden:HIDDEN_MAP_SITE_IDS,retained});
 for(const row of [...result.groups,...result.hiddenSites])for(const key of ['inScene','inCards','inMenu','inEditor'])assert.equal(row[key],false,row.id+' still present in '+key);
 for(const row of result.retained){assert(row.scene,'Retained model missing '+row.id);assert(row.card,'Retained card missing '+row.id);}
 assert(!result.silos.includes('pad-174'),'Hidden174 silo still installed');assert(result.silos.includes('pad-175'),'175 silo lost');
 const rejected=[...REMOVED_MAP_GROUPS.map(([id])=>id),...HIDDEN_MAP_SITE_IDS,'pad-3A','pad-3А','pad-3Б','pad-2Б','pad-110А','pad-92А'];
 for(const id of rejected)assert.equal(await page.evaluate(id=>__MUSEUM_SHARE.open({kind:'site',id}),id),false,'Hidden link reopened '+id);
 // Check both sides of easily confused pairs, not just the total count.
 for(const id of ['pad-2','pad-3','pad-92','pad-110','pad-94','pad-175']){
  assert(await page.evaluate(id=>__MUSEUM_SHARE.open({kind:'site',id}),id));
  assert.equal((await page.evaluate(()=>__MUSEUM_SHARE.current())).id,id);
 }
 assert(await page.locator('#infoShare').isVisible());
 if(mode==='workshop'){
  await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-175'));
  assert.equal(await page.locator('#wsObject').inputValue(),'pad-175');
  assert(await page.locator('#cameraAltitude').isVisible());
 }
 await page.evaluate(()=>__DELIVERY_FRAME());
 return {...result,passed:true,hiddenCount:HIDDEN_MAP_SITE_IDS.length,rejectedLinkCount:rejected.length,remainingCardSelectionChecked:['pad-2','pad-3','pad-92','pad-110','pad-94','pad-175']};
}
