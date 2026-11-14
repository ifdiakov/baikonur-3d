import * as THREE from 'three';
import {polishCachedOwnerAd} from './owner-ad-refinements.js?v=20261109-owner19-v3';
import {shapeOwnerRail} from './owner-rail-curves.js?v=20261109-owner19-v3';
import {clipSingleRailAccess,clipPad5DuplicateRail} from './site-single-rail-access.js?v=20261108-pad5-rail-clip-v2';
import {roundRailCorners} from './rail-road-clearance.js?v=20261108-all-rail-curves-v2';
import {TRANSPORT_GROUND_VERSION,TRANSPORT_GROUND_Y,ROAD_SURFACE_Y} from './transport-ground-profile.js?v=20261114-ground-contact-v1';
import {RAIL_PROFILE} from './rail-profile.js';
import {createTransportTerrainHeight} from './transport-terrain-height.js?v=20261114-ground-contact-v1';
import {buildTransportGroundSupport,transportGroundSupportHeightAt} from './transport-ground-support.js?v=20261114-ground-contact-v1';
export const ROAD_LOD_VERSION='road-lod-prebuilt-v1';
const colors={road:0x555751,rail:0x8b8170};
const phase='prebaked-overview';
function stripGeometry(rows,geography,point,y,roadGrade=null,kind='roads',polished=false,terrain=null){
 const xyz=[],indices=[];let skipped=0;
 const overlaps=(a,b,width)=>terrain?.localBounds.some(box=>Math.max(a.x,b.x)+width>=box.minX&&Math.min(a.x,b.x)-width<=box.maxX&&Math.max(a.z,b.z)+width>=box.minZ&&Math.min(a.z,b.z)-width<=box.maxZ);
 // Only the two local hills need this extra mesh resolution. Each vertex
 // keeps its authored clearance above the independently sampled soil, and
 // curved cross-sections are refined instead of making a flat hovering strip.
 function terrainStrip(path,width){
  const vertex=(x,z,clearance)=>({x,z,clearance,y:terrain.heightAt(x,z)+clearance});
  const mid=(a,b)=>vertex((a.x+b.x)/2,(a.z+b.z)/2,(a.clearance+b.clearance)/2);
  function triangle(a,b,c,depth=0){
   const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a),x=(a.x+b.x+c.x)/3,z=(a.z+b.z+c.z)/3;
   const error=Math.max(Math.abs(ab.y-(a.y+b.y)/2),Math.abs(bc.y-(b.y+c.y)/2),Math.abs(ca.y-(c.y+a.y)/2),
    Math.abs(terrain.heightAt(x,z)+(a.clearance+b.clearance+c.clearance)/3-(a.y+b.y+c.y)/3));
   if(error>.006&&depth<7){triangle(a,ab,ca,depth+1);triangle(ab,b,bc,depth+1);triangle(ca,bc,c,depth+1);triangle(ab,bc,ca,depth+1);return;}
   if((b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z)<0)[b,c]=[c,b];
   const index=xyz.length/3;xyz.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);indices.push(index,index+1,index+2);
  }
  // Preserve the cached ribbon's exact X/Z outline. Recomputing normals
  // after densification would rotate a corner's width axis on uneven spans.
  const original=path.map((p,i)=>{
   const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
   const sx=-dz/len*width/2,sz=dx/len*width/2,clearance=p.y-terrain.heightAt(p.x,p.z);
   return [vertex(p.x-sx,p.z-sz,clearance),vertex(p.x+sx,p.z+sz,clearance)];
  });
  const rims=[original[0]];
  for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i],n=overlaps(a,b,width)?Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/1.2)):1;
   for(let j=1;j<=n;j++)rims.push([0,1].map(side=>{
    const u=original[i-1][side],v=original[i][side],t=j/n;
    return vertex(THREE.MathUtils.lerp(u.x,v.x,t),THREE.MathUtils.lerp(u.z,v.z,t),THREE.MathUtils.lerp(u.clearance,v.clearance,t));
   }));
  }
  for(let i=1;i<rims.length;i++){const[a,b]=rims[i-1],[c,d]=rims[i];triangle(a,c,b);triangle(b,c,d);}
 }
 for(const row of rows){
  if(kind==='roads'&&String(row.id)==='37549252'){skipped++;continue;}
  let path=row.points.map(ll=>{if(ll.length===3)return new THREE.Vector3(...ll);const xy=geography.project(...ll);return point(xy[0],xy[1],y);});
  if(kind==='roads'&&String(row.id)==='37550553'){
   // Keep the connection to X752.4/Y458.7; remove its stray eastbound tail.
   const cut=path.findIndex((p,i)=>i>0&&p.x/3.4+650>752.45&&p.z/3.4+522.5>458.75);
   if(cut>=2)path=path.slice(0,cut);
  }
  if(kind==='roads'){
   if(!polished)path=polishCachedOwnerAd(path,row.id);
   if(path.length<2){skipped++;continue;}
  }else if(!polished)path=shapeOwnerRail(path,row.id);
  if(roadGrade)path=roadGrade.conform(path);
  const runs=kind==='rails'&&!row.groundSupportId?clipSingleRailAccess(path,row.id).flatMap(run=>clipPad5DuplicateRail(run,row.id)):[path];
  if(!runs.length){skipped++;continue;}
  const width=(kind==='roads'&&['museum-yubileiny-250a-ukss','museum-pad-250a-gate-spur'].includes(String(row.id))?2.5:row.w)*(roadGrade?.widthScale(row.id)??1);
  for(const path of runs){if(path.length<2)continue;
  if(kind==='roads'&&terrain&&!row.elevated&&path.some((p,i)=>i&&overlaps(path[i-1],p,width))){terrainStrip(path,width);continue;}
  const base=xyz.length/3;
  for(let i=0;i<path.length;i++){
   const prev=path[Math.max(0,i-1)],next=path[Math.min(path.length-1,i+1)];
   const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1,normal=row.normals?.[i];
   const sideX=(normal?normal[0]:-dz/len)*width*.5,sideZ=(normal?normal[1]:dx/len)*width*.5;
   const p=path[i],leftX=p.x-sideX,leftZ=p.z-sideZ,rightX=p.x+sideX,rightZ=p.z+sideZ;
   const leftBase=transportGroundSupportHeightAt(row,leftX,leftZ),rightBase=transportGroundSupportHeightAt(row,rightX,rightZ);
   xyz.push(leftX,leftBase===null?p.y:leftBase+RAIL_PROFILE.ballastY,leftZ,rightX,rightBase===null?p.y:rightBase+RAIL_PROFILE.ballastY,rightZ);
   if(i+1<path.length){const q=base+i*2;indices.push(q,q+2,q+1,q+1,q+2,q+3);}
  }
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 geometry.computeBoundingSphere();return {geometry,skipped,triangles:indices.length/3};
}
export function createRoadLOD({data,geography,point,scene,roadGrade=null}){
 if(roadGrade?.isBaked?.(data))roadGrade=roadGrade.cachedGrade??null;
 if(data?.version!==ROAD_LOD_VERSION||!data?.levels?.far||!data?.levels?.medium)throw Error('Unrecognized precompiled road LOD');
 if(data.source==='final-owner-filtered-rendered-paths'&&data.groundVersion!==TRANSPORT_GROUND_VERSION)throw Error('Outdated transport ground LOD');
 const root=new THREE.Group();root.name='Готовая схема дорог · уровни детализации';scene.add(root);
 const terrain=createTransportTerrainHeight({siteRecords:geography?.sites??[],point});
 const levels={};
 for(const level of ['far','medium']){
  const group=new THREE.Group();group.name='Дороги · '+level;root.add(group);
  const stats={};
  for(const kind of ['roads','rails']){
   const actual=stripGeometry(data.levels[level][kind],geography,point,kind==='roads'?ROAD_SURFACE_Y:TRANSPORT_GROUND_Y+RAIL_PROFILE.ballastY,kind==='roads'?roadGrade:null,kind,data.ownerRevision==='20261109-owner19-v2',terrain);
   // Match the authoritative surface heights; use depth bias for coplanar
   // rendering instead of visibly lifting both overview levels off the ground.
   const depth={side:THREE.DoubleSide,depthWrite:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1};
   const mat=kind==='roads'?new THREE.MeshStandardMaterial({color:colors.road,roughness:1,...depth}):new THREE.MeshBasicMaterial({color:colors.rail,...depth});
   const mesh=new THREE.Mesh(actual.geometry,mat);
   // The existing RocketTrip physical cutout tool selects exact names.
   // Both far and medium road surfaces must be cut by the SAME approved
   // 286 owner removals before the first public frame is displayed.
   mesh.name=kind==='roads'?'OSM · единое дорожное полотно':'LOD · '+level+' · '+kind;
   mesh.receiveShadow=false;
   mesh.userData={pickable:false,museumComponent:'prebuilt-road-lod',roadKind:kind,osmSource:true};
   group.add(mesh);stats[kind]={features:data.levels[level][kind].length,triangles:actual.triangles};
  }
  stats.groundSupport=buildTransportGroundSupport({profiles:data.groundSupports,parent:group,heightAt:terrain.heightAt}).stats;
  group.visible=false;levels[level]={group,stats};
 }
 let current='none';
 function update(height,detailedRoots){
  const requested=height>900?'far':height>350?'medium':'full';
  if(current!==requested)for(const [name,entry]of Object.entries(levels))entry.group.visible=name===requested;
  // Newly installed roots must obey the active LOD even without a level change.
  for(const obj of detailedRoots||[])if(obj)obj.visible=requested==='full';
  current=requested;return current;
 }
 function destroy(){
  root.traverse(obj=>{if(obj.isMesh){obj.geometry.dispose();obj.material.dispose();}});root.removeFromParent();
 }
 return {root,update,destroy,stats:()=>({version:ROAD_LOD_VERSION,sourceHash:data.sourceHash,mode:current,
  levels:Object.fromEntries(Object.entries(levels).map(([key,val])=>[key,val.stats])),source:phase})};
}
