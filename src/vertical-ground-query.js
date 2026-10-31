import * as THREE from 'three';

// Only the query index is partitioned. Rendering, original vertices, winding,
// material sides and THREE's triangle-intersection code remain unchanged.
// Large merged map meshes otherwise test every triangle for every site lamp.
export function createVerticalGroundQuery(groundMeshes,{cellSize=64,minimumTriangles=2048,maxTriangleCells=128}={}){
 const started=performance.now(),sources=[...groundMeshes],entries=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 let indexedTriangles=0,indexedMeshes=0,cellReferences=0,queries=0,candidateTriangles=0,staleFallbacks=0;
 const key=(x,z)=>x+':'+z;
 const attributeVersion=attribute=>attribute?.data?.version??attribute?.version;
 for(const source of sources){
  source.updateWorldMatrix(true,false);
  const geometry=source.geometry,position=geometry?.attributes.position,index=geometry?.index;
  const count=index?.count??position?.count??0;
  if(!source.isMesh||source.isInstancedMesh||source.isSkinnedMesh||Array.isArray(source.material)||
    source.raycast!==THREE.Mesh.prototype.raycast||geometry.morphAttributes.position?.length||count/3<minimumTriangles){entries.push({source});continue;}
  const cells=new Map(),wide={indices:[],faces:[],proxy:null},matrix=source.matrixWorld.clone();
  const start=Math.max(0,geometry.drawRange.start),end=Math.min(count,geometry.drawRange.start+geometry.drawRange.count);
  const add=(cell,ids,face)=>{cell.indices.push(...ids);cell.faces.push(face);cellReferences++;};
  for(let i=start;i<end;i+=3){
   const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
   a.fromBufferAttribute(position,ids[0]).applyMatrix4(matrix);b.fromBufferAttribute(position,ids[1]).applyMatrix4(matrix);c.fromBufferAttribute(position,ids[2]).applyMatrix4(matrix);
   // Inclusive neighbouring cells at exact boundaries are intentional. A ray
   // on a section seam must see the same triangles as the unsplit mesh.
   const x0=Math.floor((Math.min(a.x,b.x,c.x)-1e-8)/cellSize),x1=Math.floor((Math.max(a.x,b.x,c.x)+1e-8)/cellSize);
   const z0=Math.floor((Math.min(a.z,b.z,c.z)-1e-8)/cellSize),z1=Math.floor((Math.max(a.z,b.z,c.z)+1e-8)/cellSize);
   if((x1-x0+1)*(z1-z0+1)>maxTriangleCells)add(wide,ids,Math.floor(i/3));
   else for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
    const id=key(x,z);let cell=cells.get(id);if(!cell){cell={indices:[],faces:[],proxy:null};cells.set(id,cell);}add(cell,ids,Math.floor(i/3));
   }
   indexedTriangles++;
  }
  if(!geometry.boundingSphere)geometry.computeBoundingSphere();
  entries.push({source,geometry,position,index,matrix,material:source.material,positionVersion:attributeVersion(position),indexVersion:attributeVersion(index),
   drawStart:geometry.drawRange.start,drawCount:geometry.drawRange.count,cells,wide,stale:false});indexedMeshes++;
 }
 const buildMs=performance.now()-started;
 function originalChanged(entry){
  const {source,geometry,position,index,matrix}=entry;
  source.updateWorldMatrix(true,false);
  return source.geometry!==geometry||source.material!==entry.material||geometry.attributes.position!==position||geometry.index!==index||
   attributeVersion(position)!==entry.positionVersion||attributeVersion(index)!==entry.indexVersion||geometry.drawRange.start!==entry.drawStart||geometry.drawRange.count!==entry.drawCount||
   !source.matrixWorld.equals(matrix);
 }
 function proxy(entry,cell){
  if(!cell?.indices.length)return null;
  if(!cell.proxy){
   const geometry=new THREE.BufferGeometry();
   // Attributes are shared read-only; only the small triangle index is new.
   for(const [name,attribute]of Object.entries(entry.geometry.attributes))geometry.setAttribute(name,attribute);
   geometry.setIndex(cell.indices);geometry.boundingSphere=entry.geometry.boundingSphere;geometry.boundingBox=entry.geometry.boundingBox;
   const mesh=new THREE.Mesh(geometry,entry.source.material);mesh.matrixAutoUpdate=false;mesh.matrixWorldAutoUpdate=false;mesh.matrixWorld.copy(entry.matrix);
   cell.proxy=mesh;
  }
  cell.proxy.layers.mask=entry.source.layers.mask;candidateTriangles+=cell.faces.length;
  return cell.proxy;
 }
 function intersections(raycaster,extraMeshes=[]){
  queries++;
  const direction=raycaster.ray.direction;
  if(Math.abs(direction.x)>1e-12||Math.abs(direction.z)>1e-12||direction.y>=0)return raycaster.intersectObjects([...sources,...extraMeshes],false);
  const x=Math.floor(raycaster.ray.origin.x/cellSize),z=Math.floor(raycaster.ray.origin.z/cellSize),hits=[];
  for(const entry of entries){
   if(!entry.cells||entry.stale||originalChanged(entry)){
    if(entry.cells&&!entry.stale){entry.stale=true;staleFallbacks++;}
    raycaster.intersectObject(entry.source,false,hits);continue;
   }
   for(const cell of [entry.cells.get(key(x,z)),entry.wide]){
    const mesh=proxy(entry,cell);if(!mesh)continue;
    const found=raycaster.intersectObject(mesh,false);
    for(const hit of found){hit.object=entry.source;hit.faceIndex=cell.faces[hit.faceIndex];hits.push(hit);}
   }
  }
  for(const mesh of extraMeshes)raycaster.intersectObject(mesh,false,hits);
  hits.sort((a,b)=>a.distance-b.distance);return hits;
 }
 return {intersections,stats:()=>({version:'exact-vertical-ground-cells-v1',cellSize,indexedMeshes,indexedTriangles,cellReferences,queries,candidateTriangles,staleFallbacks,buildMs})};
}
