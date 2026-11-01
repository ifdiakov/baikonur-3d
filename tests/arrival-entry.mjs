import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createArrivalFlight,createArrivalPath,arrivalPose,FLIGHT_LEG_DURATION,FLIGHT_CYCLE_DURATION} from '../src/arrival-flight.js';
import {AIRCRAFT_LIGHT_FADE} from '../src/aircraft-livery.js';
import {AIRPORT_DIMENSIONS,AIRPORT_SCALE} from '../src/airport-models.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {FLANK_OUTLINE} from '../src/flank-boundaries.js';
import {cameraPositionBounds,constrainFreeCamera,MUSEUM_CAMERA_MAX_HEIGHT} from '../src/camera-navigation.js';
import {fitOverviewCamera} from '../src/overview-camera.js';

const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,z,y=0)=>new THREE.Vector3((x-650)*3.4,y,(z-522.5)*3.4);
const runway=read('data/osm/airports.geojson').features.find(f=>f.properties.osmId===37591623&&f.geometry.type==='LineString');
const ends=[runway.geometry.coordinates[0],runway.geometry.coordinates.at(-1)].sort((a,b)=>a[1]-b[1]);
const a=point(...geography.project(...ends[0])),b=point(...geography.project(...ends[1]));
const airport=new THREE.Group(),spec=AIRPORT_DIMENSIONS.krayniy,H=spec.length/2;
airport.position.copy(a.clone().lerp(b,.5)).setY(-2.72);airport.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);airport.scale.setScalar(AIRPORT_SCALE);
airport.userData.airport={...spec,key:'krayniy',threshold:H-15,touchdown:H-380*spec.longitudinalScale};
const hub=point(...geography.project(63.33,45.94)),path=createArrivalPath(airport,{complexCenter:hub});
const bounds={minX:(Math.min(geography.bounds.minX,...FLANK_OUTLINE.map(p=>p[0]))-650)*3.4,maxX:(Math.max(geography.bounds.maxX,...FLANK_OUTLINE.map(p=>p[0]))-650)*3.4,
 minZ:(Math.min(geography.bounds.minY,...FLANK_OUTLINE.map(p=>p[1]))-522.5)*3.4,maxZ:(Math.max(geography.bounds.maxY,...FLANK_OUTLINE.map(p=>p[1]))-522.5)*3.4};
const eye=cameraPositionBounds(bounds),eyeBox=new THREE.Box3(new THREE.Vector3(eye.minX,-1.74,eye.minZ),new THREE.Vector3(eye.maxX,MUSEUM_CAMERA_MAX_HEIGHT,eye.maxZ));
let minimumEntryDistance=Infinity,minimumHiddenDistance=Infinity,maximumRouteRadius=0,seamChecks=0;
for(const entry of path.arrivalEntryPoints){
 const distance=eyeBox.distanceToPoint(entry);minimumEntryDistance=Math.min(minimumEntryDistance,distance);
 assert.ok(distance>AIRCRAFT_LIGHT_FADE[1]+12,'Even the nearest allowed free camera is outside all aircraft light and trail visibility at entry');
}
for(let t=0;t<FLIGHT_CYCLE_DURATION;t+=.1){
 const s=path.sample(t);maximumRouteRadius=Math.max(maximumRouteRadius,s.position.clone().sub(hub).setY(0).length());
 if(!s.visible){const distance=eyeBox.distanceToPoint(s.position);minimumHiddenDistance=Math.min(minimumHiddenDistance,distance);assert.ok(distance>AIRCRAFT_LIGHT_FADE[1]+12,'The hidden return never crosses the visible museum');}
}
assert.ok(maximumRouteRadius<70000,'The flight and follow camera remain inside the background-road safety envelope');
const seams=[...path.phases.map(p=>p.start).filter(Boolean),FLIGHT_CYCLE_DURATION,
 ...path.approachNodes.flatMap((nodes,leg)=>nodes.slice(1,-1).map(n=>n.t+leg*FLIGHT_LEG_DURATION)),
 ...path.returnNodes.flatMap((nodes,leg)=>nodes.slice(1,-1).map(n=>n.t+leg*FLIGHT_LEG_DURATION+346))];
for(const t of seams){
 const epsilon=1e-8,before=arrivalPose(path,t-epsilon),after=arrivalPose(path,t+epsilon);
 assert.ok(before.position.distanceTo(after.position)<.0003,'Continuous route position at '+t);
 assert.ok(before.velocity.distanceTo(after.velocity)<.001,'Continuous route velocity at '+t);
 assert.ok(before.bodyPosition.distanceTo(after.bodyPosition)<.0003,'Continuous rendered position at '+t);seamChecks++;
}
for(const [width,height] of [[1920,1080],[1440,900],[768,1024],[390,844],[320,568]])for(const topDown of [false,true]){
 const fit=fitOverviewCamera({width,height,outline:FLANK_OUTLINE,topDown}),camera=new THREE.PerspectiveCamera(52,width/height,.1,80000),scale=3.4/1.45;
 const target=new THREE.Vector3(...fit.target).multiplyScalar(scale);camera.position.copy(target).add(new THREE.Vector3(0,fit.height,fit.depth).multiplyScalar(scale));camera.lookAt(target);camera.updateMatrixWorld(true);
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 for(const entry of path.arrivalEntryPoints)assert.ok(!frustum.intersectsSphere(new THREE.Sphere(entry,12)),'Both entries start outside the '+width+'px overview');
}

// Exercise the real runtime controller without a GPU: the canvas stub only
// supplies the paint API used to build the existing procedural livery textures.
const gradient={addColorStop(){}},context=new Proxy({measureText:t=>({width:t.length*15}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>o[k]||(()=>{})});
const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',dataset:{},setAttribute(){}});return elements.get(id);};
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>context}),addEventListener(){},body:{classList:{add(){},remove(){}}}};
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xb7b5a4,.000085);
const camera=new THREE.PerspectiveCamera(52,1.6,.1,80000);camera.position.set(0,2000,2000);
const controls={target:new THREE.Vector3(),enableDamping:false,minDistance:2.1,maxDistance:8000,minPolarAngle:0,maxPolarAngle:Math.PI/3,
 enablePan:true,mouseButtons:{},touches:{},update(){camera.lookAt(this.target);camera.updateMatrixWorld(true);}};
const flight=createArrivalFlight({scene,camera,controls,airfield:airport,complexCenter:hub,getNavigationBounds:()=>bounds,container:{innerHTML:'',dataset:{},querySelector:element}});
assert.equal(element('#arrivalPhase').textContent,'На подлёте');
let atmosphericFields=0;scene.traverse(object=>{if(object.userData.lightFieldAtmosphere){assert.deepEqual(object.userData.lightFieldAtmosphere,{fog:true,distanceFade:[...AIRCRAFT_LIGHT_FADE]});atmosphericFields++;}});
assert.equal(atmosphericFields,5,'Cabin, navigation lights, strobes, beacon and landing lights all fade into the atmosphere');
assert.equal(flight.stats().trail.fog,true);assert.deepEqual(flight.stats().trail.distanceFade,[...AIRCRAFT_LIGHT_FADE]);
flight.seek(345.99);flight.setFollowing(true);const offset=camera.position.clone().sub(controls.target);
for(const t of [346,354,365.99,366,380,392,405.99,406,410,444,751.99,752,772,800,811.99,812,816]){
 flight.seek(t);const state=flight.stats();assert.equal(state.renderedVisible,true,'Following mode keeps the distant aircraft visible at '+t);
 assert.ok(camera.position.clone().sub(controls.target).distanceTo(offset)<1e-7,'Following never freezes or changes its orbit offset at '+t);
 assert.ok(controls.target.distanceTo(new THREE.Vector3(...state.bodyPosition))<1e-8,'Following remains anchored through the hidden return at '+t);
}
flight.seek(380);flight.stopFollowing();constrainFreeCamera({camera,controls,bounds,maxHeight:5000});
assert.equal(flight.stats().renderedVisible,false);assert.ok(eyeBox.containsPoint(camera.position),'Releasing a distant follow restores the bounded museum view');
flight.restart();assert.equal(flight.stats().elapsed,0);assert.deepEqual(flight.stats().position,path.sample(0).position.toArray());
assert.equal(flight.stats().status.seconds,148);delete globalThis.document;
console.log('ARRIVAL_ENTRY_PASS',JSON.stringify({minimumEntryDistance,minimumHiddenDistance,maximumRouteRadius,seamChecks,atmosphericFields,followAcrossReturn:true}));
