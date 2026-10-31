import * as THREE from 'three';
import {RAIL_METRES} from './rail-profile.js?v=20261031-facilities-rails-lighting-v1';

/** Adjust only the tagged source rail members. Buildings, source wheels,
 * asset bytes, twin-track centre spacing and the actual contact elevation stay
 * fixed. The source cross-section is retained within the shared envelope. */
export function adaptUkssRailProfile(root,source){
 if(!source?.railSourceEndpoints?.length)return {changed:false};
 if(root.userData.ukssRailProfile)return root.userData.ukssRailProfile;
 root.updateWorldMatrix(true,true);
 const rootInverse=root.matrixWorld.clone().invert(),members=[];
 root.traverse(mesh=>{if(mesh.isMesh&&!Array.isArray(mesh.material)&&mesh.material?.name==='Rails')members.push(mesh);});
 const sourceGauge=source.railSourceGauge,trackCenters=[],headEndpoints=[];
 let vertices=0,railMembers=0;
 for(const mesh of members){
  const transform=rootInverse.clone().multiply(mesh.matrixWorld),inverse=transform.clone().invert(),position=mesh.geometry.attributes.position;
  // The source batch contains two longitudinal groups, each with two tracks.
  // Separate real connected boxes before finding their paired track axes;
  // grouping by the forward sockets would collapse the rear running members.
  const parents=Array.from({length:position.count},(_,i)=>i),find=i=>parents[i]===i?i:(parents[i]=find(parents[i]));
  const index=mesh.geometry.index;
  for(let i=0;i<(index?.count??position.count);i+=3){
   const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),a=find(ids[0]);for(const b of ids.slice(1))parents[find(b)]=a;
  }
  const components=new Map(),points=[];
  for(let i=0;i<position.count;i++){
   const p=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(transform),key=find(i);
   if(!components.has(key))components.set(key,{bounds:new THREE.Box3(),points:[]});
   const section=components.get(key);section.bounds.expandByPoint(p);section.points.push(p);points.push({p,section});
  }
  const groups=[];
  for(const section of components.values()){
   const {min,max}=section.bounds;
   let group=groups.find(g=>Math.abs(g.minZ-min.z)<.03&&Math.abs(g.maxZ-max.z)<.03);
   if(!group){group={minZ:min.z,maxZ:max.z,sections:[]};groups.push(group);}group.sections.push(section);
  }
  const forwardZ=Math.max(...groups.map(group=>group.maxZ));
  for(const group of groups){
   group.sections.sort((a,b)=>a.bounds.min.x-b.bounds.min.x);
   if(group.sections.length%2)throw new Error('UKSS source running rails do not form complete track pairs');
   for(let i=0;i<group.sections.length;i+=2){
    const [left,right]=group.sections.slice(i,i+2),center=(left.bounds.min.x+left.bounds.max.x+right.bounds.min.x+right.bounds.max.x)/4;
    trackCenters.push(center);left.track=right.track=center;left.side=-1;right.side=1;
    if(Math.abs(group.maxZ-forwardZ)<.03)headEndpoints.push([center,Math.max(left.bounds.max.y,right.bounds.max.y),group.maxZ]);
   }
  }
  railMembers+=components.size;
  // Meshopt may decode normalized integer attributes. The adapted dimensions
  // must be written in metres, without quantizing back into that source range.
  const geometry=mesh.geometry.clone(),output=new THREE.Float32BufferAttribute(new Float32Array(position.count*3),3);
  geometry.setAttribute('position',output);
  points.forEach(({p,section},i)=>{
   const {min,max}=section.bounds,oldCenter=(min.x+max.x)/2;
   p.x=section.track+section.side*RAIL_METRES.gauge/2+(p.x-oldCenter)*RAIL_METRES.headWidth/(max.x-min.x);
   p.y=max.y-(max.y-p.y)*RAIL_METRES.railHeight/(max.y-min.y);
   p.applyMatrix4(inverse);output.setXYZ(i,p.x,p.y,p.z);vertices++;
  });
  output.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;
  mesh.userData.railProfile=RAIL_METRES.version;
 }
 return root.userData.ukssRailProfile={version:RAIL_METRES.version,changed:members.length>0,railMeshes:members.length,railMembers,vertices,sourceGauge,
  gauge:RAIL_METRES.gauge,headWidth:RAIL_METRES.headWidth,railHeight:RAIL_METRES.railHeight,trackCenters,headEndpoints:headEndpoints.sort((a,b)=>a[0]-b[0]),
  sourceAssetUnchanged:true,structuresUnchanged:true,railTopUnchanged:true};
}
