import * as THREE from 'three';
import {clipSingleRailAccess} from './site-single-rail-access.js?v=20261108-single-access-v1';
export const ROAD_LOD_VERSION='road-lod-prebuilt-v1';
const colors={road:0xadb2b3,rail:0x8b8170};
const phase='prebaked-overview';
function stripGeometry(rows,geography,point,y,roadGrade=null,kind='roads'){
 const xyz=[],indices=[];let skipped=0;
 for(const row of rows){
  if(kind==='roads'&&String(row.id)==='37549252'){skipped++;continue;}
  let path=row.points.map(ll=>{if(ll.length===3)return new THREE.Vector3(ll[0],ll[1]+.018,ll[2]);const xy=geography.project(...ll);return point(xy[0],xy[1],y);});
  if(roadGrade)path=roadGrade.conform(path);
  const runs=kind==='rails'?clipSingleRailAccess(path,row.id):[path];
  if(!runs.length){skipped++;continue;}
  const width=row.w*(roadGrade?.widthScale(row.id)??1);
  for(const path of runs){if(path.length<2)continue;
  const base=xyz.length/3;
  for(let i=0;i<path.length;i++){
   const prev=path[Math.max(0,i-1)],next=path[Math.min(path.length-1,i+1)];
   const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1,sideX=-dz/len*width*.5,sideZ=dx/len*width*.5;
   const p=path[i];xyz.push(p.x-sideX,p.y,p.z-sideZ,p.x+sideX,p.y,p.z+sideZ);
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
 const root=new THREE.Group();root.name='Готовая схема дорог · уровни детализации';scene.add(root);
 const levels={};
 for(const level of ['far','medium']){
  const group=new THREE.Group();group.name='Дороги · '+level;root.add(group);
  const stats={};
  for(const kind of ['roads','rails']){
   const actual=stripGeometry(data.levels[level][kind],geography,point,kind==='roads'?.84:.62,kind==='roads'?roadGrade:null,kind);
   const mat=new THREE.MeshBasicMaterial({color:colors[kind==='roads'?'road':'rail'],side:THREE.DoubleSide,depthWrite:true});
   const mesh=new THREE.Mesh(actual.geometry,mat);
   // The existing RocketTrip physical cutout tool selects exact names.
   // Both far and medium road surfaces must be cut by the SAME approved
   // 286 owner removals before the first public frame is displayed.
   mesh.name=kind==='roads'?'OSM · единое дорожное полотно':'LOD · '+level+' · '+kind;
   mesh.receiveShadow=false;
   mesh.userData={pickable:false,museumComponent:'prebuilt-road-lod',roadKind:kind,osmSource:true};
   group.add(mesh);stats[kind]={features:data.levels[level][kind].length,triangles:actual.triangles};
  }
  group.visible=false;levels[level]={group,stats};
 }
 let current='none';
 function update(height,detailedRoots){
  const requested=height>900?'far':height>350?'medium':'full';
  if(current===requested)return current;
  for(const [name,entry]of Object.entries(levels))entry.group.visible=name===requested;
  for(const obj of detailedRoots||[])if(obj)obj.visible=requested==='full';
  current=requested;return current;
 }
 function destroy(){
  root.traverse(obj=>{if(obj.isMesh){obj.geometry.dispose();obj.material.dispose();}});root.removeFromParent();
 }
 return {root,update,destroy,stats:()=>({version:ROAD_LOD_VERSION,sourceHash:data.sourceHash,mode:current,
  levels:Object.fromEntries(Object.entries(levels).map(([key,val])=>[key,val.stats])),source:phase})};
}
