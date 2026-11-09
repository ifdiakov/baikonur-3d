import assert from 'node:assert/strict';import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const read=f=>readFileSync(f,'utf8'),save=(f,fn)=>writeFileSync(f,fn(read(f)));const revision='20261109-owner19-v2';
const dataPath='data/road-edits-authoritative-20261103.json',data=JSON.parse(read(dataPath));
if(data.revision!==revision){
 for(const file of ['src/road-editor.js','src/workshop-road-editor.js'])save(file,s=>{
  s=s.replace('return match?match.clone():new THREE.MeshStandardMaterial','return match?.isMeshStandardMaterial?match.clone():new THREE.MeshStandardMaterial').replace("asphalt:originalMaterial('OSM · единое дорожное полотно',0xadb2b3)","asphalt:originalMaterial('OSM · единое дорожное полотно',0x555751)");
  s=s.replace('const styled=joined.roads.map(r=>({...r,profile:deriveEditedRoadStyle(r,base)}));',"const styled=joined.roads.map(r=>{const profile=deriveEditedRoadStyle(r,base);if(['road-3','road-4','road-8'].includes(r.id)){profile.widthStart=profile.widthEnd=r.width;profile.classId='asphalt';profile.startY=r.points[0][1];profile.endY=r.points.at(-1)[1];}return {...r,profile};});");
  s=s.replace('    Object.assign(state,reconcileRoadEdits(local,baselineData));',`    if(baselineData.revision==='${revision}'){
     const backup=ROAD_EDITOR_STORAGE+'-before-owner19-v2';if(!localStorage.getItem(backup))localStorage.setItem(backup,saved);
     const corrected=new Map(baselineData.added.filter(r=>['road-3','road-4','road-8'].includes(r.id)).map(r=>[r.id,r]));
     local.added=local.added.map(r=>corrected.has(r.id)?structuredClone(corrected.get(r.id)):r);
     local.hidden=local.hidden.filter(r=>!/(?:^|-)(172571885|172571880)(?:-|$)/.test(r.sourceId));
    }
    Object.assign(state,reconcileRoadEdits(local,baselineData));`);return s;
 });
 save('src/road-editor-mesh.js',s=>s.replace('if(!owner)continue;',"if(!owner)continue;\n  if(['road-3','road-4','road-8'].includes(owner.id))continue; // Shared-axis butt joins, no protruding discs."));
 save('src/osm-transport.js',s=>{
  const a=s.indexOf(' // Tight, owner-verified AD junctions:'),b=s.indexOf(' // Exactly one Gagarin road',a);assert(a>=0&&b>a);s=s.slice(0,a)+s.slice(b);
  s="import {applyOwnerRampOwnership} from './owner19-surface-ownership.js';\n"+s;
  s=s.replace('omitOwnerRoadEdge,polishOwnerRoadSamples','omitOwnerRoadEdge,polishOwnerRoadSamples,keepOwnerTownRoadEdge').replace('polishOwnerRoadSamples,omitOwnerRoadEdge','polishOwnerRoadSamples,omitOwnerRoadEdge,keepOwnerTownRoadEdge');
  s=s.replace('const edgeKept=(graph,e)=>!(graph===roadGraph?', 'const edgeKept=(graph,e)=>graph===roadGraph&&keepOwnerTownRoadEdge(e)||!(graph===roadGraph?');
  s=s.replace('clipOrdinaryRoadMeshes([shoulder.mesh],asphalt.mesh,[],{onlyProtruding:true});','clipOrdinaryRoadMeshes([shoulder.mesh],asphalt.mesh,[],{onlyProtruding:true});\n applyOwnerRampOwnership(asphalt.mesh,unpaved.mesh,shoulder.mesh);');
  s=s.replace('if(missingOwnerRailSeam(', 'if(false&&missingOwnerRailSeam(').replace('import {shapeOwnerRail,','import {shapeOwnerRail,shapeOwnerTrain,');
  s=s.replace('conformRailPath(roundRailCorners([...connectionPoints,...graphRailRoutePoints(graphTrain).slice(1)],{radius:15}),RAIL_PROFILE.ballastWidth)', 'conformRailPath(shapeOwnerTrain(roundRailCorners([...connectionPoints,...graphRailRoutePoints(graphTrain).slice(1)],{radius:15})),RAIL_PROFILE.ballastWidth)');
  s=s.replace(' function railMasked(p,margin=0){',` function ownerMainlineCorridor(p){
  const x=p.x/3.4+650,y=p.z/3.4+522.5,dx=8.4,dy=-8.1,t=((x-579)*dx+(y-389)*dy)/(dx*dx+dy*dy);
  return t>-.15&&t<1.15&&Math.abs((x-579)*dy-(y-389)*dx)/Math.hypot(dx,dy)<.9;
 }
 function railMasked(p,margin=0){`);
  return s.replace('   if(railFootprintSites.has(id))continue;',"   if(railFootprintSites.has(id)||(['pad-112','pad-112a'].includes(id)&&ownerMainlineCorridor(p)))continue;");
 });
 save('src/site113.js',s=>{const a=s.indexOf(' // Owner correction:'),b=s.indexOf(' for(const [u,v,w,d]of [[919',a);assert(a>=0&&b>a);return s.slice(0,a)+" // Streets are drawn once by the shared transport network.\n for(const road of SITE113_PATHS)k.path(road.map(P),1.1,.15,'soil','site113-footpath');\n"+s.slice(b)});
 save('src/site113-road-grade.js',s=>s.replace('roadY=baseY+.025','roadY=baseY+.08'));
 save('src/site110.js',s=>s.replace(',[-260,350,27,87,5]','').replace(' const features=k.finish();'," root.userData.owner19BuildingClearance={map:[589,342.7],removedLocal:[-260,350],retainedTechnicalBuildings:buildings.length};\n const features=k.finish();"));
 save('src/ukss-connections.js',s=>s.replaceAll('0x5b5b51','0x555751').replaceAll('0xa4987c','0xc5c1b4').replaceAll('()=>2.2/scale','()=>3.1/scale').replaceAll('()=>1.8/scale','()=>2.5/scale').replaceAll('width:1.8/scale','width:2.5/scale'));
 save('src/transport-bake.js',s=>{
  s=s.replace("['id','label','width','source',","['id','sourceWayId','abandoned','label','width','source',").replace("cacheKind:'routes-only',","cacheKind:'routes-only',ownerRevision:'20261109-owner19-v2',");
  s=s.replace(' const paths=unpack(bake.roads,roadGrade).map(trimPhantomSpur)'," const polished=bake.ownerRevision==='20261109-owner19-v2';\n const applyRoad=(points,id)=>polished?points:polishCachedOwnerAd(points,id);\n const applyRail=(points,id)=>polished?points:shapeOwnerRail(points,id);\n const paths=unpack(bake.roads,roadGrade).map(trimPhantomSpur)");
  return s.replaceAll('polishCachedOwnerAd(path.points,path.id)','applyRoad(path.points,path.id)').replaceAll('shapeOwnerRail(path.points,path.id??path.sourceWayId)','applyRail(path.points,path.id??path.sourceWayId)');
 });
 save('src/road-lod.js',s=>s.replace("roadGrade=null,kind='roads'){","roadGrade=null,kind='roads',polished=false){").replace('path=polishCachedOwnerAd(path,row.id);','if(!polished)path=polishCachedOwnerAd(path,row.id);').replace('}else path=shapeOwnerRail(path,row.id);','}else if(!polished)path=shapeOwnerRail(path,row.id);').replace("kind==='roads'?roadGrade:null,kind);","kind==='roads'?roadGrade:null,kind,data.ownerRevision==='20261109-owner19-v2');"));
 save('scripts/build-authoritative-road-lod.mjs',s=>s.replace("projection:'world-xz',sourceFingerprint:","projection:'world-xz',ownerRevision:bake.ownerRevision??null,sourceFingerprint:"));
 const world=(x,y,h=.72)=>[Math.round((x-650)*3.4*1e6)/1e6,h,Math.round((y-522.5)*3.4*1e6)/1e6];
 const cubic=(a,b,c,d,n)=>Array.from({length:n+1},(_,i)=>{const t=i/n,u=1-t;return a.map((v,k)=>u*u*u*v+3*u*u*t*b[k]+3*u*t*t*c[k]+t*t*t*d[k]);});
 const norm=(x,y)=>{const n=Math.hypot(x,y);return[x/n,y/n]};
 const J1=[605.5257048787578,424.2832673926141],J2=[612.3725266049311,414.2485101442837],J3=[589.414,377.006];
 const A=world(...J1),B=world(...J2),[dx,dz]=norm(.409,-.338),[ex,ez]=norm(3.84,-7.30);
 const line=cubic(A,[A[0]+dx*6,.72,A[2]+dz*6],[B[0]-ex*6,.72,B[2]-ez*6],B,32),end=world(620.95,402.4,-2.65),bend=world(617.8,405.45,-1.75);
 line.push(...cubic(B,[B[0]+5,.72,B[2]-9],[bend[0]-3,-1.35,bend[2]+4.5],bend,28).slice(1),...cubic(bend,world(619.10,403.2,-2.30),world(619.9,402.4,-2.65),end,20).slice(1));
 for(const r of data.added){if(r.id==='road-3'){r.points=line;r.width=3.2}if(r.id==='road-4'){r.points=[r.points[0],end];r.width=3.2}if(r.id==='road-8'){const p=r.points[0],q=world(...J3),pre=world(J3[0]+1.4,J3[1]+1.47);r.points=[...cubic(p,[p[0]-7,-2.71,p[2]-7.4],[pre[0]+4,.72,pre[2]+4.2],pre,24),q];r.width=3.1}}
 data.hidden=data.hidden.filter(h=>!/(?:^|-)(172571885|172571880)(?:-|$)/.test(h.sourceId));data.revision=revision;writeFileSync(dataPath,JSON.stringify(data)+'\n');
}
await import('./prepare-owner19-release.mjs');
const heading='## 2026-11-09 · Повторная приёмка 19 координатных правок';
if(!read('PROJECT_CONTEXT.md').includes(heading))appendFileSync('PROJECT_CONTEXT.md','\n\n'+heading+'\nИсправлены общие стыки АД 605.7/424.2, 612.5/414.1, 589.8/377.1 и поворот620/402.8; единая асфальтовая палитра вместо временного Basic-материала. Удалены старые маски дорог585/402.6 и580.2/404. Участок559/406 отделён от ЖД плавным смещением АД; тупик558 и фрагменты568/420 и560.8/384.5 исключены. Для113 восстановлены11 существующих улиц вместо линий сквозь дома. ПоворотыЖД605и538 формируются кривыми; ход579–587 непрерывен через исправленную локальную маску112А без второго наложенного пути. Съезды538.7/440.9 и543.4/446.2 объединены в неперекрывающиеся поверхности. Один низкий корпус110 под АД589/342.7 удалён при построении, остальные7 сохранены. ПодъездУКСС согласован с шириной2.5. Смещения204 на10запад и202 на5север уже имелись и НЕ применяются повторно.\nКеши и LOD пересобираются из исправленных источников, повторное смещение исправленного кеша запрещено. Мотовоз использует ту же геометрию основной линии. Для старых локальных черновиков мастерской сохраняется резервная копия; обновляются толькоroad-3/4/8 и две удалённые маски. Оформление, туман, свет, модели ракет/шатров, реконструкции и меню не упрощаются.\nПроверки: tests/owner19-source.mjs(19пунктов), tests/owner19-browser.mjs(сцена, наложения съездов, улицы113, редактор, ракурсы). Публикация подтверждается только публичным прогоном и хешами. Тени/факел «Энергия—Полюс» этой задачей не исправлялись.\n');
console.log('OWNER19_SOURCE_APPLIED');
