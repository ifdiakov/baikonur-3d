import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {groundRoadEdits,createRoadGroundContact} from '../src/road-ground-contact.js';
import {sampleEditedRoad,buildEditedRoadMeshes} from '../src/road-editor-mesh.js';
import {projectOsm,MUSEUM_DISPLAY_OFFSETS} from '../src/osm-geography.js';
import {SATURN_ACCESS,SATURN_TERRAIN_BOUNDS,saturnTerrainMeshHeight} from '../src/saturn-access.js';
import {TRANSPORT_GROUND_Y,ROAD_SURFACE_Y,ROAD_SURFACE_CLEARANCE} from '../src/transport-ground-profile.js';
import {buildTransportGroundSupport} from '../src/transport-ground-support.js';

const read=name=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url)));
const owner=read('data/road-edits-authoritative-20261103.json'),match=read('data/osm/catalog-matches.json').matches.find(m=>m.siteId==='pad-23');
const [mx,mz]=projectOsm(...match.representativeLonLat),[ox,oz]=MUSEUM_DISPLAY_OFFSETS['pad-23'];
const cx=(mx+ox-650)*3.4,cz=(mz+oz-522.5)*3.4;
const terrain=(x,z)=>{
 const xx=(x-cx)/SATURN_ACCESS.scale,zz=(z-cz)/SATURN_ACCESS.scale,b=SATURN_TERRAIN_BOUNDS;
 if(xx<b.minX||xx>b.maxX||zz<b.minZ||zz>b.maxZ)return TRANSPORT_GROUND_Y;
 return Math.max(TRANSPORT_GROUND_Y,SATURN_ACCESS.elevation+SATURN_ACCESS.scale*saturnTerrainMeshHeight(xx,zz));
};
const road=groundRoadEdits(owner,[],terrain).added.find(r=>r.id==='road-31');
const previous=sampleEditedRoad(road,{terrainHeightAt:terrain}),contact=createRoadGroundContact([],terrain);
assert(Math.max(...previous.map(p=>p[1]-terrain(p[0],p[2])))>5,'The real four-point Saturn fixture must reproduce the floating approach');
const grounded=sampleEditedRoad(road,{terrainHeightAt:terrain,groundContact:contact});
assert.deepEqual(grounded.map(p=>[p[0],p[2]]),previous.map(p=>[p[0],p[2]]),'Grounding must retain every approved sampled X/Z');
assert.deepEqual(grounded.at(-1),road.points.at(-1),'The physical Saturn gate threshold remains exact');
const gaps=grounded.map(p=>p[1]-terrain(p[0],p[2]));
assert(Math.min(...gaps)>=ROAD_SURFACE_CLEARANCE-1e-8);
assert(Math.max(...gaps)<.06,'No suspended segment remains between the four saved anchors');

const built=buildEditedRoadMeshes([road],{terrainHeightAt:terrain,followTerrain:true});
let checked=0,minGap=Infinity,maxGap=-Infinity;
for(const kind of ['asphalt','shoulder']){
 const geometry=built.geometries[kind],p=geometry.attributes.position,index=geometry.index;
 for(let i=0;i<(index?.count??p.count);i+=3){
  const tri=[0,1,2].map(k=>{const j=index?index.getX(i+k):i+k;return [p.getX(j),p.getY(j),p.getZ(j)];});
  const samples=[...tri,...tri.map((a,j)=>a.map((v,k)=>(v+tri[(j+1)%3][k])/2)),tri[0].map((_,k)=>tri.reduce((n,v)=>n+v[k],0)/3)];
  for(const [sampleIndex,v]of samples.entries()){const gap=v[1]-terrain(v[0],v[2]);minGap=Math.min(minGap,gap);maxGap=Math.max(maxGap,gap);checked++;
   assert(gap>=-.004,'A terrain facet cuts through the '+kind+' interior: '+JSON.stringify({point:v,gap,sampleIndex,tri}));
   assert(gap<.085,'A terrain facet leaves a suspended '+kind+' interior: '+JSON.stringify({point:v,gap}));
  }
 }
}
assert(built.stats.terrainTriangleSplits>0,'The regression exercises intermediate terrain-facet contact');

// The remaining raised endpoints belong to physical model aprons. Their road
// profile stays intact, with an actual soil body underneath the short join.
const flat=()=>TRANSPORT_GROUND_Y,port={id:'model-port',surface:'asphalt',width:3,points:[[0,TRANSPORT_GROUND_Y+.105,0],[25,ROAD_SURFACE_Y,0]]};
const portBuilt=buildEditedRoadMeshes([port],{terrainHeightAt:flat,followTerrain:true});
assert(portBuilt.geometries.support.attributes.position.count>0,'A raised model threshold needs physical ground support');
assert.equal(portBuilt.paths[0].points[0][1],port.points[0][1]);
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),support=new THREE.Mesh(portBuilt.geometries.support,material);support.updateMatrixWorld(true);
const ray=new THREE.Raycaster(new THREE.Vector3(.2,2,0),new THREE.Vector3(0,-1,0));
const hit=ray.intersectObject(support,false)[0];assert(hit,'The port transition is physically supported beneath the pavement');
assert(hit.point.y>TRANSPORT_GROUND_Y+.05);
const capRay=new THREE.Raycaster(new THREE.Vector3(-.8,2,.4),new THREE.Vector3(0,-1,0));
const capAsphalt=new THREE.Mesh(portBuilt.geometries.asphalt,material);capAsphalt.updateMatrixWorld(true);
const capTop=capRay.intersectObject(capAsphalt,false)[0],capSoil=capRay.intersectObject(support,false)[0];
assert(capTop&&capSoil,'The final rounded apron needs earth beyond the centreline-based support footprint');
assert(Math.abs(capTop.point.y-capSoil.point.y-.022)<1e-6,'The support top follows the final apron, including its cap');
for(const p of portBuilt.paths[0].points)if(p[0]>9)assert(Math.abs(p[1]-ROAD_SURFACE_Y)<1e-8,'The preserved threshold does not lift an entire long segment');
const lowPort={...port,id:'low-port',points:[[0,TRANSPORT_GROUND_Y+.01,0],[25,ROAD_SURFACE_Y,0]]};
const lowBuilt=buildEditedRoadMeshes([lowPort],{terrainHeightAt:flat,followTerrain:true});
const lowMesh=new THREE.Mesh(lowBuilt.geometries.asphalt,material);lowMesh.updateMatrixWorld(true);
const lowHit=ray.intersectObject(lowMesh,false)[0];assert(lowHit&&lowHit.point.y<TRANSPORT_GROUND_Y+.023,'Terrain refinement must not raise a legitimate low model threshold');

const deckY=ROAD_SURFACE_Y+5.8,bridge={id:'bridge',tags:{bridge:'yes'},width:4,points:[[0,deckY,0],[20,deckY,0]]};
const overlay={id:'bridge-overlay',surface:'asphalt',width:3,points:[[2,deckY,0],[18,deckY,0]]};
const bridgeBuilt=buildEditedRoadMeshes([overlay],{terrainHeightAt:flat,existingRoads:[bridge],followTerrain:true});
assert(bridgeBuilt.paths[0].points.every(p=>Math.abs(p[1]-deckY)<1e-8),'A real bridge keeps its elevated deck');
assert.equal(bridgeBuilt.geometries.support.attributes.position.count,0,'A bridge span must remain open underneath');

// A narrow, real railway foundation can cross a road triangle between its
// original vertices. The road shoulder must meet that soil, not be buried in
// it; this is the pad-45 type of contact found in the final cache ray checks.
const railFoundation=[{id:'rail-port-crossing',width:.448,points:[[0,-2.713627,-2],[0,-2.713627,2]]}];
const crossingRoad={id:'road-crossing',surface:'ground',width:1.5,points:[[-2,ROAD_SURFACE_Y,0],[2,ROAD_SURFACE_Y,0]]};
const foundationBefore=JSON.stringify(railFoundation),crossingBefore=JSON.stringify(crossingRoad);
const crossingBuilt=buildEditedRoadMeshes([crossingRoad],{terrainHeightAt:flat,groundSupports:railFoundation,followTerrain:true});
assert.equal(JSON.stringify(railFoundation),foundationBefore);assert.equal(JSON.stringify(crossingRoad),crossingBefore);
const foundation=buildTransportGroundSupport({profiles:railFoundation,heightAt:flat}).mesh;
const crossingShoulder=new THREE.Mesh(crossingBuilt.geometries.shoulder,material);
foundation.updateMatrixWorld(true);crossingShoulder.updateMatrixWorld(true);
const crossingRay=new THREE.Raycaster(new THREE.Vector3(.17,2,.1),new THREE.Vector3(0,-1,0));
const foundationTop=crossingRay.intersectObject(foundation,false)[0],shoulderTop=crossingRay.intersectObject(crossingShoulder,false)[0];
assert(foundationTop&&shoulderTop);
const crossingGap=shoulderTop.point.y-foundationTop.point.y;
assert(crossingGap>=.006&&crossingGap<=.014,'The road shoulder follows the actual narrow rail-foundation top: '+crossingGap);
const crossingSoil=new THREE.Mesh(crossingBuilt.geometries.support,material);crossingSoil.updateMatrixWorld(true);
const transitionRay=new THREE.Raycaster(new THREE.Vector3(.4,2,.1),new THREE.Vector3(0,-1,0));
const transitionTop=transitionRay.intersectObject(crossingShoulder,false)[0],transitionSoil=transitionRay.intersectObject(crossingSoil,false)[0];
assert(transitionTop&&transitionSoil,'The short transition outside the exact rail footprint has real earth underneath');
assert(Math.abs(transitionTop.point.y-transitionSoil.point.y-.001)<1e-6);
transitionRay.ray.origin.x=.7;
assert(Math.abs(transitionRay.intersectObject(crossingShoulder,false)[0].point.y-(TRANSPORT_GROUND_Y+.01))<.004,
 'The foundation transition stays within one shoulder rather than raising the surrounding road');
const highFoundation=railFoundation.map(p=>({...p,points:p.points.map(q=>[q[0],.5257,q[2]])}));
const separateLevel=buildEditedRoadMeshes([crossingRoad],{terrainHeightAt:flat,groundSupports:highFoundation,followTerrain:true});
assert(separateLevel.paths[0].points.every(p=>p[1]===ROAD_SURFACE_Y),
 'An incompatible high railway bed is a separate physical crossing, not a new terrain datum for the road');
foundation.geometry.dispose();foundation.material.dispose();
for(const group of [built,portBuilt,lowBuilt,bridgeBuilt,crossingBuilt,separateLevel])for(const geometry of Object.values(group.geometries))geometry.dispose();material.dispose();
console.log('ROAD_GROUND_SURFACE_PASS',JSON.stringify({samples:grounded.length,checked,minGap,maxGap,terrainSplits:built.stats.terrainTriangleSplits}));
