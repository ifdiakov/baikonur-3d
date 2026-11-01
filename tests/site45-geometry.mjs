import assert from 'node:assert/strict';
import {Group,Box3,Vector3,Raycaster} from 'three';
import {buildSite45} from '../src/site45.js';
import {createZenitRocket} from '../src/zenit-rocket.js';
import {modelsForObject,MODEL_CATALOG} from '../src/model-catalog.js';
import {FACILITY_PORTS} from '../src/facility-ports.js';
const root=new Group(),built=buildSite45(root,{rocket:false}),meta=root.userData.site45Model;
root.updateMatrixWorld(true);
assert.equal(meta.referenceImageCount,10);assert.equal(meta.physical.planSurveyed,false);
assert.deepEqual(meta.railPort,[0,.65,145]);assert.deepEqual(meta.roadPort,[78,.1,128]);
assert.equal(root.userData.railProfiles[0].gauge,1.52);
assert.equal(built.cutouts.length,1);assert.deepEqual(built.cutouts[0],{x:0,z:-29,rx:7.2,rz:41,yaw:0,shape:'rectangle'});
const hit=(x,z)=>new Raycaster(new Vector3(x,20,z),new Vector3(0,-1,0)).intersectObject(root,true)[0]?.point.y;
assert(hit(0,0)<2,'Round launch aperture must be genuinely open through the deck');
assert(Math.abs(hit(4,0)-4.2)<1e-5,'Surrounding deck is solid');
assert(Math.abs(hit(0,-25)+16)<1e-5,'Open channel reaches its recessed floor');
assert(hit(0,-65)>hit(0,-40),'Outlet rises along the long ramp');
assert(Math.abs(hit(.76,144.95)-.65)<.02,'Museum rail port connects at the established head height');
// Check the declared incoming direction against the actual model pavement.
// Matching a connection to its own port metadata would miss a sideways join.
const roadSpec=FACILITY_PORTS['pad-45'],roadGate=new Vector3(...meta.roadPort);
const roadInward=new Vector3(...(roadSpec.roadOutward??[0,0,1])).negate();
const roadAcross=new Vector3(-roadInward.z,0,roadInward.x);
for(const distance of [.1,.5,1])for(const side of [-1,0,1]){
 const p=roadGate.clone().addScaledVector(roadInward,distance).addScaledVector(roadAcross,side*(roadSpec.roadWidth/2-.1));
 assert(Math.abs(hit(p.x,p.z)-roadGate.y)<1e-5,'Site 45 driveway must continue straight into the visible road across its full width: '+p.toArray());
}
const roadInside=roadGate.clone().addScaledVector(roadInward,12);
assert(Math.abs(hit(roadInside.x,roadInside.z)-roadGate.y)<1e-5,'The driveway continues into the model beyond the seam');
const lights=root.userData.facilityLighting;
assert.equal(lights.boards.length,4);assert.equal(lights.boards.reduce((n,b)=>n+b.lamps.length,0),80);assert.equal(lights.beacons.length,9);
assert.equal(meta.components['curved-steel-deflector'],24);assert.equal(meta.components['folded-white-erector-arm'],1);
let triangles=0,meshes=0;root.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);for(const name of ['position','normal'])for(const n of o.geometry.attributes[name].array)assert(Number.isFinite(n));});
assert(meshes<32&&triangles<110000,'Complex remains batched for the museum');
const rocket=createZenitRocket({variant:'land',textures:false,detail:'far'}),bounds=new Box3().setFromObject(rocket.root);
assert(Math.abs(bounds.max.y-58.7)<.005);assert(Math.abs(bounds.min.y)<1e-5);assert.equal(rocket.stats().dimensions.fairingDiameter,4.10);
rocket.setExploded(1);rocket.setExploded(0);assert.deepEqual(new Box3().setFromObject(rocket.root).max.toArray(),bounds.max.toArray());rocket.dispose();
assert.deepEqual(modelsForObject({id:'pad-45'}),['zenit-land','site45','zenit-sea']);
for(const id of ['pad-1','pad-31','pad-110','pad-112','pad-251','airfield','city'])assert(modelsForObject({id}).every(id=>MODEL_CATALOG[id]));
console.log('SITE45_GEOMETRY_OK',JSON.stringify({meshes,triangles,aperture:hit(0,0),floor:hit(0,-25),railHead:hit(.76,144.95),fixtures:80,beacons:9}));
