import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildRoadLightRecords,filterRoadLightStations,createRoadLightField,roadLightingPaths,roadLightLayoutStats,ROAD_LIGHT_STYLES} from '../src/road-lighting.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const highway={id:'highway',width:3.6,osmWayIds:['42','43'],points:[V(0,.72,0),V(100,1.2,0),V(180,3.2,60)]};
const roads=[
 {id:'osm-road-42',width:3.6,osmWayIds:['42'],source:'OpenStreetMap',points:highway.points.slice(0,2)},
 {id:'osm-road-43',width:3.6,osmWayIds:['43'],source:'OpenStreetMap',points:highway.points.slice(1)},
 {id:'r-south-west',width:3.6,points:highway.points.slice(0,2).reverse()},
 {id:'r-south-east',width:3.6,points:highway.points.slice(1)},
 {id:'cosmodrome-road',width:2.4,osmWayIds:['80'],source:'OpenStreetMap',points:[V(0,.72,100),V(200,.72,100)]},
 // A service connector may retain its parent highway's OSM ID. It still gets
 // its own single vintage lights, not suppressed as a duplicate highway way.
 {id:'osm-access-pad-1',width:1.8,osmWayIds:['42'],source:'museum-model-port',points:[V(0,2,200),V(100,2,200)]}
];
roads.osmVehiclePlan={highway};
const paths=roadLightingPaths(roads);
assert.deepEqual(paths.map(p=>p.id),['highway','cosmodrome-road','osm-access-pad-1']);
const records=buildRoadLightRecords(roads),layout=roadLightLayoutStats(records);
assert.equal(layout.highway.lamps,10);assert.equal(layout.highway.stations,5);
assert.equal(layout.cosmodrome.lamps,10);assert.equal(layout.cosmodrome.stations,10);
assert.equal(layout.highway.spacing,58/1.5);assert.equal(layout.cosmodrome.spacing,29);
for(const [id,factor]of [['highway',1.5],['cosmodrome',2]]){
 assert.equal(layout[id].brightness,factor);assert.equal(layout[id].density,factor);assert.equal(layout[id].poolScale,factor);
}
assert.equal(ROAD_LIGHT_STYLES.highway.color,0xd8e8ff);assert.equal(ROAD_LIGHT_STYLES.cosmodrome.color,0xffbf7b);
const singles=records.filter(r=>r.roadId==='cosmodrome-road');
for(let i=1;i<singles.length;i++)assert.ok(Math.abs(singles[i].center[0]-singles[i-1].center[0]-29)<1e-9,'Single vintage lamps are twice as frequent');
assert.deepEqual(layout.highway.incompletePairs,[]);assert.deepEqual(layout.cosmodrome.extraLamps,[]);
const groups=new Map();for(const r of records){const g=groups.get(r.stationId)||[];g.push(r);groups.set(r.stationId,g);}
for(const group of groups.values()){
 if(group[0].style==='highway'){
  assert.equal(group.length,2);assert.deepEqual(group.map(r=>r.side).sort(),[-1,1]);
  const center=V(...group[0].center),mid=V(group[0].x,center.y,group[0].z).lerp(V(group[1].x,center.y,group[1].z),.5);
  assert.ok(mid.distanceTo(center)<1e-10,'Opposite poles share an exact road cross-section');
 }else assert.equal(group.length,1,'Cosmodrome station has one lamp');
 for(const r of group){
  const style=ROAD_LIGHT_STYLES[r.style],road=paths.find(p=>p.id===r.roadId);
  assert.equal(r.color,style.color);assert.equal(r.brightness,style.brightness);assert.ok(Math.abs(V(...r.poolAxis).length()-1)<1e-9);
  assert.ok(Math.abs(r.poolRadiusX-road.width*.46*style.poolScale)<1e-9);
  assert.equal(r.poolRadiusY,8.5*style.poolScale,'Both linear pool dimensions grow by the requested factor');
 }
}
const first=records.filter(r=>r.stationId==='highway:0');
assert.equal(first.length,2);
const excludesOneSide=(x,z)=>!(x<30&&z<0);
for(const rule of ['isLightAllowed','isPoleAllowed']){
 const filtered=filterRoadLightStations(records,{[rule]:excludesOneSide});
 assert.equal(filtered.records.length,records.length-2);
 assert.equal(filtered.records.filter(r=>r.stationId==='highway:0').length,0,'A rejected side excludes the pair atomically');
 assert.deepEqual(roadLightLayoutStats(filtered.records).highway.incompletePairs,[]);
}
const powered=filterRoadLightStations(records,{isLightPowered:excludesOneSide});
assert.equal(powered.records.filter(r=>r.stationId==='highway:0'&&r.powered===false).length,2);
const root=new THREE.Group(),field=createRoadLightField(root,powered.records);
assert.equal(field.stats().physicalPoles,20);assert.equal(field.stats().fixtureDrawCalls,5);
const meshes=field.root.children.filter(o=>o.isInstancedMesh),pointLights=[];root.traverse(o=>{if(o.isPointLight)pointLights.push(o);});
assert.equal(pointLights.length,0,'Network illumination stays batched');
assert.equal(meshes.filter(m=>m.userData.roadFixture==='highway').length,2);
assert.equal(meshes.filter(m=>m.userData.roadFixture==='cosmodrome').length,3);
const glow=field.root.children.find(o=>o.isPoints),pool=meshes.find(o=>!o.userData.roadFixture),matrix=new THREE.Matrix4();
assert.deepEqual([...glow.geometry.attributes.enabled.array].slice(0,2),[0,0]);
pool.getMatrixAt(0,matrix);assert.ok(matrix.elements[13]<-50000,'Unpowered pools are hidden');
const metal=meshes.find(o=>o.userData.roadFixture==='highway'&&o.userData.fixturePart==='hardware');
metal.getMatrixAt(0,matrix);assert.ok(matrix.elements[13]>-50000,'Unpowered poles remain physical');
field.setEvening(false);assert.equal(field.root.visible,true);assert.equal(field.stats().emissiveIntensity,0);
assert.equal(glow.material.uniforms.strength.value,0);assert.equal(pool.material.uniforms.strength.value,0);
for(const style of Object.values(field.stats().styles))assert.equal(style.emissiveIntensity,0);
field.setEvening(true);assert.ok(field.stats().emissiveIntensity>0);assert.equal(field.stats().hardwareVisible,true);
assert.ok(Math.abs(field.stats().styles.highway.emissiveIntensity-2.475)<1e-9);
assert.ok(Math.abs(field.stats().styles.cosmodrome.emissiveIntensity-3.3)<1e-9);
// Halos follow the actual cantilever head instead of floating above the mast.
for(let i=0;i<field.records.length;i++){
 const r=field.records[i],p=V().fromBufferAttribute(glow.geometry.attributes.position,i);
 assert.ok(Math.hypot(p.x-r.x,p.z-r.z)>.55);assert.ok(Math.abs(p.y-r.lightY)<1e-5);
 assert.equal(glow.geometry.attributes.lightIntensity.getX(i),r.style==='highway'?1.5:2,'Mixed-style halos carry individual brightness');
 assert.equal(pool.geometry.attributes.lightIntensity.getX(i),r.style==='highway'?1.5:2,'Mixed-style road spill carries individual brightness');
}
// A road spill is tangent to the graded carriageway and elongated along it.
const index=field.records.findIndex(r=>r.poolAxis[1]>.01&&r.powered!==false);assert.ok(index>=0);
pool.getMatrixAt(index,matrix);const along=V().setFromMatrixColumn(matrix,1).normalize();
assert.ok(along.dot(V(...field.records[index].poolAxis))>.999999);
assert.ok(Math.abs(V().setFromMatrixColumn(matrix,0).length()-field.records[index].poolRadiusX)<1e-6);
assert.ok(Math.abs(V().setFromMatrixColumn(matrix,1).length()-field.records[index].poolRadiusY)<1e-6);
console.log('ROAD_LIGHTING_GEOMETRY_PASS',JSON.stringify({layout,fixtures:field.stats(),atomicPairFiltering:true,daylightPoles:true,gradeAlignedPools:true,perStyleBrightness:true,linearPoolScaling:true}));
