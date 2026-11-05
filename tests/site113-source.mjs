import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {buildSite113} from '../src/site113.js';
import {SITE113_BUILDINGS,SITE113_VIEWS,site113Pixel} from '../src/site113-layout.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
const root=new THREE.Group(),built=buildSite113(root);let triangles=0,draws=0;
root.traverse(o=>{if(!o.isMesh)return;draws++;const p=o.geometry.attributes.position;for(let i=0;i<p.array.length;i++)assert(Number.isFinite(p.array[i]));triangles+=(o.geometry.index?.count||p.count)/3*(o.isInstancedMesh?o.count:1);});
assert.equal(SITE113_BUILDINGS.length,24);assert(built.features['site113-balcony-slab']>100);assert(built.features['site113-heating-pipe']>0);
assert(triangles<90000);assert(draws<20);assert(built.boundsSize[1]<20);
const ray=new THREE.Raycaster(new THREE.Vector3(...[...site113Pixel([919,340]).slice(0,1),20,site113Pixel([919,340])[1]]),new THREE.Vector3(0,-1,0));
root.updateMatrixWorld(true);const hits=ray.intersectObject(root,true);assert(hits.some(h=>h.point.y>5&&h.point.y<7),'The shell is an actual curved roof above a low stage');
assert.equal(ARCHIVE_MAP.filter(s=>s.id==='pad-113').length,1);assert.equal(ARCHIVE_MAP.find(s=>s.id==='pad-113').scale,.14);
for(const v of Object.values(SITE113_VIEWS))assert(new THREE.Vector3(...v.eye).distanceTo(new THREE.Vector3(...v.target))>20);
assert.equal(root.userData.site113Model.windowLights,false,'Abandoned blocks have no invented lit apartments');
const index=await readFile(new URL('../index.html',import.meta.url),'utf8');assert(index.includes("get('view')==='site113'"));assert(index.includes('data-site113-view')||index.includes('dataset.site113View'));
assert.doesNotThrow(()=>JSON.stringify(built));console.log('SITE113_SOURCE_PASS',JSON.stringify({draws,triangles,buildings:25,windows:built.features['site113-window-opening']}));

// Verify balcony clearance against the existing displayed street centreline,
// including the spaces between the cached samples rather than just their ends.
const {gunzipSync}=await import('node:zlib');
const {createMuseumGeography}=await import('../src/osm-geography.js');
const {createSite113RoadGrade}=await import('../src/site113-road-grade.js');
const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url)));
const matches=JSON.parse(await readFile(new URL('../data/osm/catalog-matches.json',import.meta.url)));
const site=createMuseumGeography({catalog,matches}).sites.find(s=>s.id==='pad-113');
const anchor={x:(site.x-650)*3.4,z:(site.y-522.5)*3.4},grade=createSite113RoadGrade(anchor);
const bake=JSON.parse(gunzipSync(await readFile(new URL('../data/osm/transport-geometry-bake-v1.json.gz',import.meta.url))));
const overlaps=[];
for(const road of bake.terrain.roads){
 const w=road.width/.28*(grade.isBaked(bake)?1:grade.widthScale(road.id))+.3;
 for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i];
  if(Math.min(a[0],b[0])>anchor.x+15||Math.max(a[0],b[0])<anchor.x-45||Math.min(a[2],b[2])>anchor.z+45||Math.max(a[2],b[2])<anchor.z-15)continue;
  const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/.2));
  for(let j=0;j<=n;j++){
   const x=(a[0]+(b[0]-a[0])*j/n-anchor.x)/.14,z=(a[2]+(b[2]-a[2])*j/n-anchor.z)/.14;
   for(const block of SITE113_BUILDINGS){const dx=x-block.position[0],dz=z-block.position[1];
    if(Math.hypot(Math.max(0,Math.abs((dx-dz)*Math.SQRT1_2)-block.length/2-.2),Math.max(0,Math.abs((dx+dz)*Math.SQRT1_2)-block.depth/2-1.4))<w)overlaps.push([block.id,road.id]);
   }
  }
 }
}
assert.deepEqual([...new Set(overlaps.map(JSON.stringify))],[],'Roads must clear the walls and balconies');
assert.equal(grade.heightAt(anchor.x,anchor.z,.72),-2.73);
assert.equal(grade.heightAt(anchor.x+100,anchor.z,.72),.72);
const samples=grade.conform([new THREE.Vector3(anchor.x-60,.72,anchor.z),new THREE.Vector3(anchor.x+30,.72,anchor.z)]);
assert(samples.length>100);for(let i=1;i<samples.length;i++)assert(Math.abs(samples[i].y-samples[i-1].y)<.3,'No vertical road step at the edge');
const {createRoadLOD}=await import('../src/road-lod.js');
const source={points:[[anchor.x-2,.72,anchor.z],[anchor.x+2,.72,anchor.z]],w:1.6};
const lod=createRoadLOD({data:{version:'road-lod-prebuilt-v1',levels:{far:{roads:[source],rails:[]},medium:{roads:[source],rails:[]}}},scene:new THREE.Scene(),roadGrade:grade});
lod.root.traverse(mesh=>{if(mesh.userData.roadKind==='roads'){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)assert(Math.abs(p.getY(i)+2.73)<1e-5);}});lod.destroy();
console.log('SITE113_ROAD_GRADE_PASS');
// The route-only cache may precede the checkpoint flattening. Applying the
// composed display grade must preserve the already-approved ground-level КПП.
const {restoreBakedTransport}=await import('../src/transport-bake.js');
const {createCheckpoint7RoadGrade}=await import('../src/checkpoint7-road-grade.js');
const checkpoint=createCheckpoint7RoadGrade({position:[-125,.72,913],roadAxis:[[-125,.72,1002],[-125,.72,824]],roadWidth:3.6,yaw:0,scale:.14});
const composed=grade.withCheckpoint(checkpoint);
const restored=restoreBakedTransport({bake,layers:{roads:new THREE.Group(),rails:new THREE.Group()},roadGrade:composed});
const route=restored.roadPaths().find(r=>r.osmWayIds?.includes('173082916'));assert(route);
const near=[];for(let s=0;s<=route.length;s+=.5){const p=route.position(s);if(Math.abs(p.z-913)<2)near.push(p);}assert(near.length);for(const p of near)assert(Math.abs(p.y+2.73)<.001,'Cached checkpoint road stays on the flat ground');
console.log('SITE113_CHECKPOINT_CACHE_PASS');

// Auto-rebuilding the route cache must not narrow roads or grade ramps twice.
assert(grade.isBaked({displayGradeVersion:grade.version}));
assert(grade.isBaked({editable:[{id:'osm-road-172571792',width:.9}]}));
assert(!grade.isBaked({editable:[{id:'osm-road-172571792',width:2}]}));
const pregraded=structuredClone(bake);pregraded.displayGradeVersion=grade.version;
const sample=pregraded.roads[0];sample.width=.9;sample.points[0][1]=-1.234;
const again=restoreBakedTransport({bake:pregraded,layers:{roads:new THREE.Group(),rails:new THREE.Group()},roadGrade:composed});
assert.equal(again.roadPaths()[0].width,.9);assert.equal(again.roadPaths()[0].points[0].y,-1.234);
console.log('SITE113_CACHE_IDEMPOTENCE_PASS');
