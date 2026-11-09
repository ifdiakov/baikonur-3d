import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
const release='20261109-owner19-v2';
let done=false;try{done=JSON.parse(await readFile('data/owner19-release.json','utf8')).release===release;}catch{}
if(done){console.log('OWNER19_ALREADY_PREPARED');process.exit(0);}
async function edit(path,fn){const before=await readFile(path,'utf8'),after=fn(before);assert(typeof after==='string',path);await writeFile(path,after);}
function replace(s,a,b){assert(s.includes(a),'Missing expected source: '+a.slice(0,120));return s.replace(a,b);}
for(const path of ['src/road-editor.js','src/workshop-road-editor.js'])await edit(path,s=>replace(replace(s,'mesh.name===name&&mesh.material?.isMaterial','mesh.name===name&&mesh.material?.isMaterial&&!mesh.material.isMeshBasicMaterial'),"asphalt:originalMaterial('OSM · единое дорожное полотно',0xadb2b3)","asphalt:originalMaterial('OSM · единое дорожное полотно',0x555751)"));
await edit('src/site110.js',s=>replace(s,',[-260,350,27,87,5]',''));
await edit('src/site113.js',s=>{
 s=replace(s,'asphalt:0x77766a','asphalt:0x555751');const a=s.indexOf(' // Owner correction: preserve'),b=s.indexOf(' for(const [u,v,w,d]of [[919',a);assert(a>0&&b>a);
 return s.slice(0,a)+' // Keep the calibrated streets BETWEEN houses, not along their centres.\n // Pavement -2.675 clears detailed ground (-2.705) by 30 mm.\n for(const road of SITE113_PATHS)k.path(road.map(P),3.4,.32,\'asphalt\',\'site113-internal-ad\');\n'+s.slice(b);
});
await edit('src/site113-road-grade.js',s=>replace(replace(s,'checkpoint7-site113-grade-v1','checkpoint7-site113-grade-v2-clear-surface'),'roadY=baseY+.025','roadY=baseY+.08'));
await edit('src/owner-ad-refinements.js',s=>{
 s=replace(s,'20261108-owner-19-road-fixes-v1','20261109-owner19-exact-junctions-v2');
 s=replace(s,"if(id==='443174416'||id==='172704752')","if(['443174416','172704752','172704782','172704807','172704830','172704695','172571880','172571885'].includes(id))");
 s=replace(s,"const removed=['172571864','172441889','443174416','172704752'];","const removed=['172571864','172441889','443174416','172704752','172704782','172704807','172704830','172704695','172571880','172571885'];");
 let a=s.indexOf(' const liftAreas='),b=s.indexOf(' const separate=',a);assert(a>0&&b>a);s=s.slice(0,a)+s.slice(b);s=s.replace('!zones.length&&!liftAreas.length&&!separate','!zones.length&&!separate');
 a=s.indexOf('  // Adjacent source ramps');b=s.indexOf('  if(separate)',a);assert(a>0&&b>a);return s.slice(0,a)+s.slice(b);
});
await edit('src/osm-transport.js',s=>{
 s=replace(s,'shapeOwnerRail,missingOwnerRailSeam,makeOwnerRailSeam','shapeOwnerRail,missingOwnerRailSeam,makeOwnerRailSeam,matchOwnerTrainToRenderedRail');
 s=replace(s,'const continuity=makeOwnerRailSeam()','const continuity=makeOwnerRailSeam(railPaths)');
 s=replace(s,"conformRailPath(roundRailCorners([...connectionPoints,...graphRailRoutePoints(graphTrain).slice(1)],{radius:15}),RAIL_PROFILE.ballastWidth).map","matchOwnerTrainToRenderedRail(conformRailPath(roundRailCorners([...connectionPoints,...graphRailRoutePoints(graphTrain).slice(1)],{radius:15}),RAIL_PROFILE.ballastWidth),railPaths).map");
 const a=s.indexOf(' for(const [x,y,radius] of [[612.5'),b=s.indexOf('\n }',a)+3;assert(a>0&&b>a);s=s.slice(0,a)+s.slice(b);
 return replace(s,"checkpoint('shoulder-owner');","// At gravel/asphalt joins there is one physical surface, not two lifted sheets.\n clipOrdinaryRoadMeshes([unpaved.mesh],asphalt.mesh);\n checkpoint('shoulder-owner');");
});
await edit('src/road-editor-style.js',s=>replace(s,'const widthStart=start?.road.width||road.width,widthEnd=end?.road.width||start?.road.width||road.width;',"const fixed=['road-3','road-8'].includes(road.id);\n const widthStart=fixed?road.width:start?.road.width||road.width,widthEnd=fixed?road.width:end?.road.width||start?.road.width||road.width;"));
await edit('src/road-editor-mesh.js',s=>replace(s,'if(!owner)continue;',"if(!owner||['road-3','road-8'].includes(owner.id))continue; // Exact T mouths need no circular patches."));
const path='data/road-edits-authoritative-20261103.json',d=JSON.parse(await readFile(path,'utf8'));
d.revision='rockettrip-roads-v7-20261109-19-verified-junctions';
const w=(x,z,y)=>[Number(((x-650)*3.4).toFixed(6)),y,Number(((z-522.5)*3.4).toFixed(6))];
const a=[-151.1089,.72,-333.8176],normal=[.772,-.635],j=[-127.933,.72,-368.055],tangent=[.456,-.89];
for(const r of d.added){
 if(r.id==='road-3'){r.width=3.2;r.points=[a,[a[0]+normal[0]*3,.72,a[2]+normal[1]*3],[j[0]-tangent[0]*12,.72,j[2]-tangent[1]*12],j,[j[0]+tangent[0]*12,.72,j[2]+tangent[1]*12],w(615.7,408.6,-.3),w(618.3,404.9,-2.25),w(620,402.8,-2.706),[-41.043,-2.706,-408.449]];}
 if(r.id==='road-8'){r.width=1.6;const t=[-205.4551,.72,-495.1764];r.points=[r.points[0],[t[0]+.689*5,.72,t[2]+.725*5],t];}
}
d.added=d.added.filter(r=>r.id!=='road-4');
const removed=['172571880','172571885','172571864','172441889','443174416','172704752','172704782','172704807','172704830','172704695'];
d.hidden=d.hidden.filter(r=>!removed.some(id=>r.sourceId.includes(id)));
await writeFile(path,JSON.stringify(d,null,2)+'\n');
await edit('src/transport-bake.js',s=>{
 s=replace(s,'import {polishCachedOwnerAd}','import {polishCachedOwnerAd,OWNER_AD_REFINEMENTS_VERSION}');
 s=replace(s,"const fingerprint='road-lod-prebuilt-v1;geometry-v3;site250a-ukss-passing-road-v1';","const fingerprint='road-lod-prebuilt-v1;geometry-v3;'+OWNER_AD_REFINEMENTS_VERSION;");
 s=replace(s,"['id','label','width'","['sourceWayId','abandoned','id','label','width'");
 s=replace(s,"cacheKind:'routes-only',","cacheKind:'routes-only',ownerRevision:OWNER_AD_REFINEMENTS_VERSION,");
 s=s.replaceAll('points:polishCachedOwnerAd(path.points,path.id)','points:bake.ownerRevision===OWNER_AD_REFINEMENTS_VERSION?path.points:polishCachedOwnerAd(path.points,path.id)');
 return replace(s,'shapeOwnerRail(path.points,path.id??path.sourceWayId)','(bake.ownerRevision===OWNER_AD_REFINEMENTS_VERSION?path.points:shapeOwnerRail(path.points,path.sourceWayId??path.id))');
});
await edit('src/road-lod.js',s=>{
 s=replace(s,'import {polishCachedOwnerAd}','import {polishCachedOwnerAd,OWNER_AD_REFINEMENTS_VERSION}');s=replace(s,"kind='roads'){","kind='roads',alreadyPrepared=false){");
 s=replace(s,'path=polishCachedOwnerAd(path,row.id);','path=alreadyPrepared?path:polishCachedOwnerAd(path,row.id);');s=replace(s,'}else path=shapeOwnerRail(path,row.id);','}else if(!alreadyPrepared)path=shapeOwnerRail(path,row.id);');
 return replace(s,"kind==='roads'?roadGrade:null,kind)","kind==='roads'?roadGrade:null,kind,data.ownerRevision===OWNER_AD_REFINEMENTS_VERSION)");
});
await edit('scripts/build-authoritative-road-lod.mjs',s=>replace(replace(s,"id:row.id,w:rail?","id:row.id||(row.sourceWayId?'osm-rail-'+row.sourceWayId:'rail'),w:rail?"),'sourceFingerprint:bake.sourceFingerprint,displayGradeVersion','sourceFingerprint:bake.sourceFingerprint,ownerRevision:bake.ownerRevision,displayGradeVersion'));
await edit('scripts/build-transport-bake.mjs',s=>replace(replace(s,'headless:true,','headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,'),"try{\n await page.goto","try{\n await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>fn.name==='animate'?0:raf(fn);});\n await page.goto"));
for(const page of ['index.html','museum.html','workshop.html'])await edit(page,s=>{
 const a=s.indexOf('// Targeted correction: an illustrative building overlaps'),b=s.indexOf('animate();startup.ready();',a);assert(a>0&&b>a);
 s=s.slice(0,a)+'// Only the source-traced house at 589/342.7 is removed in site110.js.\n// Never hide a whole material/instance batch to remove one building.\n'+s.slice(b);
 return s.replaceAll('transport-geometry-bake-v1.json.gz\'','transport-geometry-bake-v1.json.gz?v='+release+'\'').replaceAll('road-lod-authoritative-v1.json.gz\'','road-lod-authoritative-v1.json.gz?v='+release+'\'');
});
// Cache keys change, but the original visual modules/UI are not replaced.
const names=new Set(['transport-bake.js','site110.js','road-editor-mesh.js','owner-rail-curves.js','road-lod.js','owner-ad-refinements.js','road-editor.js','workshop-road-editor.js','site113-road-grade.js','road-editor-style.js','site113.js','osm-transport.js','road-edits-authoritative-20261103.json']);
for(const p of [...(await readdir('src')).filter(n=>n.endsWith('.js')).map(n=>'src/'+n),'index.html','museum.html','workshop.html'])await edit(p,s=>s.replace(/(['"])([^'"\n]*\/([^\/\s?'"\n]+)(?:\?[^'"\n]*)?)\1/g,(all,q,url,name)=>names.has(name)?q+url.split('?')[0]+'?v='+release+q:all));
const note='\n\n## 2026-11-09 · Повторная геометрическая приёмка 19 точек\nРелиз '+release+': исправлены первопричины, а не наложены новые заплаты. Материал редактора больше не берётся из светлой обзорной схемы. Т-стыки 605.7/424.2, 612.5/414.1, 589.8/377.1 и поворот 620/402.8 имеют общие линии/высоты, без круглых заплат. Удалённые дороги и устаревшие маски удаляются согласованно; восстановлены обочины. На 113 дороги лежат выше подробной земли, ошибочные линии через центры домов убраны. Под дорогой 589/342.7 удалён один технический корпус пл.110, а не группы зданий. На двух съездах грунтовая поверхность физически обрезана под асфальтом вместо подъёма. ЖД-кривые согласованы с путём поезда; разрыв 579/389—587.4/380.9 соединён с фактическими высотами и касательными. При запекании сохраняется sourceWayId, готовые изгибы/сдвиги повторно не применяются. Ширина дороги УКСС 2.5 и однократные сдвиги 204[-10,0],202[0,-5] проверяются, не применяются второй раз.\nПолный музей, меню, свет, туман, модели и живой транспорт сохраняются. Запрещено подменять его public-museum. Контрольные кадры, лучевые проверки и 19-пунктовый протокол: tests/owner19-browser.mjs; публикация только после проверки обоих входов и повторного теста живого сайта. Старые посторонние дефекты не объявлять исправленными. В конце каждого сообщения — Музей/Админка. Итог — четыре понятных раздела: 3D, интерфейс, модели, QA.\n';
await edit('PROJECT_CONTEXT.md',s=>s.includes('Релиз '+release)?s:s+note);
await writeFile('data/owner19-release.json',JSON.stringify({release,sourceGeometryPrepared:true,reference:'c3f6a737dc5f9c78332c7db3806251b104bc6456',test:'tests/owner19-browser.mjs'},null,2)+'\n');
console.log('OWNER19_SOURCE_PREPARED');
