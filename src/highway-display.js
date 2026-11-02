import * as THREE from 'three';
import {createHighwayAsphaltMaterial,createHighwayMarkingMaterial,HIGHWAY_ASPHALT_LIFT,HIGHWAY_MARKINGS} from './highway-surface.js?v=20261031-facilities-rails-lighting-v2';
import {distancePath} from './traffic-paths.js?v=20261031-facilities-rails-lighting-v1';

// These distant continuations are scenery, not surveyed roads or OSM edges.
// Keep them outside the traffic graph and the source attribution/counts.
export const HIGHWAY_DISPLAY=Object.freeze({version:'highway-horizon-v2',lengthPerEnd:36000,sampleStep:512,turnSampleStep:8,
 shoulderExtra:.6,detailedFixturesUntil:4096,fadeStart:15000,fadeEnd:30000});
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

export function applyHighwayDisplayFade(material){
 const beforeCompile=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
 material.transparent=true;material.depthWrite=false;material.alphaTest=.00001;material.forceSinglePass=true;
 material.userData.highwayDisplayFade=[HIGHWAY_DISPLAY.fadeStart,HIGHWAY_DISPLAY.fadeEnd];
 material.onBeforeCompile=shader=>{
  beforeCompile.call(material,shader);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vHighwayDisplayDistance;')
   .replace('#include <project_vertex>','#include <project_vertex>\nvHighwayDisplayDistance=length(mvPosition.xyz);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vHighwayDisplayDistance;')
   .replace('#include <alphatest_fragment>',`diffuseColor.a*=1.-smoothstep(${HIGHWAY_DISPLAY.fadeStart.toFixed(1)},${HIGHWAY_DISPLAY.fadeEnd.toFixed(1)},vHighwayDisplayDistance);\n#include <alphatest_fragment>`);
 };
 material.customProgramCacheKey=()=>cacheKey+'-'+HIGHWAY_DISPLAY.version+'-radial-fade';
 return material;
}

export function highwayDisplayPlan(highway,{directionAt=(p,d)=>d}={}){
 if(!highway?.points||highway.points.length<2)return [];
 return ['west','east'].map((side,i)=>{
  const end=i?highway.points.length-1:0,near=i?end-1:1,from=highway.points[end].clone();
  const fallback=from.clone().sub(highway.points[near]).setY(0).normalize();
  const tangent=directionAt(from,fallback).clone().setY(0).normalize();
  if(tangent.dot(fallback)<0)tangent.negate();
  const width=highway.widthAt?.(i?highway.length:0)??highway.width,sign=i?1:-1;
  // The finite source extract ends beside the river. Turn the display-only
  // tail gently landward; a straight extrapolation crosses a real western
  // meander and the eastern mask closure. Source endpoints/tangents stay put.
  const endTangent=V(sign,0,0),turnEnd=from.clone().add(V(sign*1500,0,i?-700:-1200));
  const turn=new THREE.CubicBezierCurve3(from,from.clone().addScaledVector(tangent,i?500:200),turnEnd.clone().addScaledVector(endTangent,-500),turnEnd);
  const turnCount=Math.ceil(turn.getLength()/HIGHWAY_DISPLAY.turnSampleStep),points=[],tangents=[];
  for(let j=0;j<=turnCount;j++){points.push(turn.getPoint(j/turnCount));tangents.push(turn.getTangent(j/turnCount).setY(0).normalize());}
  tangents[0].copy(tangent);tangents.at(-1).copy(endTangent);
  let turnLength=0;for(let j=1;j<points.length;j++)turnLength+=points[j].distanceTo(points[j-1]);
  const remaining=HIGHWAY_DISPLAY.lengthPerEnd-turnLength,count=Math.ceil(remaining/HIGHWAY_DISPLAY.sampleStep);
  for(let j=1;j<=count;j++){points.push(turnEnd.clone().addScaledVector(endTangent,remaining*j/count));tangents.push(endTangent.clone());}
  return {...distancePath(points),id:'highway-display-'+side,side,source:'museum-display-extension',displayOnly:true,lightingClass:'highway',width,
   from,to:points.at(-1).clone(),tangent,endTangent,tangents,turnLength};
 });
}

export function buildHighwayDisplay({parent,highway,directionAt,shoulderColor=0xc5c1b4}){
 const paths=highwayDisplayPlan(highway,{directionAt}),root=new THREE.Group();
 root.name='Трасса · дальнее визуальное продолжение';root.userData={pickable:false,source:'museum-display-extension',version:HIGHWAY_DISPLAY.version};parent.add(root);
 const materials={asphalt:applyHighwayDisplayFade(createHighwayAsphaltMaterial()),
  shoulder:applyHighwayDisplayFade(new THREE.MeshStandardMaterial({color:shoulderColor,roughness:.96,metalness:0,side:THREE.DoubleSide})),
  yellow:applyHighwayDisplayFade(createHighwayMarkingMaterial(HIGHWAY_MARKINGS.yellowColor)),white:applyHighwayDisplayFade(createHighwayMarkingMaterial(HIGHWAY_MARKINGS.whiteColor))};
 const positions=Object.fromEntries(Object.keys(materials).map(key=>[key,[]]));
 function ribbon(path,key,width,offset,lift){
  const out=positions[key];
  const edge=(index,side)=>{const t=path.tangents[index];return path.points[index].clone().addScaledVector(V(-t.z,0,t.x),offset+side*width/2).add(V(0,lift,0));};
  for(let i=1;i<path.points.length;i++){
   const a=edge(i-1,-1),b=edge(i-1,1),c=edge(i,-1),d=edge(i,1);
   for(const p of [a,b,c,b,d,c])out.push(p.x,p.y,p.z);
  }
 }
 for(const path of paths){
  ribbon(path,'asphalt',path.width,0,HIGHWAY_ASPHALT_LIFT);
  for(const side of [-1,1]){
   ribbon(path,'shoulder',HIGHWAY_DISPLAY.shoulderExtra/2,side*(path.width/2+HIGHWAY_DISPLAY.shoulderExtra/4),-.055);
   ribbon(path,'white',HIGHWAY_MARKINGS.edgeWidth,side*(path.width/2-HIGHWAY_MARKINGS.edgeInset),HIGHWAY_MARKINGS.lift);
   ribbon(path,'yellow',HIGHWAY_MARKINGS.centerWidth,side*HIGHWAY_MARKINGS.centerOffset,HIGHWAY_MARKINGS.lift);
  }
 }
 let triangles=0;
 for(const [part,values]of Object.entries(positions)){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,materials[part]);mesh.name='Трасса · продолжение · '+part;
  // Regional/intermediate/satellite terrain draws at 0/1/2 without depth
  // writes. Fadeable road surfaces must follow it, then their paint follows.
  mesh.renderOrder=part==='white'||part==='yellow'?4:3;
  // No site/fixture ground ray ever needs a 320k-wide display-only surface.
  mesh.userData={pickable:false,groundSurface:false,highwayDisplay:true,part,source:'museum-display-extension'};
  root.add(mesh);triangles+=values.length/9;
 }
 return {root,paths,stats:()=>({version:HIGHWAY_DISPLAY.version,source:'museum-display-extension',sourceGraphUnchanged:true,
  lengthPerEnd:HIGHWAY_DISPLAY.lengthPerEnd,totalLength:paths.reduce((n,p)=>n+p.length,0),triangles,drawCalls:root.children.length,
  fadeRange:[HIGHWAY_DISPLAY.fadeStart,HIGHWAY_DISPLAY.fadeEnd],paths:paths.map(p=>({id:p.id,side:p.side,from:p.from.toArray(),to:p.to.toArray(),width:p.width,length:p.length,points:p.points.length}))})};
}
