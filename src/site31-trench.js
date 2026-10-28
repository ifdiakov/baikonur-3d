import * as THREE from 'three';
import {SITE31_FLOOR_Y,SITE31_PIT,SITE31_REFERENCE,SITE31_RIM,site31RimAt} from './site31-trench-profile.js?v=20261028-museum4-osm-live-v1';

// The plan follows the georeferenced WV03 image. Heights and the chamber
// hidden under the launch bridge remain an interpretive museum section.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function interpolate(points,z){
 for(let i=1;i<points.length;i++)if(z>=points[i][0]){
  const a=points[i-1],b=points[i],t=clamp((a[0]-z)/(a[0]-b[0]),0,1);
  return THREE.MathUtils.lerp(a[1],b[1],t);
 }
 return points.at(-1)[1];
}

export function buildSite31Trench(k){
 const group=new THREE.Group();group.name='Пл.31 · газоотвод по спутниковому контуру';
 group.userData.museumComponent='site31-gas-duct';k.root.add(group);
 k.cutouts.push(SITE31_PIT);
 const zMin=Math.min(...SITE31_RIM.map(p=>p[1])),zMax=Math.max(...SITE31_RIM.map(p=>p[1]));
 const ends=[...new Set([zMin,zMax,0,12,-22,...SITE31_RIM.map(p=>p[1]),
  ...Array.from({length:Math.ceil((zMax-zMin)/2.5)},(_,i)=>Math.max(zMin,zMax-i*2.5))])].sort((a,b)=>b-a);
 const centers=[[zMax,site31RimAt(zMax)[0]],[12,5],[0,0],[-20,-5],[-40,-10],[-64,-5],[-92,-2],[-119,0],[-146,4.6],[zMin,3.4]];
 const widths=[[zMax,0],[12,11],[0,14],[-20,17],[-40,15],[-64,11],[-92,7],[-119,4],[-146,1.2],[zMin,0]];
 const sections=ends.map(z=>{
  const [left,right]=site31RimAt(z),span=right-left;
  const center=clamp(interpolate(centers,z),left+span*.06,right-span*.06);
  const halfWidth=Math.max(0,Math.min(interpolate(widths,z),(center-left)*.74,(right-center)*.74));
  const rise=Math.pow(smooth((-z-22)/(-zMin-22)),1.6);
  let floorY=SITE31_FLOOR_Y*(1-rise);
  if(z>12)floorY=SITE31_FLOOR_Y*(1-smooth((z-12)/(zMax-12)));
  return {z,left,right,center,floorLeft:center-halfWidth,floorRight:center+halfWidth,floorY};
 });
 const floorPositions=[],floorColors=[],bankPositions=[];
 const floorColor=new THREE.Color(),soot=new THREE.Color(0x655f53),clean=new THREE.Color(0xe0d9ca);
 function face(output,a,b,c,d){
  const ab=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),ac=new THREE.Vector3(...c).sub(new THREE.Vector3(...a));
  if(ab.clone().cross(ac).lengthSq()>1e-12)output.push(...a,...b,...c);
  const ad=new THREE.Vector3(...d).sub(new THREE.Vector3(...a));
  if(ac.cross(ad).lengthSq()>1e-12)output.push(...a,...c,...d);
 }
 const point=(section,x,y=section.floorY)=>[x,y,section.z];
 function bank(section,side,t){
  const inner=side?section.floorRight:section.floorLeft,outer=side?section.right:section.left;
  // A gentle toe rolls into the straight, lined upper bank.
  const rise=t<.18?t*.72:.1296+(t-.18)*(.8704/.82);
  return point(section,THREE.MathUtils.lerp(inner,outer,t),section.floorY*(1-rise));
 }
 for(let i=1;i<sections.length;i++){
  const a=sections[i-1],b=sections[i],before=floorPositions.length;
  face(floorPositions,point(a,a.floorLeft),point(a,a.floorRight),point(b,b.floorRight),point(b,b.floorLeft));
  for(let n=before;n<floorPositions.length;n+=3){
   const z=floorPositions[n+2],cleanliness=smooth((-z+8)/135);
   floorColor.copy(soot).lerp(clean,cleanliness);
   floorColors.push(floorColor.r,floorColor.g,floorColor.b);
  }
  const bands=[0,.18,.58,1];
  for(let side=0;side<2;side++)for(let j=1;j<bands.length;j++){
   const lo=bands[j-1],hi=bands[j];
   if(side)face(bankPositions,bank(a,side,lo),bank(a,side,hi),bank(b,side,hi),bank(b,side,lo));
   else face(bankPositions,bank(a,side,hi),bank(a,side,lo),bank(b,side,lo),bank(b,side,hi));
  }
 }
 function geometry(positions){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();return g;}
 const floorGeometry=geometry(floorPositions);floorGeometry.setAttribute('color',new THREE.Float32BufferAttribute(floorColors,3));
 const floorMaterial=k.mat.concrete.clone();
 floorMaterial.name='museum / site31 soot-stained concrete';floorMaterial.vertexColors=true;
 floorMaterial.onBeforeCompile=k.mat.concrete.onBeforeCompile;
 floorMaterial.onBeforeRender=k.mat.concrete.onBeforeRender;
 floorMaterial.customProgramCacheKey=k.mat.concrete.customProgramCacheKey;
 k.mat.site31DuctFloor=floorMaterial;
 k.direct(floorGeometry,'site31DuctFloor','site31-gas-duct-floor',group);
 k.direct(geometry(bankPositions),'concrete','site31-gas-duct-banks',group);

 // Expansion joints follow the concrete itself, without coplanar decal sheets.
 // Keep the grade-level tip open: there is no transverse wall across the mouth.
 let previousJoint=Infinity;
 for(const a of sections){
  if(previousJoint-a.z<8||a.right-a.left<4)continue;previousJoint=a.z;
  const lift=p=>[p[0],p[1]+.045,p[2]];
  k.rod(lift(point(a,a.floorLeft)),lift(point(a,a.floorRight)),.035,'soil','site31-floor-expansion-joint');
  for(let side=0;side<2;side++){
   const fractions=[0,.18,.58,1];
   for(let j=1;j<fractions.length;j++)k.rod(lift(bank(a,side,fractions[j-1])),lift(bank(a,side,fractions[j])),.038,'soil','site31-bank-expansion-joint');
  }
 }
 for(let i=1;i<sections.length;i++){
  const a=sections[i-1],b=sections[i];
  for(let side=0;side<2;side++){
   k.rod([side?a.right:a.left,.05,a.z],[side?b.right:b.left,.05,b.z],.14,'wall','site31-traced-rim-coping');
   for(const t of [.18,.58]){const p=bank(a,side,t),q=bank(b,side,t);p[1]+=.035;q[1]+=.035;k.rod(p,q,.03,'soil','site31-longitudinal-panel-joint');}
  }
 }
 group.userData.satelliteTrace={source:SITE31_REFERENCE.sourceUrl,imageryDate:SITE31_REFERENCE.imageryDate,heightsVerified:false};
 return {version:'site31-satellite-duct-v1',planShape:'asymmetric-basin-tapering-to-northwest-mouth',
  floorY:SITE31_FLOOR_Y,rimY:0,axisUnderLaunchTable:true,openMouth:true,
  mouth:{z:zMin,centerX:sections.at(-1).center,floorY:sections.at(-1).floorY},
  lengthMetresApprox:-zMin,maxWidthMetresApprox:Math.max(...sections.map(s=>s.right-s.left)),
  heightBasis:'Interpretive section; elevations cannot be measured from this satellite image.',
  sections:sections.map(s=>({...s})),floorTriangles:floorPositions.length/9,bankTriangles:bankPositions.length/9};
}
