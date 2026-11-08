import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {ROAD_FLEET_VERSION,ROAD_FLEET,roadFleetKind,cloneRoadFleetSource,createRoadFleetVehicle} from '../src/road-fleet.js';

function fixture(id){
 const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:0xeeeeee});
 scene.add(new THREE.Mesh(new THREE.BoxGeometry(1.8,1,4),material));
 const wheels=[[-.85,.3,-1.2],[.85,.3,-1.2],[-.85,.3,1.2],[.85,.3,1.2]].map((center,i)=>{
  const wheel=new THREE.Mesh(new THREE.SphereGeometry(.3,8,6),material);wheel.name='wheel-'+i;wheel.position.fromArray(center);scene.add(wheel);
  return {name:wheel.name,center,radius:.3};
 });
 return {scene,manifest:{version:ROAD_FLEET_VERSION,id,paint:ROAD_FLEET[id].paint,unit:'metre',forward:'+Z',bounds:{size:[1.8,1,4]},halfWidth:1.05,wheels,
  lights:[{position:[-.7,.8,2],kind:'head'},{position:[.7,.8,2],kind:'head'},{position:[-.7,.8,-2],kind:'tail'},{position:[.7,.8,-2],kind:'tail'}],asset:{triangles:400,bytes:1}}};
}
const parent=new THREE.Group(),source=fixture('uaz-patriot');
const a=cloneRoadFleetSource(source,'uaz-patriot'),b=cloneRoadFleetSource(source,'uaz-patriot');
assert.equal(a.scene.children[0].geometry,b.scene.children[0].geometry,'Instances share geometry');
assert.notEqual(a.scene.children[0].material,b.scene.children[0].material,'Fade must not leak between instances');
assert.equal(a.scene.children[0].material.color.getHex(),source.scene.children[0].material.color.getHex(),'Patriot keeps source paint');
let calls=0,fail=true;
const vehicle=createRoadFleetVehicle(parent,'uaz-patriot',{loadSource:async()=>{calls++;if(fail)throw Error('offline');return cloneRoadFleetSource(source,'uaz-patriot');}});
const pose={position:new THREE.Vector3(3,2,4),tangent:new THREE.Vector3(0,0,1),distance:12,direction:1,opacity:1};
vehicle.update(pose,true);assert.equal(vehicle.root.visible,false,'No abstract car while downloading');
assert.equal(await vehicle.loadDetail(),false);assert.equal(vehicle.sourceState.status,'error');fail=false;
const results=await Promise.all([vehicle.loadDetail(),vehicle.loadDetail()]);assert.deepEqual(results,[true,true]);assert.equal(calls,2,'Concurrent loads share work, failed load can retry');
assert.equal(vehicle.root.visible,true);assert.equal(vehicle.wheels.length,4);assert.equal(vehicle.halfWidth,1.05);
assert.deepEqual(vehicle.root.position.toArray(),[3,2,4]);assert.equal(vehicle.wheels[0].rotation.x,40);
vehicle.root.scale.setScalar(.2);vehicle.update(pose,true);assert.equal(vehicle.wheels[0].rotation.x,200,'Wheel motion respects map scale');
vehicle.update({...pose,opacity:.5,direction:-1},false);assert.equal(vehicle.wheels[0].rotation.x,-200);
const body=vehicle.root.getObjectsByProperty('isMesh',true)[0];assert.equal(body.material.opacity,.5);assert.equal(source.scene.children[0].material.opacity,1);
vehicle.update({...pose,opacity:0},false);assert.equal(vehicle.root.visible,false,'Respawn stays invisible');
vehicle.update({...pose,tangent:new THREE.Vector3(1,.2,0).normalize()},true);assert.ok(vehicle.root.rotation.x<0);assert.equal(vehicle.root.rotation.y,Math.PI/2);
assert.deepEqual(Array.from({length:6},(_,i)=>roadFleetKind(i)),['land-cruiser','uaz-patriot','uaz-bukhanka','land-cruiser','uaz-patriot','uaz-bukhanka']);
const broken=fixture('land-cruiser');broken.scene.remove(broken.scene.getObjectByName('wheel-3'));
const bad=createRoadFleetVehicle(parent,'land-cruiser',{loadSource:async()=>broken});assert.equal(await bad.loadDetail(),false);assert.equal(bad.root.children.length,0);
for(const file of ['src/model-catalog.js','data/encyclopedia.json'])if(fs.existsSync(file)){
 const text=fs.readFileSync(file,'utf8');for(const id of Object.keys(ROAD_FLEET))assert.ok(!text.includes(id),'Road cars stay outside catalogue: '+id);
}
console.log('ROAD_FLEET_RUNTIME_PASS (fixture assets only; source models still required)');
