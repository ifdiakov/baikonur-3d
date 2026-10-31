import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildMzkSdi,MZK_SDI_REFERENCE} from '../src/mzk-sdi.js';
import {MZK_SDI_RAIL_FRAMES,MZK_SDI_RAIL_STUBS,MZK_SDI_RAIL_PORTS,SITE110_RAIL_DESTINATIONS} from '../src/mik112-destination-ports.js';
import {SITE110_PORTS} from '../src/site110-ports.js';
import {RAIL_METRES} from '../src/rail-profile.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmGraph} from '../src/osm-transport.js';
import {createMik112RailSourcePlan} from '../src/mik112-rail-plan.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const V=(...p)=>new THREE.Vector3(...p),point=(x,y,h=0)=>V((x-650)*3.4,h,(y-522.5)*3.4);
const graph=buildOsmGraph(read('data/osm/railways.geojson').features,{geography,point,rail:true}),sourcePlan=createMik112RailSourcePlan(graph);
const routes=new Map(sourcePlan.destinationRoutes.map(route=>[route.id,route]));
for(const [name,frame]of Object.entries(MZK_SDI_RAIL_FRAMES)){
 assert.deepEqual(frame.center,MZK_SDI_REFERENCE[name].center);assert.equal(frame.yaw,MZK_SDI_REFERENCE[name].yaw);assert.equal(frame.width,MZK_SDI_REFERENCE[name].width);
}
assert.equal(MZK_SDI_RAIL_PORTS.length,4);assert.equal(MZK_SDI_RAIL_STUBS.length,4);
for(const port of [...MZK_SDI_RAIL_PORTS,...SITE110_RAIL_DESTINATIONS]){
 const route=routes.get(port.sourceRouteId);assert(route,'Every model port must have an explicitly verified source route');
 assert.equal(route.nodeIds.at(-1),port.sourceNodeId);assert.equal(route.sourceWayIds.at(-1),port.sourceWayId);
 assert(Math.abs(V(...port.outward).length()-1)<1e-10);
}
for(const port of SITE110_RAIL_DESTINATIONS){assert.deepEqual(port.position,SITE110_PORTS.rail[port.portIndex]);assert.deepEqual(port.outward,[0,0,1]);}

const site=geography.sites.find(site=>site.id==='pad-112a'),root=new THREE.Group();
root.position.copy(point(site.x,site.y,-2.72));root.scale.setScalar(MZK_SDI_REFERENCE.scale);root.rotation.y=MZK_SDI_REFERENCE.yaw;
buildMzkSdi(root);root.updateWorldMatrix(true,true);
const rails=[];root.traverse(mesh=>{if(mesh.isMesh&&mesh.material?.name==='museum / rail')rails.push(mesh);});
assert(rails.length,'MZK/SDI contains actual rail meshes');
const ray=new THREE.Raycaster(),down=V(0,-1,0);let headProbes=0,maxHeadError=0;
for(const port of MZK_SDI_RAIL_PORTS){
 const component=MZK_SDI_REFERENCE[port.destination],stub=MZK_SDI_RAIL_STUBS.find(stub=>stub.id===port.id);
 const transform=new THREE.Matrix4().compose(V(component.center[0],0,component.center[1]),new THREE.Quaternion().setFromAxisAngle(V(0,1,0),component.yaw),V(1,1,1));
 assert(V(...port.componentPosition).applyMatrix4(transform).distanceTo(V(...port.position))<1e-9);
 assert(Math.abs(port.position[1]-(stub.sleeperY+RAIL_METRES.sleeperHeight/2+RAIL_METRES.railHeight))<1e-12);
 const outward=V(...port.outward),normal=V(-outward.z,0,outward.x);
 for(const distance of [.05,5,10])for(const side of [-1,1])for(const across of [-.095,0,.095]){
  const local=V(...port.position).addScaledVector(outward,-distance).addScaledVector(normal,side*RAIL_METRES.gauge/2+across);
  const world=root.localToWorld(local.clone());ray.set(world.clone().add(V(0,.2,0)),down);
  const hits=ray.intersectObjects(rails,false),error=Math.min(...hits.map(hit=>hit.point.distanceTo(world)));
  assert(error<2e-5,'An actual paired destination rail misses its declared head port: '+JSON.stringify({id:port.id,distance,side,across,world:world.toArray(),error}));
  maxHeadError=Math.max(maxHeadError,error);headProbes++;
 }
}
assert.equal(headProbes,72);
console.log('MIK112_DESTINATION_PORTS_PASS',JSON.stringify({mzkSdiPorts:MZK_SDI_RAIL_PORTS.length,site110Ports:SITE110_RAIL_DESTINATIONS.length,headProbes,maxHeadError,gauge:RAIL_METRES.gauge,headWidth:RAIL_METRES.headWidth}));
