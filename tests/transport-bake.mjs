import assert from 'node:assert/strict';
import * as THREE from 'three';
import {distancePath} from '../src/traffic-paths.js';
import {serializeTransport,restoreBakedTransport,TRANSPORT_BAKE_VERSION,transportSourceFingerprint} from '../src/transport-bake.js';
import {TRANSPORT_GROUND_VERSION,ROAD_SURFACE_Y} from '../src/transport-ground-profile.js';
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const roadRoot=new THREE.Group();roadRoot.name='OpenStreetMap · автодороги';layers.roads.add(roadRoot);
const railRoot=new THREE.Group();railRoot.name='OpenStreetMap · железнодорожные пути';layers.rails.add(railRoot);
roadRoot.add(new THREE.Mesh(new THREE.PlaneGeometry(12,4),new THREE.MeshStandardMaterial({color:0x5f696b})));
railRoot.add(new THREE.Mesh(new THREE.PlaneGeometry(12,2),new THREE.MeshBasicMaterial({color:0x817765})));
const label=new THREE.Group();railRoot.add(label);const anchor=new THREE.Object3D();label.add(anchor);
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const route={...distancePath([v(0,1,0),v(60,1,0),v(120,1,0)]),id:'highway',label:'Road',width:6,source:'OpenStreetMap',
 osmWayIds:['a'],vehicleScale:.64,widthAt:dist=>dist<60?6:4};
const roads=[{id:'r-south-west',width:6,points:[v(0,0,0),v(5,0,0)]}, {id:'r-south-east',width:6,points:[v(5,0,0),v(10,0,0)]}];
// A small terrain crest is below the overview's lateral simplification
// budget, but it must survive the independent 0.005 vertical budget.
roads.push({id:'ground-crest',width:2,points:[v(0,ROAD_SURFACE_Y,20),v(10,ROAD_SURFACE_Y+.012,20),v(20,ROAD_SURFACE_Y,20)]});
roads.osmVehiclePlan={routes:[route],highway:route,source:'OpenStreetMap',joins:[]};
roads.displayHighwayExtensions=[];
const train={path:distancePath([v(0,1,0),v(0,1,80)]),gauge:1.52,source:'OpenStreetMap'};
const original={
 roadPaths:()=>roads,editableRoadPaths:()=>roads,terrainPaths:()=>({roads,rails:[]}),
 trainPath:()=>train,stationLabels:()=>[{id:'station',name:'Тюратам',record:{label:'Тюратам'},group:label,anchor}],
 routes:{road:[],rail:[]},roadMarkingPlan:{quads:[{}],stats:{segments:1}},
 highwayDisplay:{stats:()=>({version:'test'})},
 bridgeObjects:()=>[],stats:()=>({roadFeatureCount:3185,renderedRoadWays:1,buildMilliseconds:4000})
};
const fingerprint=transportSourceFingerprint({roads:{features:[{a:1}]},railways:{features:[{b:2}]},
 ownerRoadEdits:{edits:[]},siteRecords:[{id:'pad-1',x:100,y:200}]});
const payload=serializeTransport({transport:original,layers,mik112Rail:{connected:true,tracks:[]},sourceFingerprint:fingerprint});
assert.equal(payload.version,TRANSPORT_BAKE_VERSION);
assert.equal(payload.groundVersion,TRANSPORT_GROUND_VERSION);
assert.equal(payload.roads.find(p=>p.id==='ground-crest').points.length,3,'Do not flatten a terrain crest during route packing');
const target={roads:new THREE.Group(),rails:new THREE.Group()};
assert.throws(()=>restoreBakedTransport({bake:{...payload,groundVersion:undefined},layers:target}),/Outdated/,'Reject a cache with the former raised datum');
assert.throws(()=>restoreBakedTransport({bake:payload,layers:target,sourceFingerprint:'wrong'}),/changed/);
const baked=restoreBakedTransport({bake:JSON.parse(JSON.stringify(payload)),layers:target,sourceFingerprint:fingerprint});
assert.equal(baked.stats().baked,true);
assert.equal(baked.stats().sourceBuildMilliseconds,4000);
assert.equal(baked.roadPaths().osmVehiclePlan.highway.sample(18).position.x,18);
assert.equal(baked.roadPaths().osmVehiclePlan.highway.widthAt(0),6);
assert.equal(baked.roadPaths().osmVehiclePlan.highway.widthAt(120),4);
assert.equal(baked.stationLabels()[0].name,'Тюратам');
assert(baked.bridgeObjects().length===0);
assert(target.roads.getObjectByName('OpenStreetMap · автодороги'));
assert(target.rails.getObjectByName('OpenStreetMap · железнодорожные пути'));
assert.equal(baked.trainPath().path.position(40).z,40);
console.log('TRANSPORT_BAKE_UNIT_PASS');
