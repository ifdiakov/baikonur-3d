import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmGraph,buildOsmTransportNetwork} from '../src/osm-transport.js';
import {createInterchangeBridgePlan,buildInterchangeBridge,INTERCHANGE_BRIDGE_WAY} from '../src/interchange-bridge.js';
import {buildRoadVehicleRoutes,roadVehiclePose} from '../src/road-vehicles.js';
import {RAIL_PROFILE} from '../src/gagarin-rail-approach.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const catalog=read('data/catalog.json'),geography=createMuseumGeography({catalog,matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')};
const roadGraph=buildOsmGraph(data.roads.features,{geography,point}),railGraph=buildOsmGraph(data.railways.features,{geography,point,rail:true});
const graphSnapshot=g=>JSON.stringify({nodes:[...g.nodes.values()].map(n=>[n.id,...n.position.toArray()]),edges:g.edges.map(e=>[e.wayId,e.a.id,e.b.id])});
const originalRoadGraph=graphSnapshot(roadGraph),originalRailGraph=graphSnapshot(railGraph);
const plan=createInterchangeBridgePlan({roadGraph,railGraph}),fixture=buildInterchangeBridge({parent:new THREE.Group(),plan});
assert.equal(graphSnapshot(roadGraph),originalRoadGraph,'Architectural decoration must not move source road nodes or change topology');
assert.equal(graphSnapshot(railGraph),originalRailGraph,'The working railway is preserved exactly');
assert.deepEqual(plan.sourceWayIds,['172422627','369722049','1562011631']);
assert.equal(plan.width,3.6);assert.equal(plan.totalWidth,4.55);assert.equal(plan.length,40);
assert.ok(plan.protectedCorridors.some(c=>c.kind==='road'&&c.wayId==='1082534308'));
assert.ok(plan.protectedCorridors.some(c=>c.kind==='rail'&&c.wayId==='37545112'));
assert.ok(plan.halfLength+1.25<22.76,'Approach wings stop before the ramp junction');

// Exercise the real network integration, not just the standalone builder.
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false)});
const roots=transport.bridgeObjects();assert.equal(roots.length,1);
const root=roots[0],report=transport.stats().interchange.bridges.find(b=>b.osmWayId===INTERCHANGE_BRIDGE_WAY);
assert.equal(report.version,'reference-viaduct-v1');assert.equal(report.sourceTopologyPreserved,true);
assert.equal(report.reference.author,'3DtechVN');assert.equal(report.reference.license,'CC BY 4.0');
assert.equal(report.lamps,24);
// The shared curved fixtures and two smooth earth fields add geometry, while
// retaining the same material batches and draw-call budget.
assert.ok(report.triangles<32000);assert.ok(report.drawCalls<=12,'Shared lamps and the two embankments remain batched');
assert.equal(report.lighting.sharedFixtureGeometry,true);assert.equal(report.lighting.sharedFixtureMaterials,true);
assert.equal(report.markings.sharedWithHighway,true);
assert.equal(report.embankments.count,2);assert.equal(report.embankments.centralOpenLength,24);
assert.equal(layers.roads.getObjectByName('Мост OSM '+INTERCHANGE_BRIDGE_WAY),undefined,'The old slab and intrusive supports are replaced');
assert.equal(transport.stats().interchange.bridges.length,3,'Other source bridges remain present');
assert.equal(transport.stats().vehicleRoutes.length,4);
assert.deepEqual(transport.trainPath().osmWayIds,['37547653','37543646','37545112','172422609','1468604922','173086738','256360833']);
root.updateWorldMatrix(true,true);
let triangles=0,meshes=0;
root.traverse(m=>{if(!m.isMesh)return;meshes++;const p=m.geometry.attributes.position;triangles+=(m.geometry.index?.count||p.count)/3;
  for(const attr of Object.values(m.geometry.attributes))for(const v of attr.array)assert.ok(Number.isFinite(v));
  assert.equal(m.userData.bridgeClickable,!['Виадук · earth','Виадук · свет на полотне'].includes(m.name));
});
assert.equal(triangles,report.triangles);assert.equal(meshes+1,report.drawCalls);

const asphalt=root.getObjectByName('Виадук · asphalt');assert.ok(asphalt);
const spill=root.getObjectByName('Виадук · свет на полотне');assert.ok(spill);
assert.equal(report.lightSpill.type,'conforming-deck-overlay');assert.equal(report.lightSpill.drawCalls,1);
const ap=asphalt.geometry.attributes.position,sp=spill.geometry.attributes.position;
assert.equal(sp.count,ap.count);
for(let i=0;i<sp.count;i++){
  assert.equal(sp.getX(i),ap.getX(i));assert.equal(sp.getZ(i),ap.getZ(i));
  assert.ok(Math.abs(sp.getY(i)-ap.getY(i)-report.lightSpill.elevationOffset)<1e-6,'Light follows the actual sloping deck');
}
const down=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0),0,30);
const up=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,1,0),0,30);
const fromLocal=p=>plan.world(p);
let surfaceProbes=0,maxDeckHeightError=0;
for(const at of plan.samples)for(const side of [-.91,0,.91]){
  // Avoid exactly shared boundary edges when testing finite-precision triangles.
  if(Math.abs(at.p.z)>=plan.halfLength-.01)continue;
  const local=at.p.clone().addScaledVector(at.normal,plan.width*.5*side),world=fromLocal(local);
  down.ray.origin.copy(world).add(new THREE.Vector3(0,2,0));
  const hit=down.intersectObject(asphalt,false)[0];assert.ok(hit,'Continuous pavement at '+local.toArray());
  maxDeckHeightError=Math.max(maxDeckHeightError,Math.abs(hit.point.y-world.y-plan.asphaltLift));surfaceProbes++;
}
assert.ok(maxDeckHeightError<2e-5);

// Probe the actual tessellated earth under every adjacent road and rail lane,
// not just the two central corridors already protected by the old bridge.
// This catches a visually plausible mound that buries a ramp or service road.
const earth=root.getObjectByName('Виадук · earth');assert.ok(earth?.userData.bridgeApproachTerrain);
const ep=earth.geometry.attributes.position;let earthVertices=0;
for(let i=0;i<ep.count;i++){
  const x=ep.getX(i),y=ep.getY(i),z=ep.getZ(i);
  assert.ok(Math.abs(z)>=12-1e-6,'Earth cannot close the central underpass');
  assert.ok(y+plan.origin.y>=-2.755-1e-5,'Embankment toes join the terrain datum');
  if(Math.abs(z)>=82-1e-6||Math.abs(z)<=12+1e-6||Math.abs(x)>=13-1e-6)
    assert.ok(Math.abs(y+plan.origin.y+2.755)<1e-5,'All outer edges finish flush with the plain');
  earthVertices++;
}
let embankmentProbes=0,minEarthClearance=Infinity;
for(const e of plan.approachTerrain.corridors){
  const delta=e.b.clone().sub(e.a),length=Math.hypot(delta.x,delta.z),n=Math.max(1,Math.ceil(length/.55));
  const normal=new THREE.Vector3(delta.z,0,-delta.x).normalize();
  for(let i=0;i<=n;i++)for(const side of [-1,0,1]){
    const p=e.a.clone().lerp(e.b,i/n).addScaledVector(normal,side*e.width/2);
    if(Math.abs(p.z)<12.05||Math.abs(p.z)>81.95||Math.abs(p.x)>12.95)continue;
    const world=fromLocal(p);down.ray.origin.copy(world).add(new THREE.Vector3(0,12,0));
    const hit=down.intersectObject(earth,false)[0];assert.ok(hit,'A continuous earth field under '+e.wayId);
    const gap=world.y-hit.point.y;minEarthClearance=Math.min(minEarthClearance,gap);embankmentProbes++;
    assert.ok(gap>.10,'Earth intrudes into '+e.kind+' '+e.wayId+' at '+p.toArray()+': '+gap);
  }
}
assert.ok(embankmentProbes>500,'Cover adjoining loops, ramps, service roads and rail branches');

// The deck overlays only the original upper road. Replaced dashed center paint
// must not shine through the new asphalt or collide with the double centerline.
const originalPaint=layers.roads.getObjectByName('OSM · разметка');assert.ok(originalPaint);
const pp=originalPaint.geometry.attributes.position;let oldPaintOverlaps=0;
for(let i=0;i<pp.count;i++)if(plan.ownsRoadPoint(new THREE.Vector3().fromBufferAttribute(pp,i),null,-.04))oldPaintOverlaps++;
assert.equal(oldPaintOverlaps,0);

// Raycast actual merged bridge triangles above the full lower carriageway and
// active railway envelope. A misplaced pier/cap fails these checks directly.
const protectedKinds=new Set(),underpassSamples=[];
let clearanceProbes=0,minClearance=Infinity;
for(const corridor of plan.protectedCorridors){
  const a=new THREE.Vector3(...corridor.a),b=new THREE.Vector3(...corridor.b),tangent=b.clone().sub(a).setY(0).normalize();
  const normal=new THREE.Vector3(tangent.z,0,-tangent.x),n=Math.max(2,Math.ceil(a.distanceTo(b)/.18));
  for(let i=0;i<=n;i++)for(const side of [-1,-.5,0,.5,1]){
    const q=a.clone().lerp(b,i/n).addScaledVector(normal,side*(corridor.width/2+.04));
    if(Math.abs(q.z)>plan.halfLength-.8)continue;
    const upper=plan.sample(q.z);
    if(Math.abs(q.x-upper.p.x)>plan.totalWidth/2-.03)continue;
    const railLift=corridor.kind==='rail'?RAIL_PROFILE.headY+RAIL_PROFILE.headRadius:0;
    q.y+=railLift+.025;const p=fromLocal(q);up.ray.origin.copy(p);
    const hit=up.intersectObject(root,true).find(h=>h.object.isMesh);
    assert.ok(hit,'The lower corridor remains covered by the continuous deck');
    const clearance=hit.point.y-p.y;minClearance=Math.min(minClearance,clearance);clearanceProbes++;
    assert.ok(clearance>5,'Support intrudes into '+corridor.kind+' '+corridor.wayId+' at '+q.toArray()+': '+clearance);
    protectedKinds.add(corridor.kind+':'+corridor.wayId);
    if(underpassSamples.length<6)underpassSamples.push({kind:corridor.kind,wayId:corridor.wayId,clearance});
  }
}
assert.ok(clearanceProbes>200);assert.ok(protectedKinds.has('road:1082534308'));assert.ok(protectedKinds.has('rail:37545112'));
assert.ok(report.clearance>5&&report.clearance<=minClearance+.002,'Reported clearance must be a conservative geometric bound');

// Check existing vehicle poses against the newly rendered dark surface; neither
// route redefinition nor a decorative deck lift may leave floating car wheels.
const vehicles=buildRoadVehicleRoutes(transport.roadPaths());let vehicleProbes=0,minWheelGap=Infinity,maxWheelGap=-Infinity;
for(const route of vehicles.routes)for(const direction of [-1,1])for(let d=0;d<route.length;d+=.35){
  const state=roadVehiclePose(route,d/14,{phase:0,direction,speed:14});
  if(!plan.ownsRoadPoint(state.position,null,-.3))continue;
  down.ray.origin.copy(state.position).add(new THREE.Vector3(0,1,0));
  const hit=down.intersectObject(asphalt,false)[0];assert.ok(hit,'Vehicle remains inside the bridge pavement');
  const gap=state.position.y-hit.point.y;minWheelGap=Math.min(minWheelGap,gap);maxWheelGap=Math.max(maxWheelGap,gap);vehicleProbes++;
}
assert.ok(vehicleProbes>100);assert.ok(minWheelGap>-.035&&maxWheelGap<.045,JSON.stringify({minWheelGap,maxWheelGap}));

transport.setBridgeEvening(true);assert.equal(transport.stats().interchange.bridges[0].evening,true);
assert.equal(root.getObjectByName('Виадук · фонари').visible,true);
assert.equal(transport.stats().interchange.bridges[0].visibleLampGlows,24);
assert.equal(transport.stats().interchange.bridges[0].lightSpill.enabled,true);assert.equal(spill.visible,true);
assert.ok(Math.abs(root.getObjectByName('Виадук · lens').material.emissiveIntensity-2.475)<1e-10,'The bridge uses the same LED emission as the highway');
transport.setBridgeEvening(false);assert.equal(root.getObjectByName('Виадук · фонари').visible,false);
assert.equal(transport.stats().interchange.bridges[0].lightSpill.enabled,false);assert.equal(spill.visible,false);
assert.equal(root.getObjectByName('Виадук · lens').material.emissiveIntensity,0);
assert.equal(transport.isBridgePoleAllowed(plan.origin.x,plan.origin.z),false);
assert.equal(transport.isBridgePoleAllowed(plan.origin.x+100,plan.origin.z+100),true);
assert.doesNotThrow(()=>JSON.stringify(transport.stats()));
console.log('INTERCHANGE_BRIDGE_GEOMETRY_PASS',JSON.stringify({version:report.version,triangles,drawCalls:report.drawCalls,lamps:report.lamps,
  surfaceProbes,maxDeckHeightError,clearanceProbes,minClearance,earthVertices,embankmentProbes,minEarthClearance,
  protectedWays:[...protectedKinds],vehicleProbes,minWheelGap,maxWheelGap}));
