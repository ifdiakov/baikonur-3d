import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildSite31Pad,SITE31_VERSION,SITE31_PIT,SITE31_PORTS} from '../src/site31-pad.js';
import {SITE31_YAW,SITE31_REFERENCE,SITE31_RIM,site31RimAt} from '../src/site31-trench-profile.js';
import {FACILITY_PORTS} from '../src/facility-ports.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {buildArchiveModel} from '../src/archive-models.js';
import {createTerrainVoids} from '../src/terrain-voids.js';
import {buildTransportNetwork} from '../src/transport-network.js';
import {RAIL_PROFILE} from '../src/gagarin-rail-approach.js';

const siteRecords=JSON.parse(fs.readFileSync('data/catalog.json','utf8')).sites;
const site=siteRecords.find(s=>s.id==='pad-31'),manifest=ARCHIVE_MAP.find(s=>s.id==='pad-31');
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const root=new THREE.Group();root.scale.setScalar(manifest.scale);root.rotation.y=manifest.yaw;
root.position.copy(point(site.x,site.y,-2.72));
const result=buildSite31Pad(root);root.updateMatrixWorld(true);
const model=result.site31;
assert.equal(model.version,SITE31_VERSION);assert.equal(SITE31_VERSION,'site31-satellite-trench-v3');
assert.equal(model.siteId,'pad-31');assert.equal(model.orientationVerified,true);
assert.equal(model.orientationScope,'local-plan-from-satellite');
assert.equal(model.heightsVerified,false,'The satellite plan does not establish elevations');
assert.equal(model.globalMapAnchorSurveyed,false,'The museum map anchor is still schematic');
assert.equal(model.satellite.imageryDate,'2025-08-09');assert.equal(model.satellite.satellite,'WorldView-3');
assert.equal(model.satellite.heightsVerified,false);assert.equal(model.satellite.globalMapAnchorSurveyed,false);
assert.equal(result.cutouts.length,1);assert.deepEqual(result.cutouts[0],SITE31_PIT);
assert.equal(model.supportingArms,4);assert.equal(result.features['support-arm-gripper'],4);
assert.equal(model.serviceMasts,2);assert.equal(model.serviceDecks,16);
assert.equal(result.features['soyuz-booster-body'],4);assert.equal(result.features['soyuz-core-stage'],1);
assert.ok(result.features['service-mast-cross-lattice']>100);
assert.ok(result.features['excavation-stair-tread']>50);
assert.ok(result.primitiveCount>1800,'Site31 should retain detailed open structures');
assert.ok(result.meshCount<100,'Fine lattice work must be instanced');
assert.deepEqual(SITE31_PORTS.road,FACILITY_PORTS['pad-31'].road);
assert.deepEqual(SITE31_PORTS.rail,FACILITY_PORTS['pad-31'].rail[0]);
assert.equal(manifest.scale,.28);assert.equal(manifest.yaw,SITE31_YAW);
assert.equal(FACILITY_PORTS['pad-31'].yaw,manifest.yaw);
assert.equal(FACILITY_PORTS['pad-31'].scale,manifest.scale);

// Check transformed directions against the measured north-up image vector,
// independently of the yaw fields shared by the constructors.
const railDirection=new THREE.Vector3(0,0,1).transformDirection(root.matrixWorld);
const ductDirection=new THREE.Vector3(0,0,-1).transformDirection(root.matrixWorld);
const tracedRailDirection=new THREE.Vector3(245,0,210).normalize();
assert.ok(railDirection.angleTo(tracedRailDirection)<THREE.MathUtils.degToRad(2),'The incoming rail points south-east in world space');
assert.ok(ductDirection.x<0&&ductDirection.z<0,'The actual exhaust axis points north-west');
const bearing=v=>(THREE.MathUtils.radToDeg(Math.atan2(v.x,-v.z))+360)%360;
assert.ok(Math.abs(bearing(ductDirection)-310.6013)<.01);

const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const onSegment=(p,a,b)=>Math.abs(cross(a,b,p))<1e-7&&p[0]>=Math.min(a[0],b[0])-1e-7&&p[0]<=Math.max(a[0],b[0])+1e-7&&p[1]>=Math.min(a[1],b[1])-1e-7&&p[1]<=Math.max(a[1],b[1])+1e-7;
function inside(p,polygon){
 let value=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i];if(onSegment(p,a,b))return false;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])value=!value;
 }
 return value;
}
const crosses=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8;
const polygon=SITE31_PIT.polygon;
assert.equal(SITE31_PIT.shape,'polygon');assert.deepEqual(polygon,SITE31_RIM);
assert.ok(polygon.length>=20&&polygon.flat().every(Number.isFinite));
const area=Math.abs(polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
assert.ok(area>5000,'The cutout retains the broad asymmetric basin');
for(let i=0;i<polygon.length;i++)for(let j=i+2;j<polygon.length;j++){
 if(i===0&&j===polygon.length-1)continue;
 assert.ok(!crosses(polygon[i],polygon[(i+1)%polygon.length],polygon[j],polygon[(j+1)%polygon.length]),'Cutout edges must not self-intersect');
}
for(const p of [[0,0],[-5,-35],[0,-100],[4,-145]])assert.ok(inside(p,polygon),'Traced basin contains '+p);
for(const p of [[0,45],[80,-90],[-100,-100],[60,133]])assert.ok(!inside(p,polygon),'Cutout excludes '+p);
const minZ=Math.min(...polygon.map(p=>p[1])),maxZ=Math.max(...polygon.map(p=>p[1]));
assert.ok(minZ<-140&&minZ>-165,'The mouth follows the approximately 152 m satellite trace');
assert.equal(site31RimAt(minZ-1),null);assert.equal(site31RimAt(maxZ+1),null);
for(let z=minZ+.25;z<maxZ;z+=1.7){
 const span=site31RimAt(z);assert.ok(span?.every(Number.isFinite)&&span[1]>span[0]);
 assert.ok(inside([(span[0]+span[1])/2,z],polygon),'Each cutout scanline is inside the traced basin');
}

// The shader uses these world-to-local uniforms. Verify the actual rotated
// cutout binding; CPU raycasting alone cannot inspect fragment discards.
const voids=createTerrainVoids(),cutout=voids.add(root,SITE31_PIT);
for(const local of [[0,0,0],[4,0,-145],[-100,0,-100]]){
 const world=root.localToWorld(new THREE.Vector3(...local)),back=world.clone().applyMatrix4(cutout.inverse.value);
 assert.ok(back.distanceTo(new THREE.Vector3(...local))<1e-8);
 assert.equal(inside([back.x,back.z],polygon),inside([local[0],local[2]],polygon));
}
for(const [x,z]of polygon){
 const p=root.localToWorld(new THREE.Vector3(x,0,z)),b=cutout.bounds.value;
 assert.ok(p.x>=b.x&&p.x<=b.z&&p.z>=b.y&&p.z<=b.w,'Rotated rim remains inside the cutout world bounds');
}

const meshes=[];root.traverse(o=>{
 if(!o.isMesh)return;
 let p=o,rocket=false;while(p&&p!==root){if(p.name==='«Союз» · музейная предстаровая композиция')rocket=true;p=p.parent;}
 if(!rocket)meshes.push(o);
 assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite),o.name+' has finite vertices');
 if(o.isInstancedMesh)assert.ok([...o.instanceMatrix.array].every(Number.isFinite),o.name+' has finite transforms');
});
const component=name=>{const matches=[];root.traverse(o=>{if(o.userData.museumComponent===name)matches.push(o);});assert.equal(matches.length,1,name+' is built exactly once');return matches[0];};
const duct=component('site31-gas-duct'),floor=component('site31-gas-duct-floor'),banks=component('site31-gas-duct-banks');
assert.equal(floor.parent,duct);assert.equal(banks.parent,duct);
function down(x,z,objects=meshes,y=10){
 const origin=root.localToWorld(new THREE.Vector3(x,y,z));
 const hit=new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0)).intersectObjects(objects,false)[0];
 return hit?{...hit,local:root.worldToLocal(hit.point.clone())}:null;
}
const launchHit=down(0,0);assert.ok(launchHit,'Open chamber floor is present');
assert.ok(Math.abs(launchHit.local.y+24)<1e-5,'The launch axis is open through the table and bridge down to the chamber');
assert.ok(Math.abs(launchHit.local.y-model.pitFloorY)<1e-5);

// Cast at both sides and between section seams. A missing triangle, flipped
// face or solid cover must fail even if the descriptive metadata is correct.
const sections=model.trench.sections;assert.ok(sections.length>40);
let floorProbes=0,clearanceProbes=0,maxFloorError=0;
for(let i=1;i<sections.length;i++){
 const a=sections[i-1],b=sections[i];assert.ok(a.z>b.z,'Duct sections advance towards the mouth');
 for(const t of [.2,.5,.8]){
  const z=THREE.MathUtils.lerp(a.z,b.z,t),left=THREE.MathUtils.lerp(a.floorLeft,b.floorLeft,t),right=THREE.MathUtils.lerp(a.floorRight,b.floorRight,t);
  for(const widthFraction of [.18,.5,.82]){
   const x=THREE.MathUtils.lerp(left,right,widthFraction),hit=down(x,z,[floor]);
   assert.ok(hit,'Continuous floor at x='+x+', z='+z);
   const error=Math.abs(hit.local.y-THREE.MathUtils.lerp(a.floorY,b.floorY,t));maxFloorError=Math.max(maxFloorError,error);
   assert.ok(error<2e-4,'Rendered floor follows a continuous longitudinal section');floorProbes++;
   if(z< -33&&right-left>1){
    const visible=down(x,z);assert.ok(visible,'Uncovered duct remains visible from above');
    assert.ok(visible.local.y-hit.local.y<.2,'No road, cap or apron above the duct at '+x+','+z+': '+visible.object.name);
    clearanceProbes++;
   }
  }
 }
}
let previousY=-24;
for(let z=-22;z>minZ+.25;z-=1){
 const i=sections.findIndex((s,j)=>j&&sections[j-1].z>=z&&s.z<=z),a=sections[i-1],b=sections[i],t=(a.z-z)/(a.z-b.z);
 const hit=down(THREE.MathUtils.lerp(a.center,b.center,t),z,[floor]);assert.ok(hit);
 assert.ok(hit.local.y>=previousY-1e-4,'The exhaust floor rises continuously towards its mouth');
 assert.ok(hit.local.y-previousY<1,'No vertical step closes the outlet');previousY=hit.local.y;
}
assert.ok(previousY>-.1,'The visible floor reaches ground level at the mouth');
// Above-grade rays cross the entire mouth, including its centre. The side
// coping is lower than these probes; a transverse wall would obstruct them.
const mouthX=site31RimAt(minZ)[0],mouthDirection=new THREE.Vector3(0,0,1).transformDirection(root.matrixWorld);
for(const y of [.35,1.5,3])for(const dx of [-.2,0,.2]){
 const origin=root.localToWorld(new THREE.Vector3(mouthX+dx,y,minZ-4));
 const hits=new THREE.Raycaster(origin,mouthDirection,0,root.scale.x*20).intersectObjects(meshes,false);
 assert.equal(hits.length,0,'No vertical cap spans the gas-duct mouth');
}

function triangles(mesh){
 const g=mesh.geometry,p=g.attributes.position,index=g.index,transform=root.matrixWorld.clone().invert().multiply(mesh.matrixWorld),out=[];
 for(let i=0;i<(index?.count??p.count);i+=3)out.push([0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(transform)));
 return out;
}
const road=component('continuous-site31-access-road'),roadTriangles=triangles(road);
for(const tri of roadTriangles){
 const t=tri.map(p=>[p.x,p.z]);
 assert.ok(!t.some(p=>inside(p,polygon)),'The full road width stays outside the excavation');
 assert.ok(!polygon.some(p=>inside(p,t)),'No road triangle encloses part of the excavation');
 for(let i=0;i<3;i++)for(let j=0;j<polygon.length;j++)assert.ok(!crosses(t[i],t[(i+1)%3],polygon[j],polygon[(j+1)%polygon.length]),'Road edges do not cross the traced concrete rim');
}
const gateLocal=new THREE.Vector3(...SITE31_PORTS.road),closest=new THREE.Vector3();
const modelRoadGap=Math.min(...roadTriangles.map(t=>new THREE.Triangle(...t).closestPointToPoint(gateLocal,closest).distanceTo(gateLocal)));
assert.ok(modelRoadGap<1e-5,'The actual internal road surface reaches the network port');
const roadHit=down(60,132.9,[road]);assert.ok(roadHit,'The gate opens onto the internal road');
assert.ok(Math.abs(roadHit.local.y-.1)<1e-5);

// Build the network, then compare its physical road surface and both rail
// heads with this transformed model, rather than comparing two port tables.
const data=JSON.parse(fs.readFileSync('data/transport-network.json','utf8')),original=JSON.stringify(data);
const layers={roads:new THREE.Group(),rails:new THREE.Group()},network=buildTransportNetwork({data,siteRecords,point,layers});
assert.equal(JSON.stringify(data),original,'Rendering must not mutate the source plan');
Object.values(layers).forEach(layer=>layer.updateMatrixWorld(true));
const approach=network.roadPaths().find(r=>r.id==='r-31-service');assert.ok(approach);
const gateWorld=root.localToWorld(gateLocal.clone()),roadJoinError=approach.points.at(-1).distanceTo(gateWorld);
assert.ok(roadJoinError<1e-6,'The network road reaches the rotated model gate');
const inward=railDirection.clone().negate(),roadTangent=approach.points.at(-1).clone().sub(approach.points.at(-2)).normalize();
assert.ok(roadTangent.dot(inward)>.995,'The final road approach enters the gate along its outward normal');
const pavement=layers.roads.children.find(m=>m.name==='road-pavement-union');assert.ok(pavement);
const nearGate=gateWorld.clone().addScaledVector(railDirection,.15);
const pavementHit=new THREE.Raycaster(nearGate.clone().add(new THREE.Vector3(0,10,0)),new THREE.Vector3(0,-1,0)).intersectObject(pavement,false)[0];
assert.ok(pavementHit&&Math.abs(pavementHit.point.y-gateWorld.y)<.002,'Physical pavement continues to the gate at matching elevation');
let minimumRoadRadius=Infinity;
for(let i=1;i<approach.points.length-1;i++){
 const a=approach.points[i-1],b=approach.points[i],c=approach.points[i+1],ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z),ac=Math.hypot(c.x-a.x,c.z-a.z),twiceArea=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
 if(twiceArea>1e-8)minimumRoadRadius=Math.min(minimumRoadRadius,ab*bc*ac/(2*twiceArea));
}
assert.ok(minimumRoadRadius>approach.width,'The rotated gate approach has no hairpin that folds its road edges');
const modelRails=root.getObjectByName('Архив · rail');assert.ok(modelRails?.isInstancedMesh);
const modelRailEnds=[],matrix=new THREE.Matrix4();
for(let i=0;i<modelRails.count;i++){
 modelRails.getMatrixAt(i,matrix);
 for(const y of [-.5,.5])modelRailEnds.push(new THREE.Vector3(0,y,0).applyMatrix4(matrix).applyMatrix4(modelRails.matrixWorld));
}
const expectedRails=[-1,1].map(side=>root.localToWorld(new THREE.Vector3(side*RAIL_PROFILE.gauge/(2*root.scale.x),SITE31_PORTS.rail[1],SITE31_PORTS.rail[2])));
const internalEnds=expectedRails.map(p=>modelRailEnds.reduce((best,q)=>q.distanceTo(p)<best.distanceTo(p)?q:best));
internalEnds.forEach((p,i)=>assert.ok(p.distanceTo(expectedRails[i])<1e-5,'Visible internal rails reach their ports'));
const networkRails=layers.rails.children.filter(m=>m.userData.railRoute==='t-31-feeder'&&m.geometry?.type==='TubeGeometry');assert.equal(networkRails.length,2);
const actualEnds=networkRails.map(m=>m.localToWorld(m.geometry.parameters.path.getPoint(1)));
const railJoinErrors=internalEnds.map(p=>Math.min(...actualEnds.map(q=>p.distanceTo(q))));
assert.ok(Math.max(...railJoinErrors)<.002,'Each physical network rail meets its matching internal rail');
for(const rail of networkRails)assert.ok(rail.geometry.parameters.path.getTangent(1).dot(inward)>.999,'The final rail approach is aligned with the launch track');

const bounds=new THREE.Box3().setFromObject(root);assert.ok(bounds.min.y<-9,'Excavation extends below the actual scene surface');
assert.ok(JSON.stringify(root.userData).includes(SITE31_VERSION),'QA metadata contains no circular scene objects');
const dispatchRoot=new THREE.Group();dispatchRoot.scale.setScalar(manifest.scale);dispatchRoot.rotation.y=manifest.yaw;
const dispatched=buildArchiveModel(dispatchRoot,manifest);assert.equal(dispatched.site31.version,SITE31_VERSION);
console.log('SITE31_GEOMETRY_PASS',JSON.stringify({version:SITE31_VERSION,primitives:result.primitiveCount,drawCalls:result.meshCount,
 excavationFloor:launchHit.local.y,cutoutArea:area,floorProbes,clearanceProbes,maxFloorError,ductBearing:bearing(ductDirection),railBearing:bearing(railDirection),
 modelRoadGap,roadJoinError,railJoinErrors,minimumRoadRadius,heightsVerified:SITE31_REFERENCE.heightsVerified,bounds:bounds.getSize(new THREE.Vector3()).toArray()}));
