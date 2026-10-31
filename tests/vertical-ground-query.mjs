import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createVerticalGroundQuery} from '../src/vertical-ground-query.js';
import {buildOsmTransportNetwork} from '../src/osm-transport.js';
import {createMuseumGeography} from '../src/osm-geography.js';

const V=(...p)=>new THREE.Vector3(...p),down=V(0,-1,0),ray=new THREE.Raycaster(),near=(a,b,message)=>assert(Math.abs(a-b)<1e-9,message+': '+a+' != '+b);
let syntheticChecks=0;
function compare(query,sources,origin,{ceilings=[-10,0,4,8,100],extra=[],direction=down}={}){
 ray.set(origin,direction);const expected=ray.intersectObjects([...sources,...extra],false),actual=query.intersections(ray,extra);
 assert.equal(actual.length,expected.length,'The query retains every original hit');
 const ordered=hits=>hits.map(h=>({object:h.object.uuid,face:h.faceIndex,distance:h.distance,point:h.point.toArray()})).sort((a,b)=>a.object.localeCompare(b.object)||a.face-b.face);
 const a=ordered(actual),b=ordered(expected);
 for(let i=0;i<a.length;i++){assert.equal(a[i].object,b[i].object);assert.equal(a[i].face,b[i].face);near(a[i].distance,b[i].distance,'Exact triangle distance');a[i].point.forEach((v,j)=>near(v,b[i].point[j],'Exact triangle position'));}
 for(const ceiling of ceilings){const a=actual.find(h=>h.point.y<=ceiling),b=expected.find(h=>h.point.y<=ceiling);assert.equal(!!a,!!b);if(a)near(a.point.y,b.point.y,'Same first permitted ground height');}
 syntheticChecks++;
}

const scene=new THREE.Scene(),frame=new THREE.Group();frame.position.set(11,4,-18);frame.rotation.y=.37;frame.scale.set(1.2,.8,.9);scene.add(frame);
function plane(y,side=THREE.FrontSide){const geometry=new THREE.PlaneGeometry(180,180,3,3);geometry.rotateX(-Math.PI/2);geometry.translate(0,y,0);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side}));frame.add(mesh);return mesh;}
const floor=plane(-5),roof=plane(9),back=plane(3);back.geometry.rotateZ(Math.PI);back.visible=false;
const partial=plane(6,THREE.DoubleSide);partial.geometry.setDrawRange(3,21);
const instances=new THREE.InstancedMesh(new THREE.BoxGeometry(4,2,4),new THREE.MeshBasicMaterial(),2);instances.setMatrixAt(0,new THREE.Matrix4().makeTranslation(11,7,-18));instances.setMatrixAt(1,new THREE.Matrix4().makeTranslation(28,1,-9));scene.add(instances);
const extra=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));extra.rotation.x=-Math.PI/2;extra.position.set(11,5,-18);scene.add(extra);
scene.updateMatrixWorld(true);
const sources=[floor,roof,back,partial,instances],query=createVerticalGroundQuery(sources,{cellSize:16,minimumTriangles:1,maxTriangleCells:4});
for(const x of [-64,0,11,16,28,64])for(const z of [-64,-18,-9,0,16,64])compare(query,sources,V(x,40,z),{extra:[extra]});
back.material.side=THREE.DoubleSide;compare(query,sources,V(11,40,-18));
compare(query,sources,V(11,40,-18),{direction:V(.2,-1,.1).normalize()});
ray.near=5;ray.far=35;compare(query,sources,V(11,40,-18));ray.near=0;ray.far=Infinity;
roof.layers.enable(3);ray.layers.set(3);compare(query,sources,V(11,40,-18));ray.layers.set(0);
frame.position.x+=19;frame.rotation.y+=.23;scene.updateMatrixWorld(true);compare(query,sources,V(30,40,-18));assert(query.stats().staleFallbacks>=1,'Moving a mesh never reuses its old triangle cells');
const geometryQuery=createVerticalGroundQuery([floor,roof],{minimumTriangles:1});
floor.geometry=floor.geometry.clone().translate(0,2,0);compare(geometryQuery,[floor,roof],V(30,40,-18));
const attributeQuery=createVerticalGroundQuery([roof],{minimumTriangles:1});roof.geometry.attributes.position.setY(0,20);roof.geometry.attributes.position.needsUpdate=true;roof.geometry.computeBoundingSphere();compare(attributeQuery,[roof],V(30,40,-18));assert.equal(attributeQuery.stats().staleFallbacks,1);
const rangeQuery=createVerticalGroundQuery([partial],{minimumTriangles:1});partial.geometry.setDrawRange(0,3);compare(rangeQuery,[partial],V(30,40,-18));assert.equal(rangeQuery.stats().staleFallbacks,1);
const interleavedGeometry=new THREE.PlaneGeometry(12,12,2,2).rotateX(-Math.PI/2),interleavedData=new THREE.InterleavedBuffer(Float32Array.from(interleavedGeometry.attributes.position.array),3);
const interleavedPosition=new THREE.InterleavedBufferAttribute(interleavedData,3,0);interleavedGeometry.setAttribute('position',interleavedPosition);
const interleavedMesh=new THREE.Mesh(interleavedGeometry,new THREE.MeshBasicMaterial());scene.add(interleavedMesh);scene.updateMatrixWorld(true);
const interleavedQuery=createVerticalGroundQuery([interleavedMesh],{cellSize:16,minimumTriangles:1});compare(interleavedQuery,[interleavedMesh],V(0,40,0));
for(let i=0;i<interleavedPosition.count;i++)interleavedPosition.setX(i,interleavedPosition.getX(i)+96);
interleavedData.needsUpdate=true;interleavedGeometry.computeBoundingSphere();compare(interleavedQuery,[interleavedMesh],V(96,40,0));
assert.equal(interleavedQuery.stats().staleFallbacks,1,'Interleaved buffer versions invalidate old spatial cells too');

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url))),geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,z,y=0)=>V((x-650)*3.4,y,(z-522.5)*3.4),sites=geography.sites.filter(s=>!s.aliasOf&&s.render!==false),layers={roads:new THREE.Group(),rails:new THREE.Group()};
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson'),airports:read('data/osm/airports.geojson')};
buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords:sites});layers.roads.updateMatrixWorld(true,true);
const ground=[];layers.roads.traverse(m=>{if(m.isMesh&&m.userData.groundSurface!==false&&!m.name.startsWith('road-center-dash'))ground.push(m);});
function fingerprint(){const hash=createHash('sha256');for(const m of ground){for(const a of Object.values(m.geometry.attributes))hash.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));if(m.geometry.index){const a=m.geometry.index;hash.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));}}return hash.digest('hex');}
const before=fingerprint(),origins=[];
for(const site of sites){if(site.type==='airfield'||site.id==='pad-31'||site.id==='pad-23')continue;
 const center=point(site.x,site.y),count=site.type==='city'?12:4,radius=site.id==='pad-1'?19:site.id==='pad-250'?36:site.id==='pad-112'?25:site.type==='city'?23:10;
 for(let j=0;j<count;j++){const a=(j+.5)*Math.PI*2/count;origins.push(V(center.x+Math.cos(a)*radius,1000,center.z+Math.sin(a)*radius));}
}
assert(origins.length>=384,'The independently measured whole-map site-ray sample stays covered');
const originalStarted=performance.now(),expected=origins.map(origin=>{ray.set(origin,down);return ray.intersectObjects(ground,false);}),originalMs=performance.now()-originalStarted;
const acceleratedStarted=performance.now(),accelerated=createVerticalGroundQuery(ground);let maximumHeightError=0,actualHits=0;
for(let i=0;i<origins.length;i++){
 ray.set(origins[i],down);const actual=accelerated.intersections(ray);assert.equal(actual.length,expected[i].length,'Every real ground hit survives spatial filtering');actualHits+=actual.length;
 for(const ceiling of [-2.7,.72,1.2,2,100]){
  const a=actual.find(hit=>hit.point.y<=ceiling),b=expected[i].find(hit=>hit.point.y<=ceiling);assert.equal(!!a,!!b,'Actual site ceiling keeps the same support');
  if(a){const error=Math.abs(a.point.y-b.point.y);maximumHeightError=Math.max(maximumHeightError,error);assert(error<1e-9,'No placement-height change is permitted');}
 }
}
const acceleratedMs=performance.now()-acceleratedStarted,stats=accelerated.stats();
assert.equal(fingerprint(),before,'A query index never changes rendered road geometry');
assert(stats.candidateTriangles<origins.length*stats.indexedTriangles/100,'The query must avoid the measured whole-map triangle scan');
assert.equal(stats.staleFallbacks,0,'Static production ground geometry stays eligible');
console.log('VERTICAL_GROUND_QUERY_PASS',JSON.stringify({syntheticChecks,actualRays:origins.length,actualHits,maximumHeightError,originalMs,acceleratedMs,speedup:originalMs/acceleratedMs,...stats}));
