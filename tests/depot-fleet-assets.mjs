import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {DEPOT_PLACEMENT,createKosmotransDepot} from '../src/kosmotrans-depot.js';
import {ROAD_FLEET} from '../src/road-fleet.js';
const read=p=>JSON.parse(fs.readFileSync(p));
for(const id of ['kosmotrans-depot',...Object.keys(ROAD_FLEET).map(id=>'road-fleet/'+id)]){
 const base='assets/models/'+id+'/',m=read(base+'manifest.json'),bytes=fs.readFileSync(base+'model.glb');
 assert.equal(bytes.length,m.asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),m.asset.sha256);assert(bytes.length<1500000);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert(!JSON.stringify(json).match(/"uri":"https?:/));assert(m.asset.triangles<=55000);
 if(id!=='kosmotrans-depot'){assert.equal(m.wheels.length,4);for(const w of m.wheels)assert(json.nodes.some(n=>n.name===w.name));assert.equal(m.forward,'+Z');}
}
const parent=new THREE.Group(),clickable=[],source=()=>({scene:new THREE.Group(),manifest:read('assets/models/kosmotrans-depot/manifest.json')});
const depot=createKosmotransDepot({parent,clickable,index:17,loadSource:async()=>source()});
assert.equal(await depot.load(),true);assert.equal(await depot.load(),true);assert.equal(depot.stats().instances,1);assert.equal(clickable[0].userData.idx,17);
// The entire rectangle is west of the main AD and clear of every cached road.
const bounds=new THREE.Box3().setFromObject(depot.root),bake=JSON.parse(gunzipSync(fs.readFileSync('data/osm/transport-geometry-bake-v1.json.gz')));
let gap=Infinity,nearest=null;
for(const road of bake.roads){for(let i=1;i<road.points.length;i++){
 const a=road.points[i-1],b=road.points[i],len=Math.hypot(b[0]-a[0],b[2]-a[2]);
 for(let j=0;j<=Math.ceil(len);j++){const t=j/(Math.ceil(len)||1),x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;
 const d=Math.hypot(Math.max(bounds.min.x-x,0,x-bounds.max.x),Math.max(bounds.min.z-z,0,z-bounds.max.z))-(road.width||2)/2;
 if(d<gap){gap=d;nearest=road.id;}
 }}
}
assert(gap>2,'Depot apron overlaps road: '+nearest+' gap='+gap);assert(DEPOT_PLACEMENT.map[0]<573);
const runtime=fs.readFileSync('src/road-vehicles.js','utf8');assert(!runtime.includes('function createCar('));assert(!runtime.includes("type==='sedan'"));
console.log('DEPOT_FLEET_ASSETS_PASS',JSON.stringify({roadClearance:gap,nearest,depot:depot.stats()}));
