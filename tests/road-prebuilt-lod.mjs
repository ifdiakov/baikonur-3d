import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoadLOD,ROAD_LOD_VERSION} from '../src/road-lod.js';
import {TRANSPORT_GROUND_Y,ROAD_SURFACE_Y,ROAD_SURFACE_CLEARANCE} from '../src/transport-ground-profile.js';
import {RAIL_PROFILE} from '../src/rail-profile.js';
import {createTransportTerrainHeight} from '../src/transport-terrain-height.js';
const json={version:ROAD_LOD_VERSION,sourceHash:'test',levels:{
 far:{roads:[{id:'a',w:6,points:[[63.1,45.9],[63.2,45.9]]}],rails:[{id:'r',w:2,points:[[63.2,45.91],[63.3,45.91]]}]},
 medium:{roads:[{id:'a',w:6,points:[[63.1,45.9],[63.2,45.9],[63.3,45.9]]}],rails:[]}
}};
const scene=new THREE.Scene(),geography={project:(lon,lat)=>[(lon-63)*1000,(lat-45)*1000]};
const point=(x,z,y)=>new THREE.Vector3(x,y,z);
assert.throws(()=>createRoadLOD({data:{...json,source:'final-owner-filtered-rendered-paths'},geography,point,scene}),/Outdated/,'Do not combine new grounded routes with an old raised overview cache');
const preview=createRoadLOD({data:json,geography,point,scene});
preview.root.traverse(mesh=>{if(!mesh.isMesh)return;
 const expected=mesh.userData.roadKind==='roads'?ROAD_SURFACE_Y:TRANSPORT_GROUND_Y+RAIL_PROFILE.ballastY,p=mesh.geometry.attributes.position;
 for(let i=0;i<p.count;i++)assert(Math.abs(p.getY(i)-expected)<1e-6,'Legacy geographic LOD rests on the shared ground datum');
});
const road=new THREE.Group(),rail=new THREE.Group();
assert.equal(preview.update(1500,[road,rail]),'far');
assert(!road.visible&&!rail.visible);
assert.equal(preview.stats().levels.far.roads.triangles,2);
assert.equal(preview.update(600,[road,rail]),'medium');
assert.equal(preview.update(80,[road,rail]),'full');
assert(road.visible&&rail.visible);
assert.equal(preview.stats().mode,'full');
assert(scene.children.includes(preview.root));
preview.destroy();assert(!scene.children.includes(preview.root));
// Authoritative XYZ profiles already include their surface height, including
// intentional bridge grades. Switching LOD must not add a lift or flatten them.
const surfaces={roads:[{id:'world-road',w:3,points:[[10,ROAD_SURFACE_Y,20],[12,5.5,22],[14,ROAD_SURFACE_Y,24]]}],
 rails:[{id:'world-rail',w:.448,points:[[20,TRANSPORT_GROUND_Y+RAIL_PROFILE.ballastY,20],[24,1.2,24]]}]};
const authoritative=createRoadLOD({data:{version:ROAD_LOD_VERSION,ownerRevision:'20261109-owner19-v2',levels:{far:surfaces,medium:surfaces}},scene});
authoritative.root.traverse(mesh=>{if(!mesh.isMesh)return;
 const expected=surfaces[mesh.userData.roadKind][0].points,p=mesh.geometry.attributes.position;
 assert.equal(p.count,expected.length*2);
 for(let i=0;i<expected.length;i++)for(const side of [0,1])assert(Math.abs(p.getY(i*2+side)-expected[i][1])<1e-6,'Authoritative LOD preserves the exact surface profile');
});
authoritative.destroy();
// A 100:10 corner on actual local terrain exercises ribbon subdivision.
// Recomputing width normals from the dense samples would rotate its corner
// and move the approved silhouette by more than one world unit.
const cornerGeography={sites:[{id:'pad-23',x:0,y:0}]};
const cornerTerrain=createTransportTerrainHeight({siteRecords:cornerGeography.sites,point});
const cornerPoints=[[0,0],[100,0],[100,10]].map(([x,z])=>[x,cornerTerrain.heightAt(x,z)+ROAD_SURFACE_CLEARANCE,z]);
const cornerSurfaces={roads:[{id:'corner-silhouette',w:4,points:cornerPoints}],rails:[]};
const corner=createRoadLOD({data:{version:ROAD_LOD_VERSION,ownerRevision:'20261109-owner19-v2',levels:{far:cornerSurfaces,medium:cornerSurfaces}},geography:cornerGeography,point,scene});
const outline=[[0,-2],[100+2/Math.sqrt(101),-20/Math.sqrt(101)],[102,10],
 [98,10],[100-2/Math.sqrt(101),20/Math.sqrt(101)],[0,2]];
const expectedArea=Math.abs(outline.reduce((sum,a,i)=>{const b=outline[(i+1)%outline.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
corner.root.traverse(mesh=>{if(mesh.userData.roadKind!=='roads')return;
 const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
 assert(p.count>outline.length,'The fixture must exercise the terrain subdivision path');
 for(const [x,z]of outline)assert(Array.from({length:p.count},(_,i)=>i).some(i=>Math.abs(p.getX(i)-x)<1e-5&&Math.abs(p.getZ(i)-z)<1e-5),
  'Terrain subdivision must retain every original ribbon corner in X/Z');
 let area=0;
 for(let i=0;i<index.count;i+=3){const [a,b,c]=[0,1,2].map(k=>index.getX(i+k));
  area+=Math.abs((p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))-(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a)))/2;
 }
 assert(Math.abs(area-expectedArea)<1e-3,'Terrain subdivision preserves the original projected ribbon area');
});
corner.destroy();
console.log('ROAD_PREBUILT_LOD_UNIT_PASS');
