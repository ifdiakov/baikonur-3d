import {readFile,writeFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const path='data/owner19-release.json',stamp=JSON.parse(await readFile(path,'utf8'));
if(stamp.railRevision!=='20261109-owner19-shared-rail-v3'){
 const change=async(path,from,to)=>{let s=await readFile(path,'utf8');assert(s.includes(from),'Expected source '+path+': '+from);await writeFile(path,s.replace(from,to));};
 await change('src/osm-transport.js','matchOwnerTrainToRenderedRail}', 'matchOwnerTrainToRenderedRail,separateOwnerRailRuns,isOwnerSharedRail}');
 await change('src/osm-transport.js','clipPad5DuplicateRail(run,wayId)),','clipPad5DuplicateRail(run,wayId)).flatMap(run=>separateOwnerRailRuns(run,wayId)),');
 await change('src/osm-transport.js','curvedRuns=isAbandoned?selectedRuns:','curvedRuns=isAbandoned||isOwnerSharedRail(wayId)?selectedRuns:');
 await change('src/transport-bake.js','import {shapeOwnerRail}', 'import {shapeOwnerRail,OWNER_RAIL_CURVES_VERSION}');
 await change('src/transport-bake.js',"const fingerprint='road-lod-prebuilt-v1;geometry-v3;'+OWNER_AD_REFINEMENTS_VERSION;", "const fingerprint='road-lod-prebuilt-v1;geometry-v3;'+OWNER_AD_REFINEMENTS_VERSION+';'+OWNER_RAIL_CURVES_VERSION;");
 await change('src/transport-bake.js',"cacheKind:'routes-only',ownerRevision:OWNER_AD_REFINEMENTS_VERSION,", "cacheKind:'routes-only',ownerRevision:OWNER_AD_REFINEMENTS_VERSION,railRevision:OWNER_RAIL_CURVES_VERSION,");
 await change('scripts/build-authoritative-road-lod.mjs','ownerRevision:bake.ownerRevision,displayGradeVersion','ownerRevision:bake.ownerRevision,railRevision:bake.railRevision,displayGradeVersion');
 const names=new Set(['owner-rail-curves.js','transport-bake.js','osm-transport.js','transport-geometry-bake-v1.json.gz','road-lod-authoritative-v1.json.gz']);
 for(const p of [...(await readdir('src')).filter(n=>n.endsWith('.js')).map(n=>'src/'+n),'index.html','museum.html','workshop.html']){
  const s=await readFile(p,'utf8');await writeFile(p,s.replace(/(['"])([^'"\n]*\/([^\/\s?'"\n]+)(?:\?[^'"\n]*)?)\1/g,(all,q,url,name)=>names.has(name)?q+url.split('?')[0]+'?v=20261109-owner19-v3'+q:all));
 }
 stamp.railRevision='20261109-owner19-shared-rail-v3';await writeFile(path,JSON.stringify(stamp,null,2)+'\n');
 const context=await readFile('PROJECT_CONTEXT.md','utf8');await writeFile('PROJECT_CONTEXT.md',context+'\nВизуальная приёмка 19 точек, дополнение v3: на участке 605.2/420.9—604.6/425.7 две ветки имели разную кривизну и создавали лишний крест. Теперь они используют общий плавный участок, который рисуется только один раз; концы ответвлений имеют общую касательную. Повторное скругление готовой кривой отключено, чтобы не разрывать стрелочные стыки. Версия ЖД включена в подпись транспортного кеша. Дополнительная проверка tests/owner19-shared-rail.mjs запрещает повторное покрытие общего участка второй веткой.\n');
}
console.log('OWNER19_SHARED_RAIL_PREPARED');
