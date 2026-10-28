// User-approved correction: half scale; TUA at the opposite (NE) end;
// centre the hall on the actual 112 footprint in the supplied historical plan.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>readFileSync(p,'utf8'),write=(p,s)=>writeFileSync(p,s);
const VERSION='1.2-plan-aligned-ne', MAP=[640,361];
function change(s,a,b){assert.ok(s.includes(a),'Missing layout anchor: '+a.slice(0,100));return s.replace(a,b);}
let m=read('src/mik112.js');
if(!m.includes(VERSION)){
 m=change(m,"version:'1.1-clean-feeder',scale:.28,yaw:-Math.PI/4",`version:'${VERSION}',scale:.14,yaw:-Math.PI/4`);
 m=change(m," box(196,.28,35,0,floor-.14,138,'concrete','front-apron');",` // The Soyuz low-hall doors remain at the SW end. Energia/TUA gates face NE.
 box(88,.28,35,54,floor-.14,138,'concrete','front-apron');
 box(114,.28,35,-39,floor-.14,-138,'concrete','high-hall-apron');`);
 m=change(m,"box(114,.28,102,-39,floor-.14,202,'concrete','transporter-apron');","box(114,.28,102,-39,floor-.14,-202,'concrete','transporter-apron');");
 m=change(m,"box(108,60,1.8,-40,floor+30,-120,'wall','high-rearwall');","box(108,60,1.8,-40,floor+30,120,'wall','high-rearwall');");
 m=change(m,'  const dw=w-7,dh=h-6;','  const dw=w-7,dh=h-6,face=h===60?-1:1;');
 for(const [a,b] of [
  ["floor+h/2,120,'wall','door-pier'","floor+h/2,face*120,'wall','door-pier'"],
  ["floor+h-3,120,'wall','door-lintel'","floor+h-3,face*120,'wall','door-lintel'"],
  ["floor+dh/2,121,'steel','closed-sliding-door'","floor+dh/2,face*121,'steel','closed-sliding-door'"],
  ["floor+dh/2,121.65,'seam','door-rib'","floor+dh/2,face*121.65,'seam','door-rib'"],
  ["floor+y,121.7,'seam','door-horizontal-seam'","floor+y,face*121.7,'seam','door-horizontal-seam'"],
  ["[-67,-137,32,30,9]","[-113,-92,32,30,9]"],
  ["p.position.set(cx,0,cz);p.name=","p.position.set(cx,0,cz);p.rotation.y=Math.PI;p.name="],
  ["grasshopper(-71,183,1);grasshopper(-19,183,2);","grasshopper(-71,-183,1);grasshopper(-19,-183,2);"],
  ["railEntries.push([x,4.25,258]);","railEntries.push([x,4.17,-258.5]);"],
  ["x+side*.76,4.17,132,'rail','transporter-running-rail'","x+side*.76,4.17,-132,'rail','transporter-running-rail'"],
  ["for(let z=9;z<259;z+=2.4)","for(let z=-257;z<-8;z+=2.4)"],
  ["focusTarget:V(-8,22,55),focusOffset:V(330,250,400)","focusTarget:V(-8,22,-40),focusOffset:V(330,250,-400)"],
  ["./mik112-rail.js?v=clean-west-v2","./mik112-rail.js?v=plan-ne-v3"]
 ])m=change(m,a,b);
 m=change(m,' // Finalise a few GPU batches instead of thousands of draw calls.',` // Shallow ramp from the shared road (world y=.72) into the low-hall apron.
 const rampGeo=new THREE.BufferGeometry();
 rampGeo.setAttribute('position',new THREE.Float32BufferAttribute([
  96,2.6,141,122,.72/MIK112.scale,141,96,2.6,169,122,.72/MIK112.scale,169
 ],3));rampGeo.setIndex([0,2,1,1,2,3]);rampGeo.computeVertexNormals();
 mesh(rampGeo,'asphalt',0,0,0,'service-entry-ramp');
 // Finalise a few GPU batches instead of thousands of draw calls.`);
 m=change(m,' setYear(year);root.userData.mik112Model=info;',` // Expose measured transforms for browser geometry tests, not just labels.
 root.updateWorldMatrix(true,true);
 info.layout={scale:root.scale.toArray(),yaw:root.rotation.y,
   centerWorld:root.getWorldPosition(V(0,0,0)).toArray(),
   transporterLocal:machines.children.map(o=>o.position.toArray()),
   transporterWorld:machines.children.map(o=>o.getWorldPosition(V(0,0,0)).toArray()),
   highDoorEndZ:-120,lowDoorEndZ:120,transporterSide:'north-east',
   hallCorners:[[-94,-120],[94,-120],[94,120],[-94,120]].map(([x,z])=>root.localToWorld(V(x,0,z)).toArray()),
   source:'original-plan-3993x3208; hall centre approximately (640,361) in 1300x1045 map space'};
 info.suppressedFallbackGeometry=[];
 setYear(year);root.userData.mik112Model=info;`);
 write('src/mik112.js',m);
}
let rail=read('src/mik112-rail.js');
if(!rail.includes('ne-end-halfscale-v3')){
 rail=change(rail,"const V=(x,y,z)=>new THREE.Vector3(x,y,z),SCALE=.28;","const V=(x,y,z)=>new THREE.Vector3(x,y,z);");
 rail=change(rail,' root.updateWorldMatrix(true,true);',' root.updateWorldMatrix(true,true);\n const SCALE=root.getWorldScale(V(0,0,0)).x;');
 rail=change(rail,'V(-45,4.25,340)','V(-45,4.17,-340)');
 rail=change(rail,'const forward=V(0,0,1)','const forward=V(0,0,-1)');
 rail=change(rail,"group.name='МИК112 · веер и западное примыкание'","group.name='МИК112 · северо-восточный веер и примыкание'");
 rail=change(rail,' for(const x of [-82.4,-59.6,-30.4,-7.6]){\n  const start=root.localToWorld(V(x,4.25,258));',` for(const entry of root.userData.mik112Model.railEntries){
  const start=root.localToWorld(V(...entry));`);
 rail=change(rail,'draw(fan,.76*SCALE,mainGauge);','draw(fan,.76*SCALE,mainGauge);');
 rail=change(rail,'reports.push({start:start.toArray(),end:join.toArray(),throat:throat.toArray(),junctionGap:0});',`reports.push({start:start.toArray(),end:join.toArray(),throat:throat.toArray(),
   localEntry:entry,localStart:root.worldToLocal(start.clone()).toArray(),
   junctionGap:fan.getPoint(1).distanceTo(stem.getPoint(0)),
   curveSamples:Array.from({length:41},(_,i)=>fan.getPoint(i/40).toArray())});`);
 rail=change(rail,"version:'clean-western-trunk-v2',joinGap:0,railGauge:mainGauge*2,stemLength:stem.getLength()",`version:'ne-end-halfscale-v3',joinGap:stem.getPoint(1).distanceTo(join),railGauge:mainGauge*2,stemLength:stem.getLength(),
  stemSamples:Array.from({length:81},(_,i)=>stem.getPoint(i/80).toArray())`);
 write('src/mik112-rail.js',rail);
}
let h=read('index.html');
if(!h.includes('MIK112_LAYOUT_NE_V3')){
 h=h.replace(/(\.\/src\/mik112\.js\?v=)[^']+/, '$1112-layout-ne-v3');
 const begin=h.indexOf(' // MIK112_PLACEHOLDER_OCCLUSION:');
 const end=h.indexOf("  group.userData.mik112Model.suppressedFallbackGeometry=['pad-2b'];",begin);
 assert.ok(begin>=0&&end>=begin);
 const stop=h.indexOf('\n }',end)+3;
 h=h.slice(0,begin)+` // MIK112_PLACEHOLDER_OCCLUSION: no fallback hidden at the corrected site.
 // MIK112_LAYOUT_NE_V3: separate 112 from 2B and 112A; preserve their geometry.
 group.userData.mik112Model.suppressedFallbackGeometry=[];
`+h.slice(stop);
 h=change(h,"view==='tua'?new THREE.Vector3(-45,18,183)","view==='tua'?new THREE.Vector3(-45,18,-183)");
 h=change(h,"view==='tua'?new THREE.Vector3(108,76,133)","view==='tua'?new THREE.Vector3(108,76,-133)");
 // Include render transform/rail geometry in QA so tests inspect the scene itself.
 h=change(h,'tracks:mik112Rail.tracks}:null','tracks:mik112Rail.tracks,stemSamples:mik112Rail.stemSamples,joinGap:mik112Rail.joinGap,version:mik112Rail.version}:null');
 write('index.html',h);
}
const catalog=JSON.parse(read('data/catalog.json'));
const site=catalog.sites.find(s=>s.id==='pad-112');assert.ok(site);
site.x=MAP[0];site.y=MAP[1];site.positionVerified=false;
site.positionBasis='digitised-original-plan-MIK112-footprint';
site.mapPlacement={source:'original-plan-3993x3208',mapSize:[1300,1045],centre:MAP,
  confidence:'schematic alignment, not surveyed geolocation',transporterSide:'north-east',displayScale:.14};
site.note='МИК установлен на контуре площадки №112 исходной схемы, а не на площадке 2Б. Комплекс уменьшен вдвое; «Кузнечики», ворота высоких пролётов и пути вынесены к северо-восточному торцу. Привязка к исторической схеме ориентировочная, не геодезическая. Площадки 112А и 2Б сохранены отдельно.';
write('data/catalog.json',JSON.stringify(catalog,null,2)+'\n');
// Replace the generic driveway that used to run into the centre of the hall.
const network=JSON.parse(read('data/transport-network.json'));
network.facilityDriveways=network.facilityDriveways.filter(n=>String(n)!=='112');
network.routes.road=network.routes.road.filter(r=>r.id!=='r-site112-mik-access');
network.routes.road.push({id:'r-site112-mik-access',class:'service',
 points:[[659,370],[653,373],[646,374],[640.727,370.753],[639.039,369.065]],
 confidence:'schematic driveway terminates outside the low-hall SW service yard; not a surveyed trace'});
write('data/transport-network.json',JSON.stringify(network,null,2)+'\n');
let test=read('tests/mik112-browser.mjs');
test=test.replaceAll("'1.1-clean-feeder'",`'${VERSION}'`).replaceAll("'mik112-photo-v1.1'","'mik112-layout-ne-v3'");
test=test.replace('assert.deepEqual(s.mik112Placement,[680,331]);','assert.deepEqual(s.mik112Placement,[640,361]);');
test=test.replace("assert.deepEqual(s.mik112.suppressedFallbackGeometry,['pad-2b']);","assert.deepEqual(s.mik112.suppressedFallbackGeometry,[]);");
if(!test.includes('MIK112_LAYOUT_GEOMETRY_ASSERTIONS')){
 test=change(test,"assert.ok(s.shadersValid,'Custom surface materials compile');",`// MIK112_LAYOUT_GEOMETRY_ASSERTIONS: numerical checks of the rendered transforms.
 const lay=s.mik112.layout;
 assert.deepEqual(lay.scale,[.14,.14,.14]);assert.equal(lay.yaw,-Math.PI/4);
 assert.equal(lay.highDoorEndZ,-120);assert.equal(lay.lowDoorEndZ,120);
 assert.equal(lay.transporterSide,'north-east');
 for(const c of lay.transporterLocal)assert.ok(c[2]<-150,'TUA must stand beyond opposite end, not inside hall');
 for(const c of lay.transporterWorld){
  assert.ok(c[0]>lay.centerWorld[0]&&c[2]<lay.centerWorld[2],'TUA must be NE of the hall on the museum map');
 }
 const rootX=(640-650)*3.4,rootZ=(361-522.5)*3.4;
 assert.ok(Math.hypot(lay.centerWorld[0]-rootX,lay.centerWorld[2]-rootZ)<1e-7);
 for(const r of s.mik112Rail.tracks){
  assert.ok(r.localStart[2]<-258&&r.junctionGap<1e-7);
  assert.ok(Math.hypot(...r.localStart.map((v,i)=>v-r.localEntry[i]))<1e-6);
 }
 assert.equal(s.mik112Rail.version,'ne-end-halfscale-v3');
 assert.ok(s.mik112Rail.joinGap<1e-7);
 // An approach spline may not cross through the assembly building.
 const cs=Math.cos(lay.yaw),sn=Math.sin(lay.yaw),inverse=p=>{
  const dx=p[0]-rootX,dz=p[2]-rootZ;
  return [(cs*dx-sn*dz)/.14,(sn*dx+cs*dz)/.14];
 };
 for(const p of [...s.mik112Rail.stemSamples,...s.mik112Rail.tracks.flatMap(r=>r.curveSamples)]){
  const [x,z]=inverse(p);assert.ok(!(x>-97&&x<97&&z>-123&&z<123),'Railway must not cross the hall walls');
 }
 assert.ok(s.shadersValid,'Custom surface materials compile');`);
 test=change(test,"await page.screenshot({path:`qa-mik112/${prefix}-plan.png`});",`await page.screenshot({path:\`qa-mik112/\${prefix}-plan.png\`});
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(95,'pad-112'));
 await page.waitForTimeout(400);
 await page.screenshot({path:\`qa-mik112/\${prefix}-map-placement.png\`});`);
}
write('tests/mik112-browser.mjs',test);
mkdirSync('/tmp/mik112-check',{recursive:true});
write('/tmp/mik112-check/main.mjs',h.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
console.log('MIK112_LAYOUT_NE_V3',JSON.stringify({version:VERSION,scale:.14,centre:MAP,transporterEnd:'north-east',adjacentSitesUnchanged:true}));
