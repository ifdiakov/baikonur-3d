import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {buildExtendedTerrain,LARGE_TERRAIN_SEGMENTS} from '../src/terrain-extent.js';
import {TRANSPORT_GROUND_Y,ROAD_SURFACE_Y} from '../src/transport-ground-profile.js';

// Canvas only supplies the existing generated RGBA maps. Geometry, materials,
// world transforms and intersections below use the production constructor.
const beforeDocument=globalThis.document;
globalThis.document={createElement(name){
 assert.equal(name,'canvas');const canvas={width:0,height:0};
 canvas.getContext=()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{canvas.pixels=image.data;}});
 return canvas;
}};
const scene=new THREE.Scene(),registered=[];
let outer;
try{outer=buildExtendedTerrain({scene,registerGroundSurface:mesh=>registered.push(mesh),satelliteOwnsGroundColor:true});}
finally{if(beforeDocument===undefined)delete globalThis.document;else globalThis.document=beforeDocument;}
assert.equal(registered.length,2);
assert.deepEqual(outer.planes.map(p=>p.geometry.parameters.width),[52000,18000]);
assert.deepEqual(outer.planes.map(p=>[p.material.map.image.width,p.material.map.image.height]),[[512,512],[768,768]]);
for(const [i,plane] of outer.planes.entries()){
 assert.equal(plane.position.y,TRANSPORT_GROUND_Y);
 assert.equal(plane.geometry.index.count/3,2*LARGE_TERRAIN_SEGMENTS**2);
 assert.equal(plane.material.depthWrite,false);assert.equal(plane.material.transparent,true);
 assert.equal(plane.material.polygonOffset,true);assert.equal(plane.material.polygonOffsetFactor,-1);assert.equal(plane.renderOrder,i);
 const {pixels,width,height}=plane.material.map.image;
 assert.equal(pixels[3],0,'Original outer alpha fade remains transparent');
 const center=(Math.floor(height/2)*width+Math.floor(width/2))*4;
 assert.deepEqual([...pixels.slice(center,center+4)],[161,136,109,255],'Shared surrounding RGB and opaque centre are preserved');
}
const main=new THREE.Mesh(new THREE.PlaneGeometry(320000,320000,16,16),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
main.name='main';main.rotation.x=-Math.PI/2;main.position.y=TRANSPORT_GROUND_Y;scene.add(main);
const satellite=new THREE.Mesh(new THREE.PlaneGeometry(4420,3553),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));
satellite.rotation.x=-Math.PI/2;satellite.position.y=TRANSPORT_GROUND_Y;satellite.renderOrder=2;scene.add(satellite);scene.updateMatrixWorld(true);
const soils=[main,...outer.planes,satellite],ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);let probes=0;
function groundAt(x,z){
 ray.set(new THREE.Vector3(x,50,z),down);const hits=ray.intersectObjects(soils,false);assert(hits.length,'Missing real soil');
 for(const hit of hits)assert(Math.abs(hit.point.y-TRANSPORT_GROUND_Y)<1e-7,'Image layers must share a physical datum');
 probes++;return hits[0].point.y;
}
// The browser found this defect just beyond the central image rectangle.
for(const [x,z] of [[2311.570475,1353.470459],[2394.115234,1403.491984],[2694.708740,-975.987040],[2210.377116,-817.680196]])
 assert(Math.abs((ROAD_SURFACE_Y-groundAt(x,z))-.025)<1e-7);
for(const side of [-1,1])for(const edge of [2210,4680,9000,9880,26000])for(const offset of [-.01,.01])groundAt(side*(edge+offset),side===1?928.580252:-723.401395);
const bake=JSON.parse(gunzipSync(await readFile(new URL('../data/osm/transport-geometry-bake-v1.json.gz',import.meta.url))));
assert.equal(bake.extensions.length,2);let beyondIntermediate=0,beyondRegional=0;
for(const route of bake.extensions)for(const p of route.points){
 if(Math.abs(p[0])>9000)beyondIntermediate++;if(Math.abs(p[0])>26000)beyondRegional++;
 for(const offset of [0,-route.width/2-.15,route.width/2+.15]){
  const soil=groundAt(p[0],p[2]+offset);
  assert(Math.abs((p[1]+(offset===0?.006:-.015)-soil)-(offset===0?.031:.010))<1e-7,'Highway and shoulder remain grounded across the outer layer boundaries');
 }
}
assert(beyondIntermediate>0&&beyondRegional>0,'The actual long highway tails must be covered');
for(const name of ['index.html','museum.html','workshop.html']){
 const html=await readFile(new URL('../'+name,import.meta.url),'utf8');
 assert(html.includes('ground.position.y=TRANSPORT_GROUND_Y;'),name+' main ground');
 assert(html.includes('satelliteGround.position.y=TRANSPORT_GROUND_Y;'),name+' central ground');
}
console.log('EXTENDED_TERRAIN_GROUND_PASS',JSON.stringify({probes,extensions:bake.extensions.length,beyondIntermediate,beyondRegional,groundY:TRANSPORT_GROUND_Y,intermediateTriangles:outer.planes[1].geometry.index.count/3}));
