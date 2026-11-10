import * as THREE from 'three';
export const BRIDGE_GROUND_SURFACE_VERSION='20261110-bridge-world-soil-v1';
// Apply the same world-registered soil to synchronous and late Worker hills.
// Worker serialization intentionally omits textures and shader callbacks.
export function applyBridgeGroundSurfaces(root,{referenceMaterial,steppeSurface,registerGroundSurface,width,height}){
 if(!referenceMaterial?.map||!steppeSurface?.apply||!(width>0&&height>0))throw Error('Bridge terrain needs the shared ground material and extent');
 let count=0;root.updateWorldMatrix(true,true);
 root.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.userData.bridgeApproachTerrain||mesh.userData.bridgeGroundSurface===BRIDGE_GROUND_SURFACE_VERSION)return;
  const positions=mesh.geometry.getAttribute('position'),uv=new Float32Array(positions.count*2),world=new THREE.Vector3();
  for(let i=0;i<positions.count;i++){world.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);uv[i*2]=world.x/width+.5;uv[i*2+1]=.5-world.z/height;}
  mesh.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));const material=mesh.material;
  material.map=referenceMaterial.map;
  // Late Basic materials are absent from the initial evening material list.
  // Copy the already-tinted reference; never multiply the night tint twice.
  material.color.copy(referenceMaterial.color);material.vertexColors=true;material.transparent=false;material.depthWrite=true;
  steppeSurface.apply(material);registerGroundSurface(mesh);material.needsUpdate=true;mesh.userData.bridgeGroundSurface=BRIDGE_GROUND_SURFACE_VERSION;count++;
 });return count;
}
