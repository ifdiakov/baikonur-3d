import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const enc=JSON.parse(readFileSync('data/encyclopedia.json','utf8'));
const index=readFileSync('index.html','utf8'),html=readFileSync('encyclopedia.html','utf8'),mod=readFileSync('src/encyclopedia-3d.js','utf8');
const types={rocket:'model3d',person:'portrait',organization:null};
const roster=enc.items.filter(x=>Object.hasOwn(types,x.type));
assert.equal(roster.length,20);
for(const item of roster){
 assert(item.media,'Missing encyclopedia image/model for '+item.id);
 if(item.type==='rocket'){
  assert.equal(item.media.kind,'model3d');
  assert.equal(item.media.previewId,item.id);
  assert(mod.includes("id==='"+item.id+"'"),'Missing geometry planner: '+item.id);
 }else if(item.type==='person'){
  assert.equal(item.media.kind,'portrait');
  assert(/^https:\/\//.test(item.media.src)||item.media.src.startsWith('./assets/'),'Broken portrait source: '+item.id);
  assert(item.media.credit&&item.media.source,'Portrait attribution missing: '+item.id);
 }else if(item.type==='organization'){
  assert(['logo','wordmark'].includes(item.media.kind),'Organization identity missing: '+item.id);
  assert(item.media.kind==='logo'?Boolean(item.media.src):Boolean(item.media.text),'Organisation mark is empty: '+item.id);
  assert(item.media.credit,'Organisation credit missing: '+item.id);
 }
}
assert.equal(roster.filter(x=>x.type==='rocket').length,6);
assert.equal(roster.filter(x=>x.type==='person').length,6);
assert.equal(roster.filter(x=>x.type==='organization').length,8);
assert.equal(enc.items.filter(x=>x.type==='site').length,8);
assert.match(index,/<a id="encyclopediaNavLink"[^>]*href="\.\/encyclopedia\.html"/);
assert.doesNotMatch(index,/id="encyclopedia-entry"/);
assert.match(index,/#ui>#encyclopediaNavLink/);
assert.match(html,/class="detail-model-stage"/.source? /detail-model-stage/:/detail-model-stage/);
assert.match(html,/media-credit/);
assert.match(html,/src\/encyclopedia-3d\.js/);
assert.match(html,/data-article-id/);
assert.match(mod,/preserveDrawingBuffer:true/);
assert.match(mod,/createInspectionModel/);
console.log('ENCYCLOPEDIA_MEDIA_DATA_PASS',JSON.stringify({items:enc.items.length,persons:6,technology:6,organizations:8,siteCount:8}));
