import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMig25} from '../src/mig25-aircraft.js';
import {inspectionBounds,disposeInspectionModel,createInspectionModel} from '../src/inspection-models.js';
import {modelsForObject,modelsForKnowledge,MODEL_CATALOG,resolveModelId} from '../src/model-catalog.js';
const m=createMig25(),root=m.root,stats=m.stats();
const ray=(origin,direction)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,40).intersectObjects(root.children,true).filter(h=>{for(let o=h.object;o;o=o.parent)if(!o.visible)return false;return true;});
root.updateMatrixWorld(true);
const dimensions=inspectionBounds(root).getSize(new THREE.Vector3());
assert(dimensions.x>13.3&&dimensions.x<13.7);assert(dimensions.z>21.8&&dimensions.z<22.5);assert(dimensions.y>5.4&&dimensions.y<5.9);
assert.equal(stats.type,'МиГ-25');assert.equal(stats.boardNumber,'46');assert.equal(stats.canopies.length,1);assert.equal(stats.referenceImageCount,17);assert.equal(stats.gear,0);
const canopy=ray([0,10,4.95],[0,-1,0])[0],foredeck=ray([0,10,6.7],[0,-1,0])[0],cone=ray([0,10,8.8],[0,-1,0])[0];
assert.match(canopy.object.material.name,/остекление одной кабины/);assert.match(foredeck.object.material.name,/противобликовая/,'The former forward training canopy is gone');assert.match(cone.object.material.name,/носовой обтекатель/);
assert(root.getObjectByName('Подвесной топливный бак'));assert.equal(stats.externalTank,true);const tank=ray([0,-10,-2],[0,1,0])[0];assert(tank.point.y< -1.85,'The centreline tank projects beneath the fuselage');
for(const side of [-1,1]){
 for(const [u,y]of [[.20,-.14],[.77,-.44]]){const mark=ray([side*5,y,5.85-side*(u-.5)],[-side,0,0])[0];assert.match(mark.object.material.name,/красные опознавательные/,'Filled 46 numerals follow the curved nose');}
 for(const x of [1.1,1.45,1.8]){const intake=ray([side*x,-.2,5],[0,0,-1])[0];assert.match(intake.object.material.name,/каналы/);assert(intake.point.z<1.7,'Intakes have deep open throats');}
 // Test the interior, not just its centre: no tailplane may cross an exhaust.
 for(const dx of [-.30,0,.30])for(const dy of [-.30,0,.30]){const exhaust=ray([side*.99+dx,-.08+dy,-13],[0,0,1])[0];assert(exhaust.point.z> -9.05,'Burner grid is recessed beyond the nozzle; no airframe intrusion');assert.doesNotMatch(exhaust.object.material.name,/обшивки|обслуживания/);}
 const wing=ray([side*5.2,10,-3.5],[0,-1,0])[0];assert(wing.point.y>.78&&wing.point.y<1.10);
 const body=ray([side*5,0,7.8],[-side,0,0])[0];assert(body.point.x*side>.4&&body.point.x*side<.7);assert.match(body.object.material.name,/носовой обтекатель/);
 const fin=ray([side*5,2.4,-8.2],[-side,0,0])[0];assert(fin.point.x*side>1.35&&fin.point.x*side<1.6);
}
let draws=0,triangles=0;const textures=new Set();root.traverse(o=>{if(!o.isMesh)return;draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;for(const key of ['position','normal','uv']){assert(o.geometry.attributes[key]);for(const n of o.geometry.attributes[key].array)assert(Number.isFinite(n));}for(const key of ['map','bumpMap','roughnessMap'])if(o.material[key])textures.add(o.material[key]);});
assert(draws<=44);assert(triangles<32000);assert.equal(textures.size,2);assert([...textures].reduce((n,t)=>n+t.image.data.byteLength,0)<=8*1024*1024);
const flying=inspectionBounds(root);m.setGear(1);root.updateMatrixWorld(true);const parked=inspectionBounds(root);assert(parked.min.y<flying.min.y-.4);assert.equal(m.stats().gear,1);
m.setGear(.5);root.updateMatrixWorld(true);assert(inspectionBounds(root).getSize(new THREE.Vector3()).toArray().every(Number.isFinite));m.setGear(0);root.updateMatrixWorld(true);assert.deepEqual(inspectionBounds(root).min.toArray(),flying.min.toArray());
assert(modelsForObject({id:'pad-251'}).includes('mig25'));assert.equal(MODEL_CATALOG.mig.title,'МиГ-25 ЛЛ22');assert.equal(resolveModelId('mig25ru'),'mig25');assert.deepEqual(modelsForKnowledge('mig25ru'),['mig25']);assert(!Object.hasOwn(MODEL_CATALOG,'mig25ru'));
const legacy=await createInspectionModel('mig25ru');assert.equal(legacy.spec.title,'МиГ-25');assert.equal(legacy.initialGear,0);legacy.dispose();
const disposed=[];for(const texture of textures)texture.addEventListener('dispose',()=>disposed.push(texture));disposeInspectionModel(root);assert.equal(disposed.length,2);
console.log('MIG25_GEOMETRY_OK',JSON.stringify({dimensions:dimensions.toArray(),draws,triangles,intakes:'deep',exhausts:'unobstructed',cockpits:1,externalTank:true,legacyLink:true}));
