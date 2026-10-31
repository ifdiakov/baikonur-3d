import * as THREE from 'three';
import {RAIL_PROFILE} from './gagarin-rail-approach.js?v=20261031-rocket-exhibits-v1';
import {createSurfacePalette} from './surface-materials.js';
import {applyMik112PhotoFinishes} from './mik112-materials.js?v=20261031-rocket-exhibits-v1';

// Site 112, NOT the neighbouring MZK/SDI at 112A. Photo-interpreted exterior.
// Sources: RocketTrip Drive 1XTQD9tVRTeWIUVF-uzdAMIXLXh5SuVTk (MIK),
// 1y-yzVIkCtzPMEaksDM70qWyD8K8PZnE3 (two Energia transporter/erectors).
// Recognisable proportions and photo layout, not a measured engineering model.
export const MIK112={version:'2.0-metric-photo-surfaces',scale:.14,yaw:-Math.PI/4,roofCollapseYear:2002,units:'metres',
 dimensions:{length:240,width:190,high:{length:240,width:120,height:56,bays:3},low:{length:240,width:70,height:30,bays:2}},
 dimensionsSource:'https://www.buran.ru/htm/foto7.htm'};
export const TUA_ROCKET_MOUNT=Object.freeze({position:[0,15.3603466749,-26.0709070005],rotation:[Math.PI/2,0,0],units:'metres',source:'Recovered source payload centre axis and aft datum'});
export const MIK112_HALL_ROCKET_MOUNT=Object.freeze({position:[-35,15.3603466749,-35],rotation:[Math.PI/2,0,0],units:'metres',bay:4,clearWidth:38,clearLength:230,description:'Museum exhibit in the middle high bay; rocket +Y follows hall +Z, orbiter stays above the core'});
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
export function buildMik112(root,{year=2026}={}){
 root.name='Пл. №112 · МИК и два ТУА «Кузнечики»';
 const palette=createSurfacePalette(root,{
  wall:0xd6cfb9,concrete:0xa6a397,seam:0x989487,roof:0x75868a,
  whiteRoof:0xd5dad2,steel:0x7f8c88,dark:0x333e3b,rust:0x82573c,
  yellow:0xbca36d,glass:0x536b58,doorMetal:0xa3aaa0,rail:0x6e7774,asphalt:0x726e60
 },{wall:'concrete',concrete:'concrete',seam:'concrete',roof:'sheet',whiteRoof:'sheet',
  steel:'paint',doorMetal:'sheet',dark:'metal',rust:'rust',yellow:'paint',rail:'metal'},
 {glass:{roughness:.42,metalness:.12}});
 applyMik112PhotoFinishes(palette,root);
 const mat=palette;
 const boxGeo=new THREE.BoxGeometry(1,1,1),rodGeo=new THREE.CylinderGeometry(1,1,1,7);
 const batches=new Map(),counts={},all=[];
 const intact=new THREE.Group(),ruins=new THREE.Group(),machines=new THREE.Group(),transporterRails=new THREE.Group();
 intact.name='МИК · историческая кровля';ruins.name='МИК · раскрытые разрушенные пролёты';
 machines.name='Два транспортно-установочных агрегата';
 transporterRails.name='МИК · пути транспортных агрегатов';transporterRails.userData.museumComponent='tua-running-rails';
 root.add(intact,ruins,machines,transporterRails);
 function count(tag){counts[tag]=(counts[tag]||0)+1;}
 function instance(geo,m,p,q,scale,tag,parent=root){
  const key=parent.uuid+':'+m+':'+geo.uuid;let batch=batches.get(key);
  if(!batch){batch={geo,m,parent,transforms:[]};batches.set(key,batch);}
  batch.transforms.push(new THREE.Matrix4().compose(p,q,scale));count(tag);
 }
 const Q=new THREE.Quaternion();
 function box(w,h,d,x,y,z,m,tag,parent=root){instance(boxGeo,m,V(x,y,z),Q,V(w,h,d),tag,parent);}
 function beam(a,b,w,d,m,tag,parent=root){
  const p=new THREE.Vector3(...a),dir=new THREE.Vector3(...b).sub(p),len=dir.length();
  if(len<.001)return;const q=new THREE.Quaternion().setFromUnitVectors(V(0,1,0),dir.clone().normalize());
  instance(boxGeo,m,p.addScaledVector(dir,.5),q,V(w,len,d),tag,parent);
 }
 function rod(a,b,r,m,tag,parent=root){
  const p=new THREE.Vector3(...a),dir=new THREE.Vector3(...b).sub(p),len=dir.length();
  if(len<.001)return;const q=new THREE.Quaternion().setFromUnitVectors(V(0,1,0),dir.clone().normalize());
  instance(rodGeo,m,p.addScaledVector(dir,.5),q,V(r,len,r),tag,parent);
 }
 function mesh(geo,m,x,y,z,tag,parent=root){
  const obj=new THREE.Mesh(geo,mat[m]);obj.position.set(x,y,z);obj.receiveShadow=true;
  obj.name=tag;obj.userData.museumComponent=tag;parent.add(obj);all.push(obj);count(tag);return obj;
 }
 function railing(a,b,height=1.2,parent=root){
  rod([a[0],a[1]+height,a[2]],[b[0],b[1]+height,b[2]],.055,'steel','guardrail',parent);
  rod([a[0],a[1]+height*.5,a[2]],[b[0],b[1]+height*.5,b[2]],.045,'steel','guardrail',parent);
  const len=Math.hypot(b[0]-a[0],b[2]-a[2]),n=Math.max(1,Math.ceil(len/2.8));
  for(let i=0;i<=n;i++){const t=i/n,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;
   rod([x,a[1],z],[x,a[1]+height,z],.05,'steel','rail-post',parent);}
 }
 // Building: three high assembly bays + two lower retained bays, separate annexes.
 // The floor is a set of low aprons, never a town-sized raised pedestal.
 const floor=2.6;
 box(190,.6,240,0,floor-.3,0,'concrete','hall-floor');
 // The finished slab occludes schematic map paint beneath the real hall.
 box(190,.9,240,0,floor+.45,0,'concrete','mik-floor-finish');
 // The Soyuz low-hall doors remain at the SW end. Energia/TUA gates face NE.
 box(72,.28,35,60,floor-.14,138,'concrete','front-apron');
 box(122,.28,35,-35,floor-.14,-138,'concrete','high-hall-apron');
 box(122,.28,102,-35,floor-.14,-202,'concrete','transporter-apron');
 // Side and rear envelope. The northwestern high roof is missing in the recent photos.
 box(1.8,56,240,-94.1,floor+28,0,'wall','high-sidewall');
 box(1.6,56,240,24.2,floor+28,0,'wall','high-divider');
 box(120,56,1.8,-35,floor+28,119.1,'wall','high-rearwall');
 box(1.6,30,240,94.2,floor+15,0,'wall','low-sidewall');
 box(70,30,1.6,60,floor+15,-119.2,'wall','low-rearwall');
 // Five individually panelled front door assemblies.
 for(const [cx,w,h,opening] of [[-75,40,56,false],[-35,40,56,false],[5,40,56,false],[42.5,35,30,true],[77.5,35,30,false]]){
  const dw=w-7,dh=h-6,face=h===56?-1:1;
  for(const side of [-1,1])box(3.5,h,2,cx+side*(w/2-1.75),floor+h/2,face*119,'wall','door-pier');
  box(w,6,2,cx,floor+h-3,face*119,'wall','door-lintel');
  if(opening){
   // A recessed doorway with visible crane girders, not a rocket pasted on the facade.
   box(dw,dh,1,cx,floor+dh/2,106,'dark','open-door-interior');
   box(dw*.46,dh,1,cx+dw*.27,floor+dh/2,119.5,'doorMetal','sliding-door-leaf');
   box(dw-3,1,2,cx,floor+dh-3,111,'yellow','overhead-crane');
  }else box(dw,dh,1,cx,floor+dh/2,face*119.3,'doorMetal','closed-sliding-door');
  for(let x=cx-dw/2;x<cx+dw/2+.1;x+=2.1)box(.16,dh,.23,x,floor+dh/2,face*119.95,'seam','door-rib');
  for(let y=8;y<dh;y+=5.8)box(dw,.18,.22,cx,floor+y,face*119.98,'seam','door-horizontal-seam');
 }
 // Precast panel rhythm and narrow green-grey glazing bands from the ground photos.
 for(let z=-114;z<=114;z+=12){
  for(const [x,h] of [[-95.05,56],[95.05,30]]){
   box(.28,h,.2,x,floor+h/2,z,'seam','vertical-panel-joint');
   box(.34,4.1,9.8,x,floor+6,z,'glass','side-window');
  }
 }
 for(let y=5;y<56;y+=3.3)box(.25,.1,240,-95.1,floor+y,0,'seam','horizontal-panel-joint');
 for(let y=5;y<30;y+=3.3)box(.25,.1,240,95.1,floor+y,0,'seam','horizontal-panel-joint');
 // Low roof: light strip next to the tall hall and weathered dark outer sheet roof.
 box(25,.8,240,37.5,floor+29.6,0,'whiteRoof','retained-light-roof');
 box(45,.8,240,72.5,floor+29.6,0,'roof','retained-dark-roof');
 for(let x=26;x<=94;x+=2.7)box(.12,.10,239,x,floor+30.03,0,'seam','roof-sheet-rib');
 for(let z=-110;z<=110;z+=22)box(68,.10,.18,60,floor+30.03,z,'seam','roof-seam');
 // Narrow glazed raised volume visible in the approach photograph.
 box(11,12,226,29,floor+36,-4,'wall','clerestory');
 for(let z=-108;z<108;z+=8)box(.2,7,6.8,34.6,floor+37,z,'glass','clerestory-window');
 box(12,.65,228,29,floor+42.3,-4,'whiteRoof','clerestory-cap');
 // Taller striped stair tower and low service wings.
 box(9,46,10,33,floor+23,110,'wall','stair-tower');
 for(let y=8;y<44;y+=6)box(9.25,2.4,10.2,33,floor+y,110,'glass','tower-glass-belt');
 for(const [x,z,w,d,h] of [[120,-95,52,27,12],[115,57,42,63,9],[65,144,62,18,10],[-113,-92,32,30,9]]){
  box(w,h,d,x,floor+h/2,z,'wall','service-wing');box(w+1,.6,d+1,x,floor+h+.3,z,'roof','service-roof');
  for(let xx=x-w/2+4;xx<x+w/2;xx+=5.5)box(3,2,.18,xx,floor+h*.6,z+d/2+.12,'glass','annex-window');
 }
 // High-bay structural skeleton, exposed from above in the current state.
 for(let z=-114;z<=114;z+=19){
  for(const x of [-93.7,24])beam([x,floor,z],[x,floor+52,z],1,1,'steel','wall-attached-column');
  for(const x of [-55,-15])beam([x,floor,z],[x,floor+52,z],1,1,'steel','historical-internal-column',intact);
  for(const cx of [-75,-35,5]){
   beam([cx-19,floor+52,z],[cx+19,floor+52,z],.48,.48,'steel','high-roof-truss',intact);
   beam([cx-19,floor+55.2,z],[cx+19,floor+55.2,z],.48,.48,'steel','high-roof-truss',intact);
   for(let k=0;k<6;k++)beam([cx-19+k*38/6,floor+52,z],[cx-19+(k+1)*38/6,floor+(k%2?52:55.2),z],.28,.28,'steel','truss-web',intact);
   // Broken remnants follow a reproducible, deliberately irregular fracture pattern.
   if((z<-74||z>83||Math.abs(z)<10)&&!(cx===-35&&Math.abs(z)<60)){
    beam([cx-19,floor+1.8,z],[cx+10,floor+3.7+Math.abs(z%3),z+3],.52,.52,'rust','fallen-roof-frame',ruins);
    beam([cx+10,floor+3.7+Math.abs(z%3),z+3],[cx+19,floor+2.1,z],.45,.45,'steel','broken-frame-tip',ruins);
   }
  }
 }
 for(const cx of [-75,-35,5])box(39.4,.8,240,cx,floor+55.6,0,'roof','historical-roof-panel',intact);
 for(let k=0;k<42;k++){
  const x=-88+(k*37%107),z=-106+(k*53%214),h=.5+(k%4)*.22;
  if(x>-50&&x<-20&&z>-44&&z<38)continue;
  const o=mesh(new THREE.BoxGeometry(5+k%7,h,3+k%9),'concrete',x,floor+1.2+k%3,z,'roof-debris',ruins);
  o.rotation.set(.12*(k%3),k*1.67,.16*(k%4));
 }
 // A steel ladder at the building edge.
 for(const x of [-96,-97.2])rod([x,3,115],[x,58,115],.12,'steel','external-ladder');
 for(let y=4;y<58;y+=.9)rod([-97.2,y,115],[-96,y,115],.08,'steel','ladder-rung');
 // Two simple museum cradles support the horizontal exhibit. These are display
 // furniture, not a reconstruction of a particular historic assembly fixture.
 const cradleShape=new THREE.Shape(),axisY=MIK112_HALL_ROCKET_MOUNT.position[1];
 const arcPoints=(radius,reverse)=>Array.from({length:17},(_,i)=>{
  const angle=Math.PI*(1.25+(reverse?16-i:i)/32);
  return [Math.cos(angle)*radius,axisY+Math.sin(angle)*radius];
 });
 const cradleOutline=[...arcPoints(4.02,false),...arcPoints(4.24,true)];
 cradleShape.moveTo(...cradleOutline[0]);cradleOutline.slice(1).forEach(p=>cradleShape.lineTo(...p));cradleShape.closePath();
 const cradleGeometry=new THREE.ExtrudeGeometry(cradleShape,{depth:2.4,bevelEnabled:false});
 for(const z of [-24,5]){
  box(15,1.1,5,-35,4.15,z,'dark','museum-assembly-cradle-base');
  for(const x of [-36.8,-33.2])box(2.2,7.05,2.4,x,8.225,z,'steel','museum-assembly-cradle-support');
  mesh(cradleGeometry,'yellow',-35,0,z-1.2,'museum-assembly-cradle');
 }
 // Real open holes in the load-bearing cheek plates, rather than dark discs.
 const plateShape=new THREE.Shape();plateShape.moveTo(-1.25,0);plateShape.lineTo(1.25,0);
 plateShape.lineTo(1.1,12);plateShape.quadraticCurveTo(0,14,-1.1,12);plateShape.closePath();
 for(const y of [2.0,4.8,7.6,10.4]){const hole=new THREE.Path();hole.absarc(0,y,.58,0,Math.PI*2,true);plateShape.holes.push(hole);}
 const plateGeo=new THREE.ExtrudeGeometry(plateShape,{depth:.52,bevelEnabled:false,curveSegments:10});
 const wheelGeo=new THREE.CylinderGeometry(.88,.88,.42,12);
 function plate(x,y,z,rot,m,parent,tag){const o=mesh(plateGeo,m,x,y,z,tag,parent);o.rotation.x=rot;o.rotation.y=Math.PI/2;return o;}
 function grasshopper(cx,cz,index){
  const p=new THREE.Group();p.position.set(cx,0,cz);p.rotation.y=Math.PI;p.name='Кузнечик '+index;p.userData.museumComponent='energia-transporter';machines.add(p);count('energia-transporter');
  // Two widely spaced railway chassis, cross members and a hollow centre.
  for(const side of [-1,1]){
   const x=side*10;
   box(4.2,4.5,56.3,x,8.2,0,'steel','longitudinal-chassis',p);
   box(4.6,.45,57,x,10.7,0,'steel','maintenance-walkway',p);
   for(let z=-26;z<=26;z+=3.3)box(.15,4.5,.22,x+side*2.15,8.2,z,'seam','chassis-panel-rib',p);
   for(const z of [-22,-8,8,22]){
    box(4.5,2.5,7,x,5.7,z,'steel','rail-bogie',p);
    for(const dz of [-2.4,-.8,.8,2.4])for(const wx of [-RAIL_PROFILE.gauge/(2*MIK112.scale),RAIL_PROFILE.gauge/(2*MIK112.scale)]){
     const wheel=mesh(wheelGeo,'dark',x+wx,4.75,z+dz,'bogie-wheel',p);wheel.rotation.z=Math.PI/2;
    }
    box(4.7,.7,6.8,x,7.3,z,'yellow','bogie-bearing',p);
   }
   railing([x+side*2.5,10.9,-28],[x+side*2.5,10.9,28],1.2,p);
   railing([x-side*2.4,10.9,-28],[x-side*2.4,10.9,28],1.2,p);
  }
  for(const z of [-26,-9,9,26])box(29.5,4,2.2,0,10.3,z,'steel','massive-cross-girder',p);
  // Each photographed machine has two long triangular cheek frames and FOUR forks.
  const cheek=new THREE.Shape();cheek.moveTo(27,11);cheek.lineTo(11,32);cheek.lineTo(-27,11);cheek.closePath();
  const opening=new THREE.Path();opening.moveTo(21,15);opening.lineTo(-14,15);opening.lineTo(10.5,27);opening.closePath();cheek.holes.push(opening);
  for(let z=-20;z<=20;z+=6){const hole=new THREE.Path();hole.absarc(-z,12.5,.64,0,Math.PI*2,true);cheek.holes.push(hole);}
  for(const [z,y] of [[-23,15],[-19,20],[-15,25],[-10.5,29.5],[1,23],[11,18]]){const h=new THREE.Path();h.absarc(-z,y,.65,0,Math.PI*2,true);cheek.holes.push(h);}
  const cheekGeo=new THREE.ExtrudeGeometry(cheek,{depth:.65,bevelEnabled:false,curveSegments:12});
  for(const side of [-1,1]){const x=side*10.3;const m=mesh(cheekGeo,'steel',x-side*.3,0,0,'triangular-perforated-cheek',p);m.rotation.y=Math.PI/2;
   for(const [z,base] of [[-11,29],[23,13]]){
    plate(x,base,z,0,'yellow',p,'ochre-perforated-fork');
    rod([x,11,z+3],[x,base+7,z],.58,'yellow','hydraulic-cylinder',p);rod([x,base+7,z],[x,base+12,z],.28,'steel','hydraulic-piston',p);
    const hub=mesh(new THREE.CylinderGeometry(1.15,1.15,1.5,16),'yellow',x,base,z,'hinge-hub',p);hub.rotation.z=Math.PI/2;
    for(const y of [base+2,base+9]){box(4,.25,4,x+side*2,y,z,'yellow','fork-platform',p);railing([x+side*4,y,z-2],[x+side*4,y,z+2],1.1,p);}
    for(const dx of [2.2,3.2])rod([x+side*dx,11,z],[x+side*dx,base+10,z],.09,'yellow','fork-ladder',p);
    for(let y=12;y<base+10;y+=.9)rod([x+side*2.2,y,z],[x+side*3.2,y,z],.06,'yellow','fork-ladder-rung',p);
   }
  }
  for(const [z,y] of [[-11,32],[23,16]]){
   rod([-10.3,y+10,z],[10.3,y+10,z],.45,'yellow','upper-cross-tie',p);
   const v=[],ids=[];for(let i=0;i<=24;i++){const x=-10.3+i*20.6/24,h=y-3+6*(x/10.3)**2;v.push(x,h,z-1.8,x,h,z+1.8);if(i<24){const n=i*2;ids.push(n,n+2,n+1,n+1,n+2,n+3);}}
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setIndex(ids);geo.computeVertexNormals();mat.yellow.side=THREE.DoubleSide;mesh(geo,'yellow',0,0,0,'broad-concave-receiving-cradle',p);
  }
  for(const z of [-27,27]){
   railing([-14.8,12.5,z],[14.8,12.5,z],1.2,p);
   box(6,3.7,2.8,0,7,z,'dark','central-equipment-box',p);
   rod([-12,5.7,z],[12,5.7,z],.32,'steel','lower-cross-pipe',p);
  }
  box(3.4,3.8,4,-13.8,12,-18,'steel','operator-cabin',p);
  box(.12,1.5,2.8,-15.55,12.8,-18,'glass','cab-window',p);
 }
 const beforeTransporterCounts={...counts};
 grasshopper(-71,-183,1);grasshopper(-19,-183,2);
 const transporterFeatureCounts=Object.fromEntries(Object.entries(counts).map(([key,value])=>[key,value-(beforeTransporterCounts[key]||0)]).filter(([,value])=>value));
 // Double railway track under each transporter, aligned with the high doors.
 const railEntries=[];
 for(const cx of [-71,-19])for(const track of [-11.4,11.4]){
  const x=cx+track;railEntries.push([x,4.17,-258.5]);
  for(const side of [-1,1])box(.18,.27,253,x+side*RAIL_PROFILE.gauge/(2*MIK112.scale),4.17,-132,'rail','transporter-running-rail',transporterRails);
  for(let z=-257;z<-8;z+=2.4)box(RAIL_PROFILE.sleeperLength/MIK112.scale,.16,.32,x,3.97,z,'seam','rail-sleeper',transporterRails);
 }
 // Smaller normal-gauge track into the retained assembly hall.
 for(const side of [-1,1])box(.18,.27,220,42.5+side*RAIL_PROFILE.gauge/(2*MIK112.scale),4.17,132,'rail','low-hall-track');
 // Shallow ramp from the shared road (world y=.72) into the low-hall apron.
 const rampGeo=new THREE.BufferGeometry();
 rampGeo.setAttribute('position',new THREE.Float32BufferAttribute([
  96,2.6,141,122,.72/MIK112.scale,141,96,2.6,169,122,.72/MIK112.scale,169
 ],3));rampGeo.setIndex([0,2,1,1,2,3]);rampGeo.computeVertexNormals();
 mesh(rampGeo,'asphalt',0,0,0,'service-entry-ramp');
 // Finalise a few GPU batches instead of thousands of draw calls.
 for(const b of batches.values()){
  const im=new THREE.InstancedMesh(b.geo,mat[b.m],b.transforms.length);
  b.transforms.forEach((m,i)=>im.setMatrixAt(i,m));im.instanceMatrix.needsUpdate=true;
  im.computeBoundingBox();im.computeBoundingSphere();im.receiveShadow=true;
  im.name='МИК112 · '+b.m+' · '+b.transforms.length;im.userData.museumComponent='mik112-instanced-detail';b.parent.add(im);all.push(im);
 }
 const info={version:MIK112.version,siteNumber:112,transporterCount:2,features:counts,physicalUnits:'metres',
  dimensions:MIK112.dimensions,dimensionsSource:MIK112.dimensionsSource,
  noPolePolygons:[
   [[-98,-123],[98,-123],[98,123],[-98,123]],
   [[-98,-256],[28,-256],[28,-121],[-98,-121]],
   [[92,-111],[148,-111],[148,-79],[92,-79]],
   [[91,23],[138,23],[138,91],[91,91]],
   [[32,132],[98,132],[98,156],[32,156]],
   [[-132,-110],[-95,-110],[-95,-74],[-132,-74]]
  ],
  photoFolders:['1XTQD9tVRTeWIUVF-uzdAMIXLXh5SuVTk','1y-yzVIkCtzPMEaksDM70qWyD8K8PZnE3'],
  evidence:'Eleven visually inspected user photos: MIK satellite, facade and doors; TUA front, side, overhead and perforated-fork closeups.',
  accuracy:'Main hall dimensions from the post-collapse commission report; facade, roof condition and annexes interpreted from the inspected photos. Museum rocket mounting is a display, not an operational reconstruction.',
  instancedBatches:batches.size,meshCount:all.length,railEntries,year,
  tua:{version:'mik112-photo-transporter-v1',status:'procedural',instanceCount:2,source:'RocketTrip photo interpretation',error:null}};
 function setYear(y){info.year=y;intact.visible=y<2002;ruins.visible=y>=2002;machines.visible=y>=1986;info.roofState=y<2002?'historical-intact':'photo-ruined';if(info.tua)info.tua.visible=machines.visible;}
 // Expose measured transforms for browser geometry tests, not just labels.
 root.updateWorldMatrix(true,true);
 info.layout={scale:root.scale.toArray(),yaw:root.rotation.y,
   centerWorld:root.getWorldPosition(V(0,0,0)).toArray(),
   transporterLocal:machines.children.map(o=>o.position.toArray()),
   transporterWorld:machines.children.map(o=>o.getWorldPosition(V(0,0,0)).toArray()),
   highDoorEndZ:-120,lowDoorEndZ:120,transporterSide:'north-east',
   hallCorners:[[-95,-120],[95,-120],[95,120],[-95,120]].map(([x,z])=>root.localToWorld(V(x,0,z)).toArray()),
   source:'original-plan-3993x3208; hall centre approximately (640,361) in 1300x1045 map space'};
 info.suppressedFallbackGeometry=[];
 setYear(year);root.userData.mik112Model=info;
 const transporterRoots=[...machines.children];let importedTransporters=false;
 function refreshStats(){
  let meshCount=0,instancedBatches=0;root.traverse(object=>{if(object.isMesh){meshCount++;if(object.isInstancedMesh)instancedBatches++;}});
  info.meshCount=meshCount;info.instancedBatches=instancedBatches;root.updateWorldMatrix(true,true);
  info.layout.transporterLocal=transporterRoots.map(object=>object.position.toArray());
  info.layout.transporterWorld=transporterRoots.map(object=>object.getWorldPosition(V(0,0,0)).toArray());
  info.layout.transporterYaw=transporterRoots.map(object=>object.rotation.y);
  return info;
 }
 function setTuaMetadata(metadata){info.tua={...metadata,visible:machines.visible};return info.tua;}
 // Preserve the two placement containers and their timeline parent. The
 // building, historical roof, aprons and rail connections are their siblings.
 function replaceTransporters(models,placements,metadata){
  if(!Array.isArray(models)||models.length!==2||models.some(model=>!model?.isObject3D||model.parent))throw new Error('Two unattached TUA models are required');
  if(!Array.isArray(placements)||placements.length!==2||placements.some(p=>!Array.isArray(p.position)||p.position.length!==3||!p.position.every(Number.isFinite)||!Number.isFinite(p.rotationY)))throw new Error('Invalid TUA placements');
  if(typeof metadata?.version!=='string')throw new Error('TUA source metadata is required');
  const detached=transporterRoots.flatMap(slot=>[...slot.children]);
  transporterRoots.forEach((slot,i)=>{
   slot.clear();slot.position.fromArray(placements[i].position);slot.rotation.set(0,placements[i].rotationY,0);slot.scale.setScalar(1);slot.add(models[i]);
   slot.userData.museumComponent='energia-transporter';slot.userData.transporterSourceVersion=metadata.version;
  });
  if(!importedTransporters){
   for(const [tag,count]of Object.entries(transporterFeatureCounts)){counts[tag]-=count;if(!counts[tag])delete counts[tag];}
   importedTransporters=true;
  }
  counts['energia-transporter']=2;counts['imported-transporter']=2;
  setTuaMetadata(metadata);info.layout.transporterPlacementBasis='tua-source-manifest';refreshStats();setYear(info.year);info.rocketMounts=rocketMounts();
  // Procedural boxes, rods and materials are shared with the hall. Dispose
  // only detached geometries that no remaining mesh references.
  const retained=new Set(),released=new Set();root.traverse(object=>{if(object.isMesh)retained.add(object.geometry);});
  for(const object of detached)object.traverse(mesh=>{if(mesh.isMesh&&!retained.has(mesh.geometry)&&!released.has(mesh.geometry)){released.add(mesh.geometry);mesh.geometry.dispose();}});
  return info.tua;
 }
 function setRailAdaptation(metadata){
  const {group,...report}=metadata||{};info.railAdaptation=report;
  for(const [tag,key]of [['transporter-running-rail','railCount'],['rail-sleeper','sleeperCount']]){
   if(Number.isInteger(report[key])&&report[key]>=0)counts[tag]=report[key];else delete counts[tag];
  }
  refreshStats();return report;
 }
 function rocketMounts(){
  const mount=new THREE.Vector3(...TUA_ROCKET_MOUNT.position);
  const tua=transporterRoots.map(slot=>{
   slot.updateMatrix();const position=mount.clone().applyMatrix4(slot.matrix).toArray();
   const q=slot.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...TUA_ROCKET_MOUNT.rotation)));
   return {position,quaternion:q.toArray(),units:'metres',source:TUA_ROCKET_MOUNT.source};
  });
  return {hall:{...MIK112_HALL_ROCKET_MOUNT,position:[...MIK112_HALL_ROCKET_MOUNT.position],rotation:[...MIK112_HALL_ROCKET_MOUNT.rotation]},tua};
 }
 info.rocketMounts=rocketMounts();info.columnDisplay={modern:'wall-attached only',historicalInternalColumns:26,modernDetachedColumns:0};
 return {stats:()=>info,setYear,rocketMounts,railEntries,transporterRoots,transportersGroup:machines,transporterRails,replaceTransporters,setTuaMetadata,setRailAdaptation,refreshStats,
  focusTarget:V(-8,22,-40),focusOffset:V(330,250,-400)};
}

// Verified clean western rail connection.
export {connectMik112Rails} from './mik112-rail.js?v=plan-ne-v3';
