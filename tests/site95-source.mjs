import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {buildSite95} from '../src/site95.js';
import {SITE95_BUILDINGS,SITE95_VIEWS,site95Pixel} from '../src/site95-layout.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createSite95RoadGrade} from '../src/site95-road-grade.js';
import {createSite113RoadGrade} from '../src/site113-road-grade.js';
import {createCheckpoint7RoadGrade} from '../src/checkpoint7-road-grade.js';
const root=new THREE.Group(),built=buildSite95(root);let triangles=0,draws=0;
root.traverse(o=>{if(!o.isMesh)return;draws++;const p=o.geometry.attributes.position;for(const n of p.array)assert(Number.isFinite(n));triangles+=(o.geometry.index?.count||p.count)/3*(o.isInstancedMesh?o.count:1);});
assert.equal(SITE95_BUILDINGS.length,51);assert(triangles<100000);assert(draws<20);
for(const tag of ['window','canopy','heating-pipe','monument-shaft','ruin-end-wall'])assert(built.features['site95-'+tag]>0);
assert.equal(root.userData.site95Model.sourcePhotosPublished,false);assert.equal(root.userData.site95Model.windowLights,false);
assert.equal(ARCHIVE_MAP.filter(s=>s.id==='pad-95').length,1);assert.equal(ARCHIVE_MAP.find(s=>s.id==='pad-95').scale,.14);
for(const v of Object.values(SITE95_VIEWS))assert(new THREE.Vector3(...v.eye).distanceTo(new THREE.Vector3(...v.target))>20);
const [rx,rz]=site95Pixel([610,620]),ray=new THREE.Raycaster(new THREE.Vector3(rx,20,rz),new THREE.Vector3(0,-1,0));root.updateMatrixWorld(true);assert(ray.intersectObject(root,true).every(h=>h.point.y<1),'Ruin centre is open to the sky');
const catalog=JSON.parse(await readFile('data/catalog.json')),matches=JSON.parse(await readFile('data/osm/catalog-matches.json'));const site=createMuseumGeography({catalog,matches}).sites.find(s=>s.id==='pad-95');const anchor={x:(site.x-650)*3.4,z:(site.y-522.5)*3.4},grade=createSite95RoadGrade(anchor);
const bake=JSON.parse(gunzipSync(await readFile('data/osm/transport-geometry-bake-v1.json.gz'))),overlaps=[];
for(const r of bake.terrain.roads)for(let i=1;i<r.points.length;i++){
 const a=r.points[i-1],b=r.points[i];if(Math.min(a[0],b[0])>anchor.x+45||Math.max(a[0],b[0])<anchor.x-45||Math.min(a[2],b[2])>anchor.z+45||Math.max(a[2],b[2])<anchor.z-45)continue;
 const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/.15));
 for(let j=0;j<=n;j++){const x=(a[0]+(b[0]-a[0])*j/n-anchor.x)/.14,z=(a[2]+(b[2]-a[2])*j/n-anchor.z)/.14;
  for(const k of SITE95_BUILDINGS){const dx=x-k.position[0],dz=z-k.position[1],c=Math.cos(k.yaw),s=Math.sin(k.yaw),u=dx*c-dz*s,v=dx*s+dz*c;if(Math.hypot(Math.max(0,Math.abs(u)-k.length/2-.4),Math.max(0,Math.abs(v)-k.depth/2-1.4))<r.width/.28)overlaps.push([k.id,r.id]);}
 }
}
assert.deepEqual([...new Set(overlaps.map(JSON.stringify))],[],'All long road segments clear buildings and entrances');
assert.equal(grade.heightAt(anchor.x,anchor.z,.72),-2.73);assert.equal(grade.heightAt(anchor.x+100,anchor.z,.72),.72);
const samples=grade.conform([new THREE.Vector3(anchor.x-60,.72,anchor.z),new THREE.Vector3(anchor.x+60,.72,anchor.z)]);for(let i=1;i<samples.length;i++)assert(Math.abs(samples[i].y-samples[i-1].y)<.3);
for(const p of samples)assert.equal(grade.heightAt(p.x,p.z,p.y),p.y,'Cached grade is idempotent');
const checkpoint=createCheckpoint7RoadGrade({position:[-125,.72,913],roadAxis:[[-125,.72,1002],[-125,.72,824]],roadWidth:3.6,yaw:0,scale:.14});const prior=createSite113RoadGrade({x:0,z:0}).withCheckpoint(checkpoint),composed=grade.compose(prior);
assert.equal(composed.version,prior.version);assert.equal(composed.isBaked(bake),prior.isBaked(bake));assert.equal(composed.cachedGrade.widthScale('172571792'),1);assert.equal(composed.cachedGrade.conform([new THREE.Vector3(anchor.x,.72,anchor.z)])[0].y,-2.73);
console.log('SITE95_SOURCE_PASS',JSON.stringify({draws,triangles,buildings:51,windowOpenings:built.features['site95-window']+built.features['site95-end-window']}));
