import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {buildMzkSdi,MZK_SDI_REFERENCE} from '../src/mzk-sdi.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {FACILITY_PORTS,portWorld} from '../src/facility-ports.js';
import {OSM_RUNTIME_ANCHORS,projectOsm,METRES_PER_MAP_UNIT,WORLD_UNITS_PER_MAP_UNIT} from '../src/osm-geography.js';

const near=(actual,expected,tolerance,message)=>assert.ok(Math.abs(actual-expected)<=tolerance,
 `${message}: ${actual} differs from ${expected}`);
const nearPoint=(actual,expected,tolerance,message)=>{
 assert.equal(actual.length,expected.length,message+' dimension');
 actual.forEach((value,index)=>near(value,expected[index],tolerance,message+'['+index+']'));
};
const load=path=>readFile(new URL(path,import.meta.url),'utf8').then(JSON.parse);
const [named,airports]=await Promise.all([
 load('../data/osm/named-buildings.geojson'),load('../data/osm/airports.geojson')
]);
const sources=new Map(named.features.map(feature=>[feature.id,feature]));
const airportSources=new Map(airports.features.map(feature=>[feature.id,feature]));
const reference=MZK_SDI_REFERENCE,entry=ARCHIVE_MAP.find(site=>site.id==='pad-112a');
const port=FACILITY_PORTS['pad-112a'],anchor=OSM_RUNTIME_ANCHORS['pad-112a'];
const root=new THREE.Group(),result=buildMzkSdi(root),metadata=root.userData.mzkSdi;
assert.equal(reference.version,'mzk-sdi-photo-v3');
assert.equal(metadata.version,reference.version);
assert.equal(metadata.layoutBasis,'OSM-component-centres-and-axes');
assert.strictEqual(result.mzkSdi,metadata);
assert.ok(!('frame' in metadata.mzk),'Public metadata must omit the THREE frame');
assert.doesNotThrow(()=>JSON.stringify(metadata),'Model evidence must remain serializable');
assert.equal(entry.kind,'mzk');
assert.equal(entry.scale,reference.scale);assert.equal(entry.yaw,reference.yaw);
assert.equal(port.scale,entry.scale);assert.equal(port.yaw,entry.yaw);
assert.deepEqual(port.road,reference.roadPort);assert.deepEqual(metadata.roadPort,port.road);
assert.equal(port.railConnections.length,4,'Both MZK and SDI expose their two source-bound head ports');
assert.deepEqual(port.railConnections.map(p=>p.sourceNodeId).sort(),['1834612260','2529010042','2529010043','6336523428']);

// Recompute the placement from the archived contours, not from the model's
// constants. Subtracting a local origin avoids cancellation in the centroid.
function centroid(ring){
 const origin=ring[0];let twiceArea=0,x=0,y=0;
 for(let i=1;i<ring.length;i++){
  const a=ring[i-1].map((value,axis)=>value-origin[axis]);
  const b=ring[i].map((value,axis)=>value-origin[axis]);
  const cross=a[0]*b[1]-b[0]*a[1];
  twiceArea+=cross;x+=(a[0]+b[0])*cross;y+=(a[1]+b[1])*cross;
 }
 assert.ok(Math.abs(twiceArea)>1e-15,'Source footprint must have area');
 return [origin[0]+x/(3*twiceArea),origin[1]+y/(3*twiceArea)];
}
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*WORLD_UNITS_PER_MAP_UNIT,h,(y-522.5)*WORLD_UNITS_PER_MAP_UNIT);
const geographicPoint=lonLat=>point(...projectOsm(lonLat));
const up=new THREE.Vector3(0,1,0),anchorWorld=geographicPoint(anchor.lonLat);
const sourceCentres=[],footprints={};
for(const [key,id] of [['mzk','way/172704643'],['sdi','way/172704656']]){
 const feature=sources.get(id);assert.ok(feature,'Missing '+id);
 assert.deepEqual(feature.geometry,airportSources.get(id)?.geometry,'Archived contour copies disagree for '+id);
 assert.equal(feature.geometry.type,'Polygon');
 const ring=feature.geometry.coordinates[0],lonLat=centroid(ring);
 sourceCentres.push(lonLat);
 const local=geographicPoint(lonLat).sub(anchorWorld).applyAxisAngle(up,-entry.yaw).divideScalar(entry.scale);
 const expectedCentre=[local.x,local.z],component=metadata[key];
 const actualCentre=key==='mzk'?component.center:[component.position[0],component.position[2]];
 nearPoint(reference[key].center,expectedCentre,1e-4,key+' reference centre follows OSM');
 nearPoint(actualCentre,expectedCentre,1e-4,key+' built centre follows OSM');
 near(component.yaw,reference[key].yaw,1e-8,key+' reported yaw');
 for(const dimension of ['width','depth','height'])
  near(component.dimensions[dimension],reference[key][dimension],1e-8,key+' '+dimension);
 if(key==='sdi')near(component.position[1],0,1e-8,'SDI is grounded');

 const vertices=ring.map(geographicPoint);let longest=new THREE.Vector3();
 for(let i=1;i<vertices.length;i++){
  const edge=vertices[i].clone().sub(vertices[i-1]);
  if(edge.lengthSq()>longest.lengthSq())longest=edge;
 }
 const axis=longest.normalize(),across=new THREE.Vector3(-axis.z,0,axis.x);
 const modelAxis=new THREE.Vector3(1,0,0).applyAxisAngle(up,entry.yaw+component.yaw);
 near(Math.abs(modelAxis.dot(axis)),1,1e-8,key+' long X axis follows its OSM edge');
 const extent=direction=>{
  const values=vertices.map(vertex=>vertex.dot(direction));
  return (Math.max(...values)-Math.min(...values))*METRES_PER_MAP_UNIT/WORLD_UNITS_PER_MAP_UNIT;
 };
 footprints[key]={length:extent(axis),width:extent(across)};
}
nearPoint(anchor.lonLat,sourceCentres[0].map((value,i)=>(value+sourceCentres[1][i])/2),1e-12,'Shared source midpoint');
near(reference.mzk.width,footprints.mzk.length,.02,'MZK length uses its source footprint');
near(reference.mzk.depth,footprints.mzk.width,.02,'MZK depth uses its source footprint');
near(reference.mzk.height,Number(sources.get('way/172704643').properties.tags.height),1e-8,'MZK height uses its OSM tag');

// These are structural distinctions in the new photographs. Window, panel
// and brace counts are deliberately free to change during visual refinement.
for(const [tag,count] of Object.entries({
 'mzk-main-volume':1,'mzk-service-tower':4,'mzk-end-portal-recess':2,
 'sdi-closed-side-wall':2,'sdi-closed-rear-wall':1
}))assert.equal(result.features[tag],count,tag);
for(const tag of ['sdi-closed-gate-infill','sdi-projecting-door-guide'])
 assert.ok(result.features[tag]>0,'Missing '+tag);
assert.equal(metadata.mzk.roof,'flat');
assert.equal(metadata.sdi.state,'closed-sliding-gate');
assert.equal(metadata.sdi.guideType,'attached-horizontal-sliding-door-guide');
assert.equal(metadata.sdi.detachedCrane,false);

// Validate the rendered instances as well as their reported evidence. The
// kit bakes component transforms into root-level batches, so group bounds
// alone would silently miss a misplaced hall or wall.
root.updateWorldMatrix(true,true);
const boxInstances=[],asphalt=[],instance=new THREE.Matrix4();
let draws=0,triangles=0,instances=0;
root.traverse(object=>{
 if(!object.isMesh)return;
 draws++;assert.ok(object.geometry.attributes.position,'Every mesh has vertices');
 for(const attribute of Object.values(object.geometry.attributes))
  for(const value of attribute.array)assert.ok(Number.isFinite(value),'Non-finite geometry attribute');
 for(const value of object.matrixWorld.elements)assert.ok(Number.isFinite(value),'Non-finite mesh transform');
 const count=object.isInstancedMesh?object.count:1;
 triangles+=(object.geometry.index?.count||object.geometry.attributes.position.count)/3*count;
 if(object.material.name==='museum / asphalt')asphalt.push(object);
 if(!object.isInstancedMesh)return;
 instances+=count;
 for(let i=0;i<count;i++){
  object.getMatrixAt(i,instance);
  for(const value of instance.elements)assert.ok(Number.isFinite(value),'Non-finite instance transform');
  assert.ok(instance.determinant()>0,'Primitive transforms must retain positive volume');
  if(object.geometry.type!=='BoxGeometry')continue;
  const matrix=object.matrixWorld.clone().multiply(instance),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),size=new THREE.Vector3();
  matrix.decompose(position,rotation,size);boxInstances.push({matrix,position,size});
 }
});
assert.equal(draws,result.meshCount);
assert.ok(draws<48,'Photographic details must remain batched');
assert.ok(triangles<150000,'Unexpected geometry growth');
const bounds=new THREE.Box3().setFromObject(root),boundsSize=bounds.getSize(new THREE.Vector3());
for(const value of [...bounds.min.toArray(),...bounds.max.toArray()])assert.ok(Number.isFinite(value));
nearPoint(result.boundsSize,boundsSize.toArray(),1e-5,'Reported bounds match actual geometry');
assert.ok(bounds.min.y>=-1&&bounds.min.y<=.1,'The exhibit is grounded with at most shallow embedded footings');
assert.ok(bounds.max.y>=reference.sdi.height&&bounds.max.y<reference.sdi.height*1.15,'SDI defines the tall silhouette');

const unitBox=new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5));
const hallSize=new THREE.Vector3(reference.mzk.width,reference.mzk.height,reference.mzk.depth);
const halls=boxInstances.filter(box=>box.size.distanceTo(hallSize)<1e-4);
assert.equal(halls.length,1,'There must be one rendered full-height MZK hall');
nearPoint(halls[0].position.toArray(),[reference.mzk.center[0],reference.mzk.height/2,reference.mzk.center[1]],1e-4,'Rendered MZK centre');
function frameInverse(component){
 return new THREE.Matrix4().compose(new THREE.Vector3(component.center[0],0,component.center[1]),
  new THREE.Quaternion().setFromAxisAngle(up,component.yaw),new THREE.Vector3(1,1,1)).invert();
}
const hallLocal=unitBox.clone().applyMatrix4(frameInverse(reference.mzk).multiply(halls[0].matrix));
nearPoint(hallLocal.getSize(new THREE.Vector3()).toArray(),hallSize.toArray(),2e-4,'Rendered MZK axes and dimensions');
near(hallLocal.min.y,0,1e-5,'The MZK main volume rests on the ground');
const sdi=reference.sdi,walls=boxInstances.filter(({size})=>
 size.y>sdi.height*.95&&size.y<sdi.height*1.01&&
 ((size.x<sdi.width*.1&&size.z>sdi.depth*.9)||(size.z<sdi.depth*.1&&size.x>sdi.width*.9)));
assert.equal(walls.length,3,'SDI must have three rendered full-height enclosing walls');
const standLocal=new THREE.Box3(),standRoot=new THREE.Box3();
for(const wall of walls){
 standLocal.union(unitBox.clone().applyMatrix4(frameInverse(sdi).multiply(wall.matrix)));
 standRoot.union(unitBox.clone().applyMatrix4(wall.matrix));
}
const standSize=standLocal.getSize(new THREE.Vector3()),standCentre=standLocal.getCenter(new THREE.Vector3());
near(standSize.x,sdi.width,2e-4,'Rendered SDI width');near(standSize.z,sdi.depth,2e-4,'Rendered SDI depth');
near(standLocal.max.y,sdi.height,2e-4,'Rendered SDI height');
near(standCentre.x,0,1e-4,'Rendered SDI centre X');near(standCentre.z,0,1e-4,'Rendered SDI centre Z');
assert.ok(!standRoot.intersectsBox(unitBox.clone().applyMatrix4(halls[0].matrix)),'The two buildings must remain separate');
for(const name of ['gateThreshold','gateCentre','guideTip','roofCentre'])
 assert.ok(metadata.sdi[name].length===3&&metadata.sdi[name].every(Number.isFinite),'Invalid SDI '+name);
const guide=new THREE.Vector3(...metadata.sdi.guideTip).applyMatrix4(frameInverse(sdi));
assert.ok(guide.x>sdi.width/2&&guide.y>0&&guide.y<sdi.height,'The attached door guide projects sideways below the roof');

// A matching metadata point alone cannot prove the visible access is joined.
// Check the authored route endpoint, then raycast the actual asphalt at the
// transformed network port after applying the real exhibit transform.
assert.ok(Array.isArray(metadata.roads)&&metadata.roads.length>0);
let endpointMatches=false;
for(const route of metadata.roads){
 assert.ok(Array.isArray(route)&&route.length>=2,'Internal access needs a route');
 for(const p of route)assert.ok(p.length===2&&p.every(Number.isFinite),'Invalid internal road point');
 for(const p of [route[0],route.at(-1)])
  if(Math.hypot(p[0]-port.road[0],p[1]-port.road[2])<1e-6)endpointMatches=true;
}
assert.ok(endpointMatches,'An internal road must terminate at the declared network port');
root.position.copy(anchorWorld).setY(port.elevation??-2.72);
root.rotation.y=entry.yaw;root.scale.setScalar(entry.scale);root.updateWorldMatrix(true,true);
const siteMap=projectOsm(anchor.lonLat),site={x:siteMap[0],y:siteMap[1]};
const networkPort=portWorld(port,port.road,site,point),modelPort=root.localToWorld(new THREE.Vector3(...metadata.roadPort));
near(modelPort.distanceTo(networkPort),0,1e-8,'Rendered exhibit and network share the road port');
assert.ok(asphalt.length>0,'The access road needs a rendered asphalt surface');
const ray=new THREE.Raycaster(networkPort.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0),0,2);
const accessHits=ray.intersectObjects(asphalt,false);
assert.ok(accessHits.some(hit=>hit.point.distanceTo(networkPort)<1e-4),'The actual asphalt must reach the world-space network port');

console.log('MZK_SDI_GEOMETRY_PASS',JSON.stringify({version:metadata.version,draws,triangles,instances,
 bounds:boundsSize.toArray(),footprints,componentDistanceMetres:geographicPoint(sourceCentres[0]).distanceTo(geographicPoint(sourceCentres[1]))*METRES_PER_MAP_UNIT/WORLD_UNITS_PER_MAP_UNIT,
 roadPort:networkPort.toArray()}));
