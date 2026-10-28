import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildTransportNetwork} from '../src/transport-network.js';
import {buildRoadVehicleRoutes,roadVehiclePose} from '../src/road-vehicles.js';
const point=(x,y,z=0)=>new THREE.Vector3((x-650)*3.4,z,(y-522.5)*3.4);
const layers={roads:new THREE.Group(),rails:new THREE.Group()},data=JSON.parse(fs.readFileSync('data/transport-network.json')),siteRecords=JSON.parse(fs.readFileSync('data/catalog.json')).sites;
const network=buildTransportNetwork({data,siteRecords,point,layers}),roads=network.roadPaths(),plan=buildRoadVehicleRoutes(roads);
assert.equal(plan.routes.length,4);assert.ok(plan.joins.every(j=>j.highwayGap<.15&&j.trunkGap<.15),'Ramp traffic must meet the rendered highway and city trunk');
const paved=[...roads,...plan.extensions.map(e=>({points:[e.from,e.to],width:e.width}))];
let maxOutside=0,maxGroundError=0,maxTurn=0;
for(const route of plan.routes)for(const direction of [-1,1]){
 for(let i=0;i<=250;i++){
  const config={phase:0,direction,speed:14},elapsed=route.length*i/250/14,state=roadVehiclePose(route,elapsed,config);
  assert.ok([...state.position.toArray(),...state.tangent.toArray()].every(Number.isFinite));
  assert.ok(state.opacity>=0&&state.opacity<=1);
  let best={distance:Infinity,groundError:0,outside:0};
  for(const road of paved)for(let n=1;n<road.points.length;n++){
   const a=road.points[n-1],b=road.points[n],d=b.clone().sub(a);d.y=0;const offset=state.position.clone().sub(a);offset.y=0;
   const t=THREE.MathUtils.clamp(offset.dot(d)/(d.lengthSq()||1),0,1),p=a.clone().lerp(b,t);
   const horizontal=Math.hypot(p.x-state.position.x,p.z-state.position.z),groundError=Math.abs(state.position.y-.022-p.y),distance=Math.hypot(Math.max(0,horizontal+.83-road.width/2),groundError);
   if(distance<best.distance)best={distance,groundError,outside:Math.max(0,horizontal+.83-road.width/2)};
  }
  maxOutside=Math.max(maxOutside,best.outside);maxGroundError=Math.max(maxGroundError,best.groundError);
  if(state.opacity>.99){const next=roadVehiclePose(route,elapsed+1/60,config);if(Math.abs(next.distance-state.distance)<1)maxTurn=Math.max(maxTurn,state.tangent.angleTo(next.tangent));}
 }
 const start=roadVehiclePose(route,0,{phase:0,direction:1,speed:14});assert.equal(start.opacity,0,'Respawn occurs invisibly at route ends');
}
assert.ok(maxOutside<.16,'Vehicle bodies stay inside the paved ribbons: '+maxOutside);
assert.ok(maxGroundError<.12,'Vehicle wheel datum follows the rendered pavement: '+maxGroundError);
assert.ok(maxTurn<.14,'No sudden heading jump on a normal animation frame: '+maxTurn);
console.log('ROAD_VEHICLES_GEOMETRY_PASS',JSON.stringify({routes:plan.routes.map(r=>({id:r.id,length:r.length})),joins:plan.joins,maxOutside,maxGroundError,maxTurn}));
