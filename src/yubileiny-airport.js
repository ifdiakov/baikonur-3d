import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261031-rocket-exhibits-v1';
import {YUBILEINY_SOURCE_LAYOUT,YUBILEINY_SOURCE_ACCESS} from './yubileiny-layout.js?v=20261031-rocket-exhibits-v1';

export const YUBILEINY_VERSION='yubileiny-source-layout-v1';
export const YUBILEINY_PHYSICAL=Object.freeze({length:4500,width:84,taxiwayWidth:24,connectorWidth:21,
 endSafetyLength:250,physicalToLocal:.5,gradeOffset:.875,runwayY:1.75,
 pua:[625,-1115],puaApronWidth:142,puaApronLength:355});
const P=YUBILEINY_PHYSICAL;
const local=([x,z])=>[x*P.physicalToLocal,z*P.physicalToLocal];
const source=id=>YUBILEINY_SOURCE_LAYOUT.features.find(f=>f.id===id);
const rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];

export function yubileinyDisplaySpec(){
 const lightPaths=[241008147,241008154,241008134,241008138,241008132].map(id=>({sourceId:id,points:source(id).coordinates.map(local)}));
 return {key:'yubileiny',version:YUBILEINY_VERSION,scale:.28,length:2250,width:42,referenceLength:4500,referenceWidth:84,
  physicalToLocal:.5,longitudinalScale:.5,heading:1.948,runwayY:1.75,threshold:1117.5,touchdown:935,papiSetback:150,
  approachLength:480,approachStations:8,apron:local(P.pua),taxiX:226.8,apronWidth:71,apronLength:177.5,apronLightRadius:5,
  physicalDimensions:{runway:[4500,84],mainTaxiwayWidth:24,connectingTaxiwayWidth:21,endSafetyLength:250},
  lightPaths,apronPoleHeight:2.8,
  apronPolePositions:[[548,-1300],[710,-1300],[548,-930],[710,-930],[455,680],[715,680],[455,1150],[715,1150]].map(local),
  runwayClearancePolygon:rect(-72,-2500,72,2500).map(local),
  access:{port:[YUBILEINY_SOURCE_ACCESS.portMetres[0]*.5,1.78,YUBILEINY_SOURCE_ACCESS.portMetres[1]*.5],
   sourceWayIds:YUBILEINY_SOURCE_ACCESS.sourceWayIds,source:'Existing OSM service-road junction behind the control building'},
  source:{satellite:'https://drive.google.com/file/d/19t1sFdi7uFk5tAe7gQ5AAYEUjvyTnHIE/view',
   dimensions:'https://www.buran.ru/htm/pk.htm',runway:'https://www.openstreetmap.org/way/24949215',
   geometryVersion:YUBILEINY_SOURCE_LAYOUT.version,sourceTimestamp:YUBILEINY_SOURCE_LAYOUT.sourceTimestamp,
   sourceFeatureIds:YUBILEINY_SOURCE_LAYOUT.features.map(f=>f.id)},
  layout:'Two separate north-western aprons; RD1 and RD2 joined by a limited parallel taxiway; loading complex at RD1.'};
}

function paintDesignator(root,number,z,side){
 const c=document.createElement('canvas');c.width=256;c.height=512;
 const ctx=c.getContext('2d');ctx.fillStyle='#eeeee6';ctx.font='bold 190px Arial';ctx.textAlign='center';ctx.fillText(number,128,330);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(13,30),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
 mesh.name='Юбилейный · обозначение '+number;mesh.userData.museumComponent='runway-designator';
 mesh.rotation.x=-Math.PI/2;mesh.rotation.z=side>0?Math.PI:0;mesh.position.set(0,1.83,z);root.add(mesh);
}

export function buildYubileinyAirport(root,buildRamp){
 const spec=yubileinyDisplaySpec();root.userData.airport={...spec};
 // Both horizontal axes, buildings and aircraft use the same uniform display
 // reduction. The old length-only squeeze distorted the runway proportions.
 const physical=new THREE.Group();physical.name='Юбилейный · физическая геометрия в метрах';
 physical.scale.setScalar(P.physicalToLocal);physical.position.y=P.gradeOffset;
 physical.userData.airport=root.userData.airport;physical.userData.museumComponent='yubileiny-physical';root.add(physical);
 const k=archiveKit(physical),L=P.length,W=P.width,H=L/2;
 k.mat.concrete.color.setHex(0xb5b5ac);k.mat.asphalt.color.setHex(0x746e61);k.mat.white.color.setHex(0xe9e9de);
 k.box(W+12,.22,L,0,1.39,0,'concrete','runway-shoulder');
 k.box(W,.3,L,0,1.60,0,'concrete','concrete-runway');
 for(const side of [-1,1]){
  k.box(W,.25,P.endSafetyLength,0,1.51,side*(H+P.endSafetyLength/2),'asphalt','runway-end-safety');
  k.box(.9,.035,L-10,side*(W/2-1.2),1.781,0,'white','runway-edge');
  for(let i=0;i<8;i++)for(const sign of [-1,1])k.box(2.8,.045,30,sign*(5.5+i*4.7),1.80,side*(H-25),'white','threshold-bars');
  for(const x of [-W*.29,W*.29]){
   k.box(6,.045,45,x,1.8,side*(H-300),'white','aiming-point');
   for(const [distance,pairs]of [[150,3],[450,2],[600,2],[750,1],[900,1]])for(let n=0;n<pairs;n++)
    k.box(1.8,.045,22,x+(n-(pairs-1)/2)*3.3,1.80,side*(H-distance),'white','touchdown-zone');
  }
  paintDesignator(physical,side>0?'24':'06',side*(H-76),side);
 }
 for(let z=-H+115;z<H-100;z+=60)k.box(.9,.04,30,0,1.80,z,'white','runway-centre-mark');
 // Slab joints and rubber traces are shallow batched details, not separate
 // texture requests or raised strips that could intersect the aeroplane.
 for(let x=-35;x<=35;x+=14)k.box(.055,.012,L-4,x,1.757,0,'asphalt','concrete-longitudinal-joint');
 for(let z=-H+12.5;z<H;z+=12.5)k.box(W-.4,.012,.05,0,1.757,z,'asphalt','concrete-transverse-joint');
 for(const side of [-1,1])for(let n=0;n<7;n++)k.box(.23+n*.035,.013,160+n*21,(n-3)*.66,1.768,side*(H-390),'asphalt','touchdown-rubber');

 for(const f of YUBILEINY_SOURCE_LAYOUT.features){
  if(f.type==='MultiPolygon')for(const polygon of f.coordinates)k.poly(polygon[0],1.756,'concrete','source-taxiway-pavement');
  else if(f.type==='Polygon')k.poly(f.coordinates[0],1.758,'concrete',f.kind==='apron'?'source-apron':'source-taxiway-pavement');
  else if(f.kind==='helipad')k.poly(f.coordinates,1.76,'concrete','holding-roundel');
 }
 for(const id of [241008147,241008154,241008134,241008138,241008132,241008163])
  k.path(source(id).coordinates,.36,1.80,'yellow','source-taxi-centre-line');
 for(const z of [760,880,1000,1100]){
  k.path([[462,z],[585,z]],.36,1.80,'yellow','apron-guideline');
  k.path([[577,z-8],[577,z+8]],.36,1.81,'yellow','parking-tee');
 }
 // Low service buildings and the control block are on the facilities side,
 // between / behind the aprons as in the overhead reference, never on the strip.
 const buildings=[
  {x:760,z:5,w:26,d:92,h:13,floors:3,gates:0,tag:'yubileiny-control-building'},
  {x:841,z:1024,w:48,d:65,h:14,floors:1,gates:2,tag:'yubileiny-service-hangar'},
  {x:790,z:1230,w:22,d:50,h:8,floors:1,gates:0,tag:'yubileiny-service-building'},
  {x:876,z:-1170,w:32,d:66,h:9,floors:1,gates:0,tag:'pua-service-building'},
  {x:819,z:-1300,w:24,d:42,h:7,floors:1,gates:0,tag:'pua-workshop'}
 ];
 for(const b of buildings)k.hall(b);
 for(const path of YUBILEINY_SOURCE_ACCESS.paths){
  k.path(path.points,9,1.80,'concrete','source-service-road-shoulder');
  k.path(path.points,7,1.81,'asphalt','source-service-road');
 }
 k.box(13,24,14,755,12,39,'wall','yubileiny-control-tower');
 k.box(17,4,18,755,26,39,'glass','yubileiny-control-cab');
 k.box(18,.6,19,755,28.3,39,'light','yubileiny-control-cap');
 for(const side of [-1,1]){
  for(let i=0;i<4;i++){
   k.box(1.4,1.1,.9,-W/2-18-i*3,2.2,side*(H-300),'white','papi-housing');
   k.box(1,.45,.06,-W/2-18-i*3,2.4,side*(H-300)+side*.5,i<2?'red':'white','papi-lens');
  }
 }
 buildRamp(k,...P.pua,{eventTarget:root});
 const result=k.finish();Object.assign(result.features,root.userData.airport.fallbackFeatures||{});
 root.userData.airport.features=result.features;delete root.userData.airport.fallbackFeatures;
 root.userData.airport.buildingFootprints=buildings.map(b=>({name:b.tag,heightM:b.h,polygon:rect(b.x-b.w/2,b.z-b.d/2,b.x+b.w/2,b.z+b.d/2).map(local)}));
 root.userData.airport.geometry={version:YUBILEINY_VERSION,physicalToLocal:P.physicalToLocal,gradeOffset:P.gradeOffset,
  physicalBounds:{runway:[-42,-2250,42,2250],pua:P.pua},taxiwaySourceFeatures:11,primitiveCount:result.primitiveCount,meshCount:result.meshCount};
 return result;
}
