import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {groundRoadEdits} from '../src/road-ground-contact.js';
import {buildEditedRoadMeshes} from '../src/road-editor-mesh.js';
import {createTransportGroundSupportSampler} from '../src/transport-ground-support.js';
import {TRANSPORT_GROUND_Y} from '../src/transport-ground-profile.js';

// Four real MIK112 roof prefixes touch the side of the approved road-8.
// The fixture retains the exact source points, normals and shared grade;
// it is independent of generated gzip availability and of browser rendering.
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const fixture=read('./fixtures/road8-mik-foundation.json');
const owner=read('../data/road-edits-authoritative-20261103.json').added.find(r=>r.id==='road-8');
const original=JSON.stringify({fixture,owner}),flat=()=>TRANSPORT_GROUND_Y;
const road=groundRoadEdits({added:[owner],hidden:[]},[],flat).added[0];
const before=buildEditedRoadMeshes([road],{terrainHeightAt:flat,followTerrain:true});
const after=buildEditedRoadMeshes([road],{terrainHeightAt:flat,groundSupports:fixture.groundSupports,followTerrain:true});
assert.deepEqual(after.paths,before.paths,'Exact side trimming preserves all sampled control X/Z and road heights');
assert.equal(JSON.stringify({fixture,owner}),original,'Neither the approved road nor foundation profiles may be mutated');

const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const area=poly=>Math.abs(poly.reduce((sum,a,i)=>{const b=poly[(i+1)%poly.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
function triangles(geometry){
 const p=geometry.attributes.position,index=geometry.index,result=[];
 for(let i=0;i<(index?.count??p.count);i+=3)result.push([0,1,2].map(k=>{const j=index?index.getX(i+k):i+k;return[p.getX(j),p.getZ(j)];}));
 return result;
}
// Independent convex intersection measures only the actual common footprint.
function intersection(subject,boundary){
 if(cross(boundary[0],boundary[1],boundary[2])<0)boundary=[...boundary].reverse();
 let result=subject;
 for(let i=0;i<boundary.length&&result.length;i++){
  const a=boundary[i],b=boundary[(i+1)%boundary.length],input=result;result=[];
  for(let j=0;j<input.length;j++){
   const p=input[j],q=input[(j+1)%input.length],dp=cross(a,b,p),dq=cross(a,b,q),ip=dp>=-1e-10,iq=dq>=-1e-10;
   if(ip)result.push(p);
   if(ip!==iq){const t=dp/(dp-dq);result.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
  }
 }
 return result;
}
const kinds=['asphalt','shoulder'],surfaces=Object.fromEntries(kinds.map(kind=>[kind,{before:triangles(before.geometries[kind]),after:triangles(after.geometries[kind])}]));
const overlapBefore={asphalt:0,shoulder:0};
for(const profile of fixture.groundSupports){
 const sampler=createTransportGroundSupportSampler({profiles:[profile],heightAt:flat});
 const roofs=sampler.trianglesInBounds({minX:-300,maxX:-100,minZ:-600,maxZ:-400}).map(t=>[t.a,t.b,t.c].map(p=>[p[0],p[2]]));
 for(const kind of kinds){
  const overlap=phase=>roofs.reduce((sum,roof)=>sum+surfaces[kind][phase].reduce((n,tri)=>n+area(intersection(tri,roof)),0),0);
  const previous=overlap('before'),remaining=overlap('after');
  assert(previous>.005,'Each of the four real contacts must exercise '+kind+' trimming: '+profile.id);
  assert(remaining<2e-5,'No '+kind+' remains buried beneath the exact high roof: '+profile.id+' / '+remaining);
  overlapBefore[kind]+=previous;
 }
}
for(const kind of kinds){
 const removed=surfaces[kind].before.reduce((n,t)=>n+area(t),0)-surfaces[kind].after.reduce((n,t)=>n+area(t),0);
 assert(Math.abs(removed-overlapBefore[kind])<1e-4,'Only the true covered footprint is removed; there is no wider radius cut');
}

const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),oldMesh=new THREE.Mesh(before.geometries.asphalt,material),newMesh=new THREE.Mesh(after.geometries.asphalt,material);
oldMesh.updateMatrixWorld(true);newMesh.updateMatrixWorld(true);
const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0)),path=before.paths[0].points;
let centerlineChecks=0;
for(let i=1;i<path.length;i++)for(const t of [0,.25,.5,.75,1]){
 const a=path[i-1],b=path[i];ray.ray.origin.set(a[0]+(b[0]-a[0])*t,10,a[2]+(b[2]-a[2])*t);
 const oldHit=ray.intersectObject(oldMesh,false)[0],newHit=ray.intersectObject(newMesh,false)[0];
 assert(oldHit&&newHit,'The centre of the road stays continuously paved past all four walls');
 assert(Math.abs(oldHit.point.y-newHit.point.y)<1e-6,'The road is not lifted onto a railway approach');
 centerlineChecks++;
}
for(const built of [before,after])for(const geometry of Object.values(built.geometries))geometry.dispose();material.dispose();
console.log('ROAD_GROUND_FOUNDATION_TRIM_PASS',JSON.stringify({contacts:fixture.groundSupports.length,centerlineChecks,overlapBefore,trim:after.stats.highFoundationTrim}));
