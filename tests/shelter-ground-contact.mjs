import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {planShelterRoadAccess,buildShelterRoadAccess} from '../src/shelter-road-access.js';
import {ROAD_SURFACE_Y} from '../src/transport-ground-profile.js';

// Independently recorded from the pre-change public fast-path initialization
// at b51b2a64061bcb969bccf174df2f7fc92a26a3d9: original restore + all three
// cached grades + original planShelterRoadAccess. These are expected display
// transforms, not values computed from the new planner's reference export.
const expected={
 'pad-82':{roadId:'osm-road-172961048',yaw:2.673619628461208,
  join:[-1531.3815314494389,-1242.1560639621334],edge:[-1530.5791913547725,-1241.2637353385362]},
 'pad-83':{roadId:'osm-road-172855620',yaw:.14197999988517765,
  join:[-1524.201975592896,-1109.3476356723172],edge:[-1523.3742934290544,-1110.6581478758692]}
};
const json=path=>JSON.parse(readFileSync(path)),geography=createMuseumGeography({catalog:json('data/catalog.json'),matches:json('data/osm/catalog-matches.json')});
const source=JSON.parse(gunzipSync(readFileSync('data/osm/transport-geometry-bake-v1.json.gz'))).roads,untouched=JSON.stringify(source);
const near=(a,b,message)=>assert(Math.abs(a-b)<1e-9,message+': '+a+' != '+b);
const paths=(y,resample=false)=>source.map(road=>{
 const points=road.points.map(([x,,z])=>[x,y,z]);
 if(!resample)return {...road,points};
 const split=[];for(let i=0;i<points.length;i++){
  if(i){const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/.75));
   for(let j=1;j<n;j++){const t=j/n;split.push([a[0]+(b[0]-a[0])*t,y,a[2]+(b[2]-a[2])*t]);}}
  split.push(points[i]);
 }return {...road,points:split};
});
const raised=paths(.72),grounded=paths(ROAD_SURFACE_Y),resampled=paths(ROAD_SURFACE_Y,true),models={};
for(const [id,wanted]of Object.entries(expected)){
 const site=geography.sites.find(site=>site.id===id),root=new THREE.Group();
 root.position.set((site.x-650)*3.4,-2.72,(site.y-522.5)*3.4);root.scale.setScalar(.14);
 const before=root.position.toArray(),plans=[raised,grounded,resampled].map(roads=>planShelterRoadAccess(root,id,roads));
 for(const plan of plans){
  assert.equal(plan.roadId,wanted.roadId);near(plan.yaw,wanted.yaw,'Approved model yaw stays fixed');
  for(const [k,axis]of [[0,0],[2,1]]){near(plan.join[k],wanted.join[axis],'Approved road join stays fixed');near(plan.edge[k],wanted.edge[axis],'Approved edge stays fixed');}
  root.rotation.y=plan.yaw;root.clear();const physical=buildShelterRoadAccess(root,plan);
  assert(physical.maxGrade<.23,'The fixed join must retain a usable physical ramp');
  near(physical.end[1],plan.join[1],'The ramp ends at the current road height');
 }
 near(plans[0].join[1],.72,'Legacy physical road height');near(plans[1].join[1],ROAD_SURFACE_Y,'Current physical road height');
 near(plans[2].join[1],ROAD_SURFACE_Y,'Sampling density cannot change physical road height');
 assert.deepEqual(root.position.toArray(),before,'Planning cannot move the exhibit');
 assert.throws(()=>planShelterRoadAccess(root,id,paths(100)),/supported grade/,'An impossible grade must not silently choose another XZ join');
 models[id]={yaw:plans[1].yaw,joinBefore:plans[0].join,joinAfter:plans[1].join,edgeAfter:plans[1].edge,roadId:plans[1].roadId,position:before};
}
assert.equal(JSON.stringify(source),untouched,'Source transport paths stay untouched');
mkdirSync('qa-pantsirs',{recursive:true});writeFileSync('qa-pantsirs/ground-contact.json',JSON.stringify({passed:true,models},null,2));
console.log('SHELTER_GROUND_CONTACT_PASS',JSON.stringify(models));
