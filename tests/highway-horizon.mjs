import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmTransportNetwork} from '../src/osm-transport.js';
import {HIGHWAY_DISPLAY} from '../src/highway-display.js';
import {HIGHWAY_ASPHALT_LIFT,HIGHWAY_MARKINGS} from '../src/highway-surface.js';
import {buildRoadLightRecords,filterRoadLightStations,createRoadLightField,ROAD_LIGHT_STYLES,ROAD_LIGHT_FADE} from '../src/road-lighting.js';
import {createNorthBankMask} from '../src/river-bank.js';
import {createRiverWaterModel} from '../src/river-surface.js';
import {createEastLightingZone} from '../src/east-lighting-zone.js';
import {cameraPositionBounds,MUSEUM_CAMERA_MAX_HEIGHT} from '../src/camera-navigation.js';
import {FLANK_OUTLINE} from '../src/flank-boundaries.js';
import {createFlightCircuit} from '../src/flight-circuit.js';
import {AIRPORT_SCALE,airportDisplaySpec} from '../src/airport-models.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url)));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>V((x-650)*3.4,h,(y-522.5)*3.4);
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')};
const source=JSON.stringify(data),boundsBefore=JSON.stringify(geography.bounds),layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false)});
assert.equal(JSON.stringify(data),source,'Display scenery cannot rewrite source geography');
assert.equal(JSON.stringify(geography.bounds),boundsBefore,'The extensions cannot expand museum navigation');
const roads=transport.roadPaths(),highway=roads.osmVehiclePlan.highway,display=transport.highwayDisplay,stats=display.stats();
assert.equal(display.paths.length,2);assert.equal(stats.drawCalls,4);assert(stats.triangles<16000,'Long straight roads need no dense OSM tessellation');
assert.equal(roads.osmVehiclePlan.source,'OpenStreetMap');assert.deepEqual(roads.osmVehiclePlan.extensions,[]);
assert.equal(roads.osmVehiclePlan.routes.length,4);assert(highway.length<6000,'The real traffic route must retain its source length');
assert(roads.osmVehiclePlan.routes.every(r=>!r.displayOnly));assert(roads.every(r=>!r.displayOnly));
assert.equal(roads.displayHighwayExtensions,display.paths);
const far=80000,targetBounds={
 minX:(Math.min(geography.bounds.minX,...FLANK_OUTLINE.map(p=>p[0]))-650)*3.4,
 maxX:(Math.max(geography.bounds.maxX,...FLANK_OUTLINE.map(p=>p[0]))-650)*3.4,
 minZ:(Math.min(geography.bounds.minY,...FLANK_OUTLINE.map(p=>p[1]))-522.5)*3.4,
 maxZ:(Math.max(geography.bounds.maxY,...FLANK_OUTLINE.map(p=>p[1]))-522.5)*3.4};
const eye=cameraPositionBounds(targetBounds),eyeBox=new THREE.Box3(V(eye.minX,-1.74,eye.minZ),V(eye.maxX,MUSEUM_CAMERA_MAX_HEIGHT,eye.maxZ));
const meshes=Object.fromEntries(display.root.children.map(m=>[m.userData.part,m]));
const originalAsphalt=layers.roads.getObjectByName('OSM · асфальт трассы');
layers.roads.updateMatrixWorld(true);
const ray=new THREE.Raycaster(),up=V(0,-1,0);
function atSurface(p,objects){ray.set(V(p.x,p.y+20,p.z),up);return ray.intersectObjects(objects,false).map(hit=>hit.point.y);}
let pavementProbes=0,paintProbes=0,minFreeEndpointDistance=Infinity;
for(const [i,path]of display.paths.entries()){
 assert.equal(path.source,'museum-display-extension');assert.equal(path.displayOnly,true);
 assert(path.from.distanceTo(highway.points[i?highway.points.length-1:0])<1e-9);
 assert(path.from.distanceTo(path.to)>145000);
 const lowerBound=eyeBox.distanceToPoint(path.to);minFreeEndpointDistance=Math.min(minFreeEndpointDistance,lowerBound);
 assert(lowerBound>far+60000,'An endpoint is too close to the closed free-camera envelope');
 assert(Math.max(Math.abs(path.to.x),Math.abs(path.to.z))+path.width<160000,'Roads remain on the 320000-unit terrain');
 assert(path.tangents[0].dot(path.tangent)>1-1e-8,'The display tail preserves the source end tangent');
 assert(path.tangents.at(-1).dot(path.endTangent)>1-1e-10);
 for(let j=1;j<path.tangents.length;j++)assert(path.tangents[j].dot(path.tangents[j-1])>.999,'A distant road has a visible kink');
 for(const distance of [-.15,.15,1,24,256,4096,8192,20000,45000,80000,120000,path.length-.2]){
  const center=distance<0?path.from.clone().addScaledVector(path.tangent,distance):path.position(distance),tangent=distance<0?path.tangent:path.sample(distance,.01).tangent,normal=V(-tangent.z,0,tangent.x);
  for(const side of [-.43,-.24,0,.24,.43]){
   const p=center.clone().addScaledVector(normal,path.width*side),heights=atSurface(p,[originalAsphalt,meshes.asphalt]);
   assert(heights.some(y=>Math.abs(y-center.y-HIGHWAY_ASPHALT_LIFT)<.002),'Missing road or a vertical step at '+p.toArray());pavementProbes++;
  }
  if(distance<=0)continue;
  for(const [part,offset,lift]of [['shoulder',path.width/2+.15,-.055],['white',path.width/2-HIGHWAY_MARKINGS.edgeInset,HIGHWAY_MARKINGS.lift],['yellow',HIGHWAY_MARKINGS.centerOffset,HIGHWAY_MARKINGS.lift]]){
   for(const side of [-1,1]){
    const p=center.clone().addScaledVector(normal,side*offset),heights=atSurface(p,[meshes[part]]);
    assert(heights.some(y=>Math.abs(y-center.y-lift)<.002),'A continuation has a gap in '+part+' at '+p.toArray());paintProbes++;
   }
  }
 }
}

// Include the actual scripted aircraft route, even while its free-camera
// bounds are intentionally disabled. The 250-unit allowance covers its
// 240-unit orbit and the airframe/target offset.
const runway=read('data/osm/airports.geojson').features.find(f=>f.properties.osmId===37591623&&f.geometry.type==='LineString');
const a=geography.project(runway.geometry.coordinates[0]),b=geography.project(runway.geometry.coordinates.at(-1)),sign=b[0]>=a[0]?1:-1;
const airport=new THREE.Group();airport.userData.airport=airportDisplaySpec('krayniy');airport.scale.setScalar(AIRPORT_SCALE);
airport.position.copy(point((a[0]+b[0])/2,(a[1]+b[1])/2,-2.72));airport.rotation.y=Math.atan2((b[0]-a[0])*sign,(b[1]-a[1])*sign);
const flight=createFlightCircuit(airport,{complexCenter:point(...geography.project(63.33,45.94))});
let minFollowEndpointDistance=Infinity;
for(let time=0;time<flight.duration;time+=.2){
 const p=flight.sample(time).position;
 for(const path of display.paths)minFollowEndpointDistance=Math.min(minFollowEndpointDistance,path.to.distanceTo(p)-250);
}
assert(minFollowEndpointDistance>far+5000,'A plane-follow camera can reach the terminal road section');

// A wide frustum can include points farther away than its axial far plane.
// Test a conservative superset of allowed poses and prove radial extinction
// also covers those corners, without relying solely on fog colour matching.
let testedViews=0,wideCornerCases=0;
for(const aspect of [.25,1,16/9,32/9,8])for(let yaw=0;yaw<360;yaw+=15){
 const camera=new THREE.PerspectiveCamera(52,aspect,.1,far);camera.position.set((eye.minX+eye.maxX)/2,MUSEUM_CAMERA_MAX_HEIGHT,(eye.minZ+eye.maxZ)/2);
 const angle=yaw*Math.PI/180,direction=V(Math.sin(angle)*Math.sin(Math.PI/3),-Math.cos(Math.PI/3),Math.cos(angle)*Math.sin(Math.PI/3));
 camera.lookAt(camera.position.clone().add(direction));camera.updateMatrixWorld(true);
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 for(const path of display.paths){
  const distance=camera.position.distanceTo(path.to);
  assert(distance>HIGHWAY_DISPLAY.fadeEnd);testedViews++;
  if(frustum.containsPoint(path.to)){wideCornerCases++;assert(distance>far,'The case must exercise the radial versus axial distinction');}
 }
}
assert(wideCornerCases>0,'Exercise at least one extra-wide frustum corner beyond the axial far plane');
for(const mesh of Object.values(meshes)){
 assert.equal(mesh.material.transparent,true);assert(mesh.material.alphaTest>0);
 assert.equal(mesh.material.forceSinglePass,true,'Double-sided translucent ribbons must stay one draw call');
 assert.deepEqual(mesh.material.userData.highwayDisplayFade,[HIGHWAY_DISPLAY.fadeStart,HIGHWAY_DISPLAY.fadeEnd]);
 const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};mesh.material.onBeforeCompile(shader);
 assert(shader.vertexShader.includes('vHighwayDisplayDistance=length(mvPosition.xyz)'));
 assert(shader.fragmentShader.includes('diffuseColor.a*=1.-smoothstep('),'The terminal surface must actually become transparent');
 assert.equal(mesh.userData.groundSurface,false,'Do not insert huge display-only surfaces into site-light ground queries');
 assert.equal(mesh.renderOrder,['white','yellow'].includes(mesh.userData.part)?4:3,'Transparent roads must render after terrain (0/1/2), with paint last');
}

const records=buildRoadLightRecords(roads),extensions=records.filter(r=>r.displayOnly),spacing=ROAD_LIGHT_STYLES.highway.spacing;
assert(extensions.length>15000&&extensions.length<16000,'Keep the existing paired LED spacing over both complete continuations');
for(const path of display.paths){
 const lamps=extensions.filter(r=>r.roadId===path.id&&r.side===1),distances=[],cumulative=[0];let segment=1;
 for(let i=1;i<path.points.length;i++)cumulative.push(cumulative.at(-1)+path.points[i].distanceTo(path.points[i-1]));
 for(const lamp of lamps){
  const center=V(...lamp.center);let a,b,delta,t;
  while(true){a=path.points[segment-1];b=path.points[segment];delta=b.clone().sub(a);t=center.clone().sub(a).dot(delta)/delta.lengthSq();if(t<=1+1e-8||segment===path.points.length-1)break;segment++;}
  assert(a.clone().addScaledVector(delta,t).distanceTo(center)<1e-7,'A lamp station left its rendered road centreline');
  distances.push(cumulative[segment-1]+t*delta.length());
 }
 const first=distances[0],last=path.length-distances.at(-1);
 assert(first>0&&first<spacing);assert(last<spacing);
 for(let i=1;i<distances.length;i++)assert(Math.abs(distances[i]-distances[i-1]-spacing)<1e-7,'No gap or denser restart at a mesh segment');
 const original=records.filter(r=>r.roadId==='highway'&&r.side===1),near=original[path.side==='west'?0:original.length-1];
 assert(Math.abs(V(...near.center).distanceTo(path.from)+distances[0]-spacing)<.02,'Source and continuation share the same lamp phase');
 assert.equal(extensions.filter(r=>r.roadId===path.id).length,lamps.length*2,'Both sides retain complete pairs');
}
const project=ll=>{const [x,y]=geography.project(ll);return [(x-650)*3.4,(y-522.5)*3.4];};
const water=createRiverWaterModel({data:read('data/osm/river-water.geojson'),project}),river=read('data/osm/river.geojson').features.find(f=>f.geometry.type==='LineString');
const bank=createNorthBankMask(river.geometry.coordinates.map(project),{water}),power=createEastLightingZone({facilities:read('data/osm/facilities.geojson'),project:(lon,lat)=>project([lon,lat])});
const filtered=filterRoadLightStations(extensions,{isLightAllowed:bank.contains,isLightPowered:power.isPowered});
assert.equal(filtered.records.length,extensions.length,'A river meander or finite mask closure cuts off display lamps');
assert(filtered.records.every(r=>r.powered),'The new tails must remain outside the preserved Site 42 dark zone');
let shoreProbes=0;
for(const path of display.paths)for(let s=0;s<path.turnLength+100;s+=3){const {position:p,tangent:t}=path.sample(s,.1),n=V(-t.z,0,t.x);for(const side of [-1,0,1]){const at=p.clone().addScaledVector(n,side*(path.width/2+HIGHWAY_DISPLAY.shoulderExtra/2));assert(bank.contains(at.x,at.z),'A new road shoulder crosses the real river');shoreProbes++;}}
const field=createRoadLightField(new THREE.Group(),extensions),lightStats=field.stats();
assert(lightStats.fixtureTriangles<1000000,'Distant lighting must not repeat full LED geometry to the horizon');
assert(lightStats.drawCalls<=6);assert(lightStats.distantPoles>14000);assert.equal(lightStats.physicalPoles,extensions.length);
let pointLights=0;field.root.traverse(o=>{if(o.isPointLight)pointLights++;});assert.equal(pointLights,0);
for(const mesh of field.root.children.filter(o=>o.userData.fixtureDetail==='distant')){assert.equal(mesh.renderOrder,6,'Transparent distant fixtures follow the road and its light pools');assert.equal(mesh.material.forceSinglePass,true);}
for(const object of field.root.children.filter(o=>o.material?.isShaderMaterial)){
 if(object.isInstancedMesh)assert.equal(object.material.forceSinglePass,true,'Flat light pools need a single transparent pass');
 assert.equal(object.material.fog,true);assert(object.material.uniforms.fogDensity&&object.material.uniforms.fogColor);
 assert.deepEqual(object.material.uniforms.distanceFade.value.toArray(),[ROAD_LIGHT_FADE.start,ROAD_LIGHT_FADE.end]);
 assert.equal(object.material.uniforms.distanceFadeExponent.value,ROAD_LIGHT_FADE.exponent);
 assert(object.material.fragmentShader.includes('distancePower*=exp('));assert(object.material.fragmentShader.includes('*distancePower)'));
}
const clearFogDensity=.000055;assert(Math.exp(-((clearFogDensity*minFollowEndpointDistance)**2))<1e-9,'Even the clearest historical weather hides the last section');
console.log('HIGHWAY_HORIZON_PASS',JSON.stringify({pavementProbes,paintProbes,shoreProbes,testedViews,wideCornerCases,minFreeEndpointDistance,minFollowEndpointDistance,filteredLamps:filtered.records.length,display:stats,lighting:lightStats,immutableSource:true}));
