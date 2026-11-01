import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMig25RU} from '../src/mig25-aircraft.js';
import {inspectionBounds,disposeInspectionModel} from '../src/inspection-models.js';
import {modelsForObject,MODEL_CATALOG} from '../src/model-catalog.js';
const m=createMig25RU(),root=m.root,stats=m.stats();
const ray=(origin,direction)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,40).intersectObjects(root.children,true).filter(h=>{for(let o=h.object;o;o=o.parent)if(!o.visible)return false;return true;});
root.updateMatrixWorld(true);
const dimensions=inspectionBounds(root).getSize(new THREE.Vector3());
assert(dimensions.x>14&&dimensions.x<14.2);assert(dimensions.z>22&&dimensions.z<23);assert(dimensions.y>6&&dimensions.y<6.4);
assert.equal(stats.type,'МиГ-25РУ');assert.equal(stats.boardNumber,'32');assert.equal(stats.canopies.length,2);
const front=ray([0,10,7.27],[0,-1,0])[0],rear=ray([0,10,4.75],[0,-1,0])[0];
assert.match(front.object.material.name,/остекление/);assert.match(rear.object.material.name,/остекление/);assert(rear.point.y-front.point.y>.6,'Tandem rear cockpit is visibly raised');
for(const side of [-1,1]){
 for(const [u,y]of [[.17,.4],[.415,.185],[.76,-.09]]){const mark=ray([side*5,y,5.8-side*(u-.5)],[-side,0,0])[0];assert.match(mark.object.material.name,/красные опознавательные/,'Painted numbers follow the curved nose without sinking into it');}
 const intake=ray([side*1.46,-.22,5],[0,0,-1])[0];assert.match(intake.object.material.name,/каналы/);assert(intake.point.z<1.7,'Intake has a recessed throat, not a black cap at the lip');
 const exhaust=ray([side*.98,-.13,-13],[0,0,1])[0];assert.match(exhaust.object.material.name,/каналы/);assert(exhaust.point.z>-9.7,'Nozzle opening remains hollow beyond the outer petal ring');
 const wing=ray([side*5.2,10,-3.5],[0,-1,0])[0];assert(wing.point.y>.9&&wing.point.y<1.2,'Thin wing is high-mounted');
 const body=ray([side*5,0,7.8],[-side,0,0])[0];assert(body.point.x*side>.4&&body.point.x*side<.7,'Forward fuselage faces outward');
 const fin=ray([side*5,2.4,-8.2],[-side,0,0])[0];assert(fin.point.x*side>1.4&&fin.point.x*side<1.6,'Twin fins have outward cant');
}
let draws=0,triangles=0;const textures=new Set();root.traverse(o=>{if(!o.isMesh)return;draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;for(const n of o.geometry.attributes.position.array)assert(Number.isFinite(n));assert(o.geometry.attributes.uv);if(o.material.map)textures.add(o.material.map);});
assert(draws<=40);assert(triangles<30000);assert.equal(textures.size,1,'Paint uses one shared compact texture');
const parked=inspectionBounds(root);m.setGear(0);root.updateMatrixWorld(true);const flying=inspectionBounds(root);assert(flying.min.y>parked.min.y+.4);assert.equal(m.stats().gear,0);
m.setGear(.5);root.updateMatrixWorld(true);assert(inspectionBounds(root).getSize(new THREE.Vector3()).toArray().every(Number.isFinite));
m.setGear(1);root.updateMatrixWorld(true);assert.deepEqual(inspectionBounds(root).min.toArray(),parked.min.toArray());
assert(modelsForObject({id:'pad-251'}).includes('mig25ru'));assert.equal(MODEL_CATALOG.mig.title,'МиГ-25 ЛЛ22','The historical escort keeps its identity');
const disposed=[];for(const texture of textures)texture.addEventListener('dispose',()=>disposed.push(texture));disposeInspectionModel(root);assert.equal(disposed.length,1);
console.log('MIG25_GEOMETRY_OK',JSON.stringify({dimensions:dimensions.toArray(),draws,triangles,intakes:'deep',nozzles:'open',cockpits:'stepped',gear:'retractable'}));
