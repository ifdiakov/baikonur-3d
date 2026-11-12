import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildEarthCoveredShelter} from '../src/earth-covered-shelters.js';
import {planShelterRoadAccess,buildShelterRoadAccess,shelterAccessView} from '../src/shelter-road-access.js';
const read=p=>JSON.parse(readFileSync(p)),catalog=read('data/catalog.json'),matches=read('data/osm/catalog-matches.json');
const geography=createMuseumGeography({catalog,matches}),roads=JSON.parse(gunzipSync(readFileSync('data/osm/transport-geometry-bake-v1.json.gz'))).roads;
const untouched=JSON.stringify(roads),checks=[],models={};
function test(name,fn){fn();checks.push({name,passed:true});}
for(const id of ['pad-82','pad-83']){
 const site=geography.sites.find(o=>o.id===id),root=new THREE.Group();root.position.set((site.x-650)*3.4,-2.72,(site.y-522.5)*3.4);root.scale.setScalar(.14);
 const old=root.position.toArray(),plan=planShelterRoadAccess(root,id,roads);root.rotation.y=plan.yaw;buildEarthCoveredShelter(root,id);const access=buildShelterRoadAccess(root,plan);root.updateWorldMatrix(true,true);
 test(id+' faces its connected road, without moving site',()=>{assert.deepEqual(root.position.toArray(),old);const f=new THREE.Vector3(0,0,1).applyQuaternion(root.quaternion),v=new THREE.Vector3(...access.end).sub(root.position);v.y=0;assert(f.dot(v.normalize())>.99999);});
 test(id+' pavement ends exactly on road boundary',()=>{const [a,b]=access.sourceSegment.map(p=>new THREE.Vector3(...p)),d=b.clone().sub(a),n=new THREE.Vector3(-d.z,0,d.x).normalize();for(const p of access.joinEdges){const v=new THREE.Vector3(...p).sub(a);assert(Math.abs(Math.abs(v.dot(n))-access.roadWidth/2)<1e-8);const t=(v.x*d.x+v.z*d.z)/(d.x*d.x+d.z*d.z);assert(t>0&&t<1);assert(Math.abs(p[1]-(a.y+t*d.y))<1e-8);}});
 test(id+' no surface gaps along driveway',()=>{const meshes=root.children.filter(m=>m.userData.shelterDrive==='asphalt');for(const p of access.centreline.slice(1,-1)){const ray=new THREE.Raycaster(new THREE.Vector3(p[0],p[1]+10,p[2]),new THREE.Vector3(0,-1,0)),hit=ray.intersectObjects(meshes)[0];assert(hit);assert(Math.abs(hit.point.y-p[1])<.003);}});
 test(id+' smooth bounded grade and shoulder/ground support',()=>{assert(access.maxGrade<.23);assert.equal(root.children.filter(o=>o.userData.shelterDrive).length,3);assert(root.children.find(o=>o.userData.shelterDrive==='earth').userData.pantsirEarth);});
 test(id+' entrance excavation rotates with model',()=>{const p=root.userData.pantsirModel,at=root.localToWorld(new THREE.Vector3(0,20,p.front+3)),hit=new THREE.Raycaster(at,new THREE.Vector3(0,-1,0)).intersectObject(root,true)[0];assert(hit.point.y<root.position.y-.6);assert.equal(root.userData.archiveCutouts.length,1);});
 test(id+' public name clean and camera frames approach',()=>{const item=catalog.sites.find(s=>s.id===id);assert(!/панцирь/i.test(JSON.stringify(item)));assert(shelterAccessView(root).framePoints.length>=6);});
 test(id+' finite geometry and no lights',()=>root.traverse(o=>{assert(!o.isLight);if(o.isMesh)assert([...o.geometry.attributes.position.array].every(Number.isFinite));}));
 models[id]={yawDegrees:plan.yaw*180/Math.PI,roadId:plan.roadId,length:access.length,maxGrade:access.maxGrade,trianglesAdded:access.triangleCount,sitePosition:old};
}
test('source roads unchanged',()=>assert.equal(JSON.stringify(roads),untouched));
mkdirSync('qa-pantsirs',{recursive:true});writeFileSync('qa-pantsirs/access-source.json',JSON.stringify({passed:true,checks,models},null,2));console.log('SHELTER_ACCESS_SOURCE_PASS',checks.length,JSON.stringify(models));
