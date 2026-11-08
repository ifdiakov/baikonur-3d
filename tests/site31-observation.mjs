import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {SITE31_NP_VERSION,NP_MAP_POSITION,planSite31Observation,buildSite31Observation} from '../src/site31-observation-platform.js';
import {MUSEUM_METRE} from '../src/museum-scale.js';
import {createRoyalTentRT100Geometry} from '../src/royaltent-rt100.js';
const roads=[{id:'test-road',width:3.2,points:[new THREE.Vector3(890,0,-730),new THREE.Vector3(950,0,-730)]}];
const before=JSON.stringify(roads),launch=new THREE.Vector3(1000,0,-1000);
const plan=planSite31Observation({launch,roads}),np=buildSite31Observation({plan});
assert.deepEqual(plan.mapCoordinates,NP_MAP_POSITION);
assert(Math.abs(plan.position.x-893.86)<1e-8&&Math.abs(plan.position.z+739.84)<1e-8);
assert.deepEqual(plan.position.toArray(),planSite31Observation({launch,roads:[]}).position.toArray(),'Road/cache changes must not relocate the NP');
assert.equal(JSON.stringify(roads),before,'Never modify source roads');
assert.equal(np.scale.x,MUSEUM_METRE);assert.equal(np.scale.y,np.scale.x);assert.equal(np.scale.z,np.scale.x);
const data=np.userData.observationPlatform;
assert.equal(data.version,SITE31_NP_VERSION);
assert.equal(data.widthMetres,50);assert.equal(data.lengthMetres,35);
assert.equal(data.shelters,2);assert.equal(data.shelterAreaM2,100);
assert.equal(data.tents.length,2,'Both NP shelters must use the same detailed RoyalTent construction');
for(const tent of data.tents){
 assert.equal(tent.width,10);assert.equal(tent.depth,10);
 assert.equal(tent.height,5.549);assert.equal(tent.entryHeight,4.413);
 assert.equal(tent.cornerFeet,4);assert.equal(tent.perimeterArches,4);
 assert.equal(tent.trussChords,3);assert.equal(tent.roofRibs,4);
 assert.equal(tent.sourceURL,'https://royaltent.ru/tent-sale/arochnye-shatry/15-shater-100-metrov/');
}
assert.equal(data.parkingDepthMetres,10);assert.equal(data.wcCabins,6);assert.equal(data.flagpoles,8);assert.equal(data.lamps,5);
assert.equal(np.userData.skipGenericSiteLights,true);
assert.equal(np.userData.facilityLighting.boards.length,5);
np.rotation.y=0;np.position.set(0,0,0);np.updateMatrixWorld(true);
const size=new THREE.Box3().setFromObject(np).getSize(new THREE.Vector3());
assert(Math.abs(size.x-50*MUSEUM_METRE)<.1&&Math.abs(size.z-35*MUSEUM_METRE)<.1);
assert(size.y<7*MUSEUM_METRE,'Flagpoles/roofs must not be stretched vertically');
assert(data.geometry.meshes<=18&&data.geometry.triangles<130000,'Detailed NP should remain batched and lightweight');
function checkGeometry(geometry){
 assert(geometry.attributes.normal,'Every solid part needs normals');
 assert(geometry.attributes.position.array.every(Number.isFinite),'No invalid vertex positions');
 assert(geometry.attributes.normal.array.every(Number.isFinite),'No invalid normals');
}
np.traverse(o=>{if(o.isMesh)checkGeometry(o.geometry)});

// Measure the generated geometry itself. Metadata alone cannot detect a
// stretched tent, a missing membrane patch, or fabric closing the open entry.
const open=createRoyalTentRT100Geometry({front:'open'});
const closed=createRoyalTentRT100Geometry({front:'doors'});
const frame=createRoyalTentRT100Geometry({walls:false,membrane:false});
const rayMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const meshes=parts=>Object.values(parts).map(geometry=>{
 checkGeometry(geometry);const mesh=new THREE.Mesh(geometry,rayMaterial);mesh.updateMatrixWorld(true);return mesh;
});
const openMeshes=meshes(open.parts),closedMeshes=meshes(closed.parts),frameMeshes=meshes(frame.parts);
const bounds=new THREE.Box3();for(const mesh of openMeshes)bounds.union(new THREE.Box3().setFromObject(mesh));
const tentSize=bounds.getSize(new THREE.Vector3());
assert(tentSize.x>=9.8&&tentSize.x<=10.8,'Tent width must remain ten metres including small foot projections');
assert(tentSize.z>=9.8&&tentSize.z<=10.8,'Tent depth must remain ten metres including small foot projections');
assert(bounds.min.y>=-.02&&bounds.max.y>=5.499&&bounds.max.y<=5.62,'Measured overall height must match the 5.549 m reference');
const roof=new THREE.Mesh(open.parts.fabric,rayMaterial);roof.updateMatrixWorld(true);
const skins=[roof];
if(open.parts.film){const cornerFilm=new THREE.Mesh(open.parts.film,rayMaterial);cornerFilm.updateMatrixWorld(true);skins.push(cornerFilm)}
const downward=new THREE.Vector3(0,-1,0),ray=new THREE.Raycaster();
for(let iz=0;iz<=18;iz++)for(let ix=0;ix<=18;ix++){
 const x=-4.5+ix*.5,z=-4.5+iz*.5;
 ray.set(new THREE.Vector3(x,8,z),downward);
 assert(ray.intersectObjects(skins,false).length>0,`The roof or its transparent corner insert must cover ${x}, ${z} without holes`);
}
ray.set(new THREE.Vector3(0,8,0),downward);
const roofPeak=ray.intersectObject(roof,false)[0].point.y;
assert(Math.abs(roofPeak-5.549)<.07,'The membrane crown must keep the reference height');
const entryRay=new THREE.Raycaster(new THREE.Vector3(0,1.8,-6),new THREE.Vector3(0,0,1));
const openHit=entryRay.intersectObjects(openMeshes,false)[0];
assert(!openHit||openHit.distance>2,'A person-height ray must pass through the open tent entrance');
const closedHit=entryRay.intersectObjects(closedMeshes,false)[0];
assert(closedHit&&closedHit.distance<1.6,'The second tent must retain its real door assembly');
assert(frameMeshes.length>0&&Object.values(frame.parts).some(g=>g.attributes.position.count>1000),'Frame-only inspection must contain the actual detailed structure');
assert.equal(frame.parts.metal.attributes.position.count,open.parts.metal.attributes.position.count,'Removing the membrane must preserve the load-bearing frame');
const source=readFileSync('index.html','utf8'),transport=readFileSync('src/osm-transport.js','utf8');
assert(source.includes("siteRoot.add(g)"));assert(source.includes("['np','np31-1']"));
assert(!transport.includes("root.name='НП"),'Transport must not create a duplicate NP after the detailed network loads');
assert(!source.includes('museum-placed-near-existing-road'));
console.log('NP_ROYALTENT_GEOMETRY_PASS',JSON.stringify({size:size.toArray(),tentSize:tentSize.toArray(),roofPeak,...data.geometry}));
for(const variant of [open,closed,frame])for(const geometry of Object.values(variant.parts))geometry.dispose();
rayMaterial.dispose();
