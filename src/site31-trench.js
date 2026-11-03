import * as THREE from 'three';
import {SITE31_FLOOR_Y,SITE31_DUCT_SCALE,SITE31_PIT,SITE31_REFERENCE,SITE31_RIM,site31RimAt} from './site31-trench-profile.js?v=20261103-launch-table-v1';

// Smooth concrete sections inside the asymmetric WV03 trace, enlarged by 20%.
// Heights remain a museum reconstruction, independent of the satellite plan.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

export function buildSite31Trench(k){
 const group=new THREE.Group();group.name='Пл.31 · ровный газоотвод · +20%';
 group.userData.museumComponent='site31-gas-duct';k.root.add(group);
 k.cutouts.push(SITE31_PIT);
 const zMin=Math.min(...SITE31_RIM.map(p=>p[1])),zMax=Math.max(...SITE31_RIM.map(p=>p[1]));
 const rearStart=12*SITE31_DUCT_SCALE,rampStart=-22*SITE31_DUCT_SCALE;
 const ends=[...new Set([zMin,zMax,0,rearStart,rampStart,...SITE31_RIM.map(p=>p[1]),
  ...Array.from({length:Math.ceil((zMax-zMin)/2.5)},(_,i)=>Math.max(zMin,zMax-i*2.5))])].sort((a,b)=>b-a);
 const sections=ends.map(z=>{
  const [left,right]=site31RimAt(z),span=right-left;
  const mouthX=site31RimAt(zMin)[0];
  const axis=mouthX*clamp((rampStart-z)/(rampStart-zMin),0,1);
  const center=clamp(axis,left+span*.30,right-span*.30);
  const halfWidth=Math.min(17*SITE31_DUCT_SCALE,center-left,right-center);
  const rise=clamp((rampStart-z)/(rampStart-zMin),0,1);
  let floorY=SITE31_FLOOR_Y*(1-rise);
  if(z>rearStart)floorY=SITE31_FLOOR_Y*(1-clamp((z-rearStart)/(zMax-rearStart),0,1));
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
  return point(section,THREE.MathUtils.lerp(inner,outer,t),section.floorY*(1-t));
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
 // Shared vertices give continuous lighting across the longitudinal sections;
 // the former isolated triangles made otherwise continuous concrete look faceted.
 function geometry(positions,colors=null){
  const vertices=[],vertexColors=[],indices=[],lookup=new Map();
  for(let i=0;i<positions.length;i+=3){
   const p=positions.slice(i,i+3),key=p.map(v=>v.toFixed(6)).join(',');let index=lookup.get(key);
   if(index===undefined){index=vertices.length/3;lookup.set(key,index);vertices.push(...p);if(colors)vertexColors.push(...colors.slice(i,i+3));}
   indices.push(index);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);
  if(colors)g.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));g.computeVertexNormals();return g;
 }
 const floorGeometry=geometry(floorPositions,floorColors);
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
 group.userData.satelliteTrace={source:SITE31_REFERENCE.sourceUrl,imageryDate:SITE31_REFERENCE.imageryDate,heightsVerified:false,displayedOutlineAdjusted:true,dimensionScale:SITE31_DUCT_SCALE};
 return {version:'site31-satellite-duct-v3',planShape:'asymmetric-satellite-outline-tapering-to-northwest-mouth',dimensionScale:SITE31_DUCT_SCALE,
  floorY:SITE31_FLOOR_Y,rimY:0,axisUnderLaunchTable:true,openMouth:true,
  mouth:{z:zMin,centerX:sections.at(-1).center,floorY:sections.at(-1).floorY},
  lengthMetresApprox:zMax-zMin,exhaustRunMetresApprox:-zMin,maxWidthMetresApprox:Math.max(...sections.map(s=>s.right-s.left)),
  heightBasis:'Interpretive section; elevations cannot be measured from this satellite image.',
  sections:sections.map(s=>({...s})),floorTriangles:floorPositions.length/9,bankTriangles:bankPositions.length/9};
}
