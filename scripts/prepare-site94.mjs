import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
const v='20261112-site94-94a-photo-v1';
function edit(path,fn){const old=read(path,'utf8'),s=fn(old);if(s!==old)write(path,s);}
function once(s,a,b){if(s.includes(b))return s;assert(s.includes(a),'Missing anchor '+a.slice(0,100));return s.replace(a,b);}
edit('src/map-visible-sites.js',s=>{
 if(s.includes('mergeSite94Records'))return s;
 s="import {mergeSite94Records} from './site94-records.js?v="+v+"';\n"+s;
 return once(s,'return records.filter(record=>!removedIds.has(record.id));','return mergeSite94Records(records.filter(record=>!removedIds.has(record.id)));');
});
edit('src/archive-manifest.js',s=>once(s,'export const ARCHIVE_MAP=[',"export const ARCHIVE_MAP=[\n {id:'pad-94',kind:'site94',title:'Площадки № 94 / 94А',scale:MUSEUM_METRE,yaw:0,modelVersion:'"+v+"',orientation:'two-existing-territories-photo-guided-unsurveyed'},"));
edit('src/archive-models.js',s=>{
 if(!s.includes("import {buildSite94"))s="import {buildSite94,connectSite94} from './site94.js?v="+v+"';\n"+s;
 s=once(s,'export function buildArchiveModel(root,entry){',"export function buildArchiveModel(root,entry){\n if(entry.kind==='site94')return buildSite94(root);");
 s=once(s,'  const built=buildArchiveModel(root,spec);',"  if(spec.kind==='site94')root.userData.site94Members=o.record.mergedMembers;\n  const built=buildArchiveModel(root,spec);\n  if(spec.kind==='site94')connectSite94(root,roadPaths);");
 s=once(s,"  if(o.record.id==='pad-31')return inspectSite31('all',camera,controls);","  if(o.record.id==='pad-94')return inspectSite94('all',camera,controls);\n  if(o.record.id==='pad-31')return inspectSite31('all',camera,controls);");
 if(!s.includes(' function inspectSite94('))s=s.replace(' function protonPosition('," function inspectSite94(view,camera,controls){const root=objects.find(o=>o.record.id==='pad-94')?.g;if(!root?.userData.site94Model)return false;const v=root.userData.site94Model.views[view]||root.userData.site94Model.views.all;return fitArchiveView(root,v,view,camera,controls,'site94Framing');}\n function protonPosition(");
 s=once(s,' return {inspectSite118,'," return {inspectSite94,site94Stats:()=>objects.find(o=>o.record.id==='pad-94')?.g.userData.site94Model,inspectSite118,");
 return s.replace(/(archive-manifest\.js\?v=)[\w.-]+/g,'$1'+v);
});
for(const file of ['index.html','museum.html','workshop.html'])edit(file,s=>{
 if(!s.includes('// SITE94_UNIFIED_V1')){
  s=s.replace("import * as THREE from 'three';","// SITE94_UNIFIED_V1\nimport {canonicalSite94} from './src/site94-records.js?v="+v+"';\nimport * as THREE from 'three';");
  s=once(s,'function openMenuSite(id){','function openMenuSite(id){id=canonicalSite94(id);');
  const ui=` let site94Views=document.getElementById('site94Views');
 if(!site94Views){site94Views=document.createElement('div');site94Views.id='site94Views';site94Views.className='detail-views';document.getElementById('description').after(site94Views);}
 site94Views.replaceChildren();site94Views.hidden=r.id!=='pad-94';site94Views.style.cssText='display:'+(site94Views.hidden?'none':'flex')+';gap:6px;flex-wrap:wrap;margin:10px 0';
 if(r.id==='pad-94')for(const [label,view]of [['Весь комплекс','all'],['94 · главный корпус','hall'],['94А · ворота','gates']]){const b=document.createElement('button');b.type='button';b.className='detail-button';b.dataset.site94View=view;b.textContent=label;b.onclick=()=>portalArchive.inspectSite94(view,camera,ctl);site94Views.append(b);}
`;
  s=once(s," let site95Views=document.getElementById('site95Views');",ui+" let site95Views=document.getElementById('site95Views');");
  s=s.replace("'#site95Views','#site250aViews'","'#site95Views','#site94Views','#site250aViews'");
  const qa='window.__BAIKONUR_QA={';assert(s.includes(qa));
  s=s.replace(qa,"window.__BAIKONUR_QA={site94:{stats:portalArchive.site94Stats,inspect:view=>portalArchive.inspectSite94(view,camera,ctl)},");
  s=s.replace('</style>',`\n#site94Views button{padding:8px 10px;border:1px solid #8da6b75c;border-radius:8px;background:#253e4c;color:#edf4f8;cursor:pointer;font:600 12px Arial}
@media(min-width:1000px){body.workshop-mode:has(#workshopPanel:not([hidden])) #info:has(#site94Views:not([hidden])){right:370px!important;top:205px!important;width:310px!important;max-height:calc(100dvh - 310px)!important}}
</style>`);
 }
 return s.replace(/((?:archive-models\.js|map-visible-sites\.js)\?v=)[\w.-]+/g,'$1'+v);
});
edit('tests/map-group-removal-source.mjs',s=>{
 s=s.replace('original.length-display.length,9','original.length-display.length,10');
 s=s.replace('assert.deepEqual(display,original.filter(r=>!removed.has(r.id)));',"assert.deepEqual(display.filter(r=>r.id!=='pad-94'),original.filter(r=>!removed.has(r.id)&&!['pad-94','pad-94а'].includes(r.id)));");
 s=s.replace('for(const r of display)assert.equal(',"for(const r of display.filter(r=>r.id!=='pad-94'))assert.equal(");return s;
});
// Keep the original integration anchors idempotent; finish only the earth material.
edit('src/archive-models.js',s=>{
 s=s.replace('import {connectSite94}', 'import {connectSite94,applySite94Ground}');
 const anchor="  if(spec.kind==='site94')connectSite94(root,roadPaths);";
 s=once(s,anchor,anchor+"\n  if(spec.kind==='site94')applySite94Ground(root,{referenceMaterial:referenceGroundMaterial,steppeSurface,width,height});");
 return s.replace(/(site94-road-grade\.js\?v=)[\w.-]+/g,'$120261112-site94-ground-v2');
});
for(const file of ['index.html','museum.html','workshop.html'])edit(file,s=>s.replace(/(archive-models\.js\?v=)[\w.-]+/g,'$120261112-site94-ground-v2'));
assert.equal(read('index.html','utf8'),read('museum.html','utf8'));
console.log('SITE94_UNIFIED_PREPARED');
