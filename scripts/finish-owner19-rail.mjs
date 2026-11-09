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
 const context=await readFile('PROJECT_CONTEXT.md','utf8');await writeFile('PROJECT_CONTEXT.md',context+'\nВизуальная приёмка 19 точек, дополнение v3: на участке 605.2/420.9—604.6/425.7 две ветки имели разную кривизну и создавали лишний крест. Теперь они используют общий плавный участок, который рисуется только один раз; концы ответвлений имеют общую касательную. Повторное скругление готовой кривой отключено только внутри исправляемого подхода, чтобы не разрывать стрелочные стыки; внешние участки сохраняют прежнее скругление. Версия ЖД включена в подпись транспортного кеша. Дополнительная проверка tests/owner19-shared-rail.mjs запрещает повторное покрытие общего участка второй веткой.\n');
}
if(!stamp.preserveOuterRailCorners){
 let rail=await readFile('src/owner-rail-curves.js','utf8');
 if(!rail.includes('export function roundOwnerRailCorners'))rail+=`\n// Keep the original rounding everywhere outside the repaired shared approach.\nexport function roundOwnerRailCorners(points,rawId,round){
 if(!isOwnerSharedRail(rawId))return round(points,{radius:15});
 const protectedIndices=[];for(let i=0;i<points.length;i++){const p=points[i],x=p.x/3.4+650,y=p.z/3.4+522.5;if(x>598&&x<615&&y>412&&y<434)protectedIndices.push(i);}
 if(!protectedIndices.length)return round(points,{radius:15});
 const first=protectedIndices[0],last=protectedIndices.at(-1),before=points.slice(0,first+1),after=points.slice(last);
 return [...(before.length>2?round(before,{radius:15}):before).slice(0,-1),...points.slice(first,last+1),...(after.length>2?round(after,{radius:15}):after).slice(1)];
}\n`;
 await writeFile('src/owner-rail-curves.js',rail);
 let source=await readFile('src/osm-transport.js','utf8');
 const old='curvedRuns=isAbandoned||isOwnerSharedRail(wayId)?selectedRuns:selectedRuns.map(run=>roundRailCorners(run,{radius:15})),';
 assert(source.includes(old),'Expected scoped rounding integration');
 source=source.replace('separateOwnerRailRuns,isOwnerSharedRail}','separateOwnerRailRuns,isOwnerSharedRail,roundOwnerRailCorners}').replace(old,'curvedRuns=isAbandoned?selectedRuns:selectedRuns.map(run=>roundOwnerRailCorners(run,wayId,roundRailCorners)),');
 await writeFile('src/osm-transport.js',source);stamp.preserveOuterRailCorners=true;await writeFile(path,JSON.stringify(stamp,null,2)+'\n');
}
console.log('OWNER19_SHARED_RAIL_PREPARED');
