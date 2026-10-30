import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildSaturnIP5} from '../src/saturn-structures.js';
import {SATURN_ACCESS,saturnTerrainSample,addSaturnNorthwestGate} from '../src/saturn-access.js';

const near=(actual,expected,tolerance,message)=>assert.ok(Math.abs(actual-expected)<=tolerance,
 `${message}: ${actual} differs from ${expected}`);
const sample=saturnTerrainSample;
// These are the approved, pre-change station elevations and access points.
// The new terrain must fit them; moving the structures is not a substitute.
const summit=7.25,scale=.525,elevation=17.45,base=-20/scale-.22;
assert.equal(SATURN_ACCESS.verticalRaise,20);
assert.equal(SATURN_ACCESS.scale,scale);assert.equal(SATURN_ACCESS.elevation,elevation);
assert.deepEqual(SATURN_ACCESS.gate,{x:-96,y:7.59,z:-79});
assert.deepEqual(SATURN_ACCESS.internalJoin,{x:-92,y:7.59,z:-29});
assert.equal(SATURN_ACCESS.revision,'northwest-natural-hill20-v4');

// A transformed root catches UVs accidentally tied to local X/Z, a model
// origin, or an unscaled copy of the shared map. The material itself must be
// cloned so vertex colours and depth settings do not change the flat steppe.
const root=new THREE.Group();
root.position.set(137.4,elevation,-86.2);root.rotation.y=.63;root.scale.setScalar(scale);
root.updateWorldMatrix(true,true);
const texture=new THREE.Texture(),terrainWidth=4420,terrainHeight=3553;
const sharedMaterial=new THREE.MeshBasicMaterial({map:texture,color:0xf3efdf,
 transparent:true,depthWrite:false,side:THREE.DoubleSide});
buildSaturnIP5(root,{terrainTexture:texture,terrainMaterial:sharedMaterial,terrainWidth,terrainHeight});
addSaturnNorthwestGate(root);root.updateWorldMatrix(true,true);
const hills=[];root.traverse(object=>{if(object.userData.museumComponent==='murguduk-hill')hills.push(object);});
assert.equal(hills.length,1);const hill=hills[0],material=hill.material;
assert.notStrictEqual(material,sharedMaterial,'The hill needs its own material instance');
assert.strictEqual(material.map,texture,'The hill must use the actual shared steppe map');
assert.ok(material.color.equals(sharedMaterial.color),'The hill must not add a separate soil tint');
assert.equal(material.type,'MeshBasicMaterial');assert.equal(material.vertexColors,true);
assert.equal(material.transparent,true);assert.equal(material.depthWrite,true);
assert.ok(material.alphaTest<=.001,'A hard alpha cutoff must not create a visible rim');
assert.equal(sharedMaterial.vertexColors,false);assert.equal(sharedMaterial.depthWrite,false);
assert.equal(sharedMaterial.alphaTest,0);
assert.equal(hill.userData.surfaceStyle,'shared-steppe-world-uv');
assert.equal(hill.userData.reliefStyle,'soft-irregular-steppe-v2');
assert.equal(hill.userData.terrainElevationWorld,20);

const geometry=hill.geometry,p=geometry.attributes.position,color=geometry.attributes.color;
const uv=geometry.attributes.uv,index=geometry.index;
assert.equal(color.itemSize,4,'Relief colour requires RGBA for a soft outer blend');
assert.equal(color.count,p.count);assert.equal(uv.count,p.count);assert.ok(index);
for(const attribute of Object.values(geometry.attributes))
 for(const value of attribute.array)assert.ok(Number.isFinite(value),'Non-finite terrain attribute');
let minShade=Infinity,maxShade=-Infinity,maxHeightError=0,maxUVError=0,opaqueVertices=0,clearVertices=0;
for(let i=0;i<p.count;i++){
 const local=new THREE.Vector3().fromBufferAttribute(p,i),expected=sample(local.x,local.z);
 const world=root.localToWorld(local.clone());
 maxHeightError=Math.max(maxHeightError,Math.abs(local.y-expected.height));
 maxUVError=Math.max(maxUVError,Math.abs(uv.getX(i)-(.5+world.x/terrainWidth)),
  Math.abs(uv.getY(i)-(.5-world.z/terrainHeight)));
 const shade=color.getX(i),opacity=color.getW(i);
 minShade=Math.min(minShade,shade);maxShade=Math.max(maxShade,shade);
 assert.ok(shade>=.94&&shade<=1.04,'Terrain shading must remain subtle, without a dark ring');
 near(color.getY(i),shade,1e-7,'No green tint in the relief');
 near(color.getZ(i),shade,1e-7,'No blue tint in the relief');
 assert.ok(opacity>=0&&opacity<=1,'Invalid terrain opacity');
 near(opacity,expected.opacity,1e-6,'Rendered opacity follows the shared terrain profile');
 if(opacity===1)opaqueVertices++;if(opacity===0)clearVertices++;
 // Keep the central yard neutral; normals may softly vary at the very edge
 // of the plateau where the shading stencil reaches onto the slope.
 if(Math.abs(local.x)<100&&local.z>-75&&local.z<70)
  near(shade,1,1e-7,'The summit retains the shared map colour');
}
assert.ok(opaqueVertices>100&&clearVertices>100,'The hill needs both a solid summit and a transparent outside');
assert.ok(maxHeightError<1e-5,'Rendered heights disagree with the road/lighting height field');
assert.ok(maxUVError<1e-6,'Terrain UVs must remain aligned in world space');
const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
for(let i=0;i<index.count;i+=3){
 for(let j=0;j<3;j++)assert.ok(index.getX(i+j)>=0&&index.getX(i+j)<p.count,'Invalid terrain index');
 a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));
 normal.crossVectors(b.sub(a),c.sub(a));
 assert.ok(normal.y>0,'Terrain triangles must face upward without degenerate folds');
}

// The fixed yard envelope includes every building, antenna, fence post and
// internal service road. Probe it independently of the new summit formula.
let plateauSamples=0;
for(let z=-79;z<=75;z++)for(let x=-104;x<=104;x++){
 const terrain=sample(x,z);near(terrain.height,summit,1e-10,'The existing yard must remain level');
 near(terrain.opacity,1,1e-10,'The existing yard must remain opaque');plateauSamples++;
}
const supports=[];
for(let x=-101;x<=102;x+=10)for(const z of [-79,75])supports.push([x,z]);
for(let z=-68;z<=70;z+=9)for(const x of [-103,104])supports.push([x,z]);
for(const x of [-104,104])for(const z of [-79,75])supports.push([x,z]);
supports.push([-96,-79],[-92,-29],[43,-16],[-68,-37],[65,16],[-44,39],[31,45],[-46,-16],[53,-43],[-11,54]);
// The four evening site lamps are at diagonal bearings, 53 world units from
// the site origin. Their fixed bases must retain the approved summit level.
const lampOffset=53/scale/Math.sqrt(2),lampPoints=[];
for(const sx of [-1,1])for(const sz of [-1,1])lampPoints.push([sx*lampOffset,sz*lampOffset]);
assert.equal(lampPoints.length,4);supports.push(...lampPoints);
for(const [x,z] of lampPoints)near(elevation+scale*sample(x,z).height,21.25625,1e-8,'An existing lamp base moved');

// Also probe the real triangles. A correct analytic profile alone can miss
// interpolation across a newly narrowed plateau and leave corner posts afloat.
const down=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
let maxSupportMeshError=0;
for(const [x,z] of supports){
 const expected=root.localToWorld(new THREE.Vector3(x,summit,z));
 down.ray.origin.copy(expected).setY(1000);
 const hit=down.intersectObject(hill,false)[0];assert.ok(hit,'Missing terrain beneath a fixed station support');
 maxSupportMeshError=Math.max(maxSupportMeshError,Math.abs(hit.point.y-expected.y));
}
assert.ok(maxSupportMeshError<1e-4,'The actual mesh must retain level ground under fixed structures');
const pavement=root.getObjectByName('northwest-gate-pavement');assert.ok(pavement);
const gateVertices=pavement.geometry.attributes.position;
const gateCentre=new THREE.Vector3().fromBufferAttribute(gateVertices,0)
 .add(new THREE.Vector3().fromBufferAttribute(gateVertices,1)).multiplyScalar(.5);
near(gateCentre.distanceTo(new THREE.Vector3(-96,7.59,-79)),0,1e-5,'The rendered northwest gate moved');
for(let i=0;i<gateVertices.count;i++){
 const x=gateVertices.getX(i),z=gateVertices.getZ(i);
 near(gateVertices.getY(i)-sample(x,z).height,.34,1e-5,'Gate pavement must retain its terrain clearance');
}

// Snapshot of the compact clearance envelope approved before this change
// (de551ec): refining the interior must never enlarge it toward the roads.
// The heavier OSM corridor/road-surface checks remain in their existing test.
function approvedOuterRadius(angle){
 return (1+.045*Math.sin(3*angle+.45)+.025*Math.cos(5*angle-.8)) /
  Math.hypot(Math.cos(angle)/235,Math.sin(angle)/190);
}
let outsideSamples=0,radialSamples=0,maxOutwardRise=0,maxEdgeSlope=0,maxJoinJump=0;
for(let i=0;i<360;i++){
 const angle=i*Math.PI/180,dx=Math.cos(angle),dz=Math.sin(angle),outer=approvedOuterRadius(angle);
 const at=radius=>sample(dx*radius,dz*radius);
 for(const extra of [0,.1,1,12,100]){
  const outside=at(outer+extra);near(outside.height,base,1e-9,'The terrain escaped its approved outer edge');
  near(outside.opacity,0,1e-10,'An opaque skirt escaped the approved outer edge');outsideSamples++;
 }
 let previous=summit,firstDrop=null;
 for(let radius=1;radius<=outer+1;radius++){
  const terrain=at(radius);radialSamples++;
  assert.ok(Number.isFinite(terrain.height)&&Number.isFinite(terrain.opacity));
  assert.ok(terrain.height>=base-1e-9&&terrain.height<=summit+1e-9,'Terrain changed the approved height range');
  maxOutwardRise=Math.max(maxOutwardRise,terrain.height-previous);
  if(firstDrop===null&&terrain.height<summit-1e-10)firstDrop=radius;
  previous=terrain.height;
 }
 assert.ok(firstDrop!==null,'The hill needs a descending slope beyond its level yard');
 // Locate the plateau join from samples, without knowing its implementation.
 let lo=firstDrop-1,hi=firstDrop;
 for(let j=0;j<28;j++){const mid=(lo+hi)/2;if(at(mid).height<summit-1e-10)hi=mid;else lo=mid;}
 const join=(lo+hi)/2,delta=.01;
 maxJoinJump=Math.max(maxJoinJump,Math.abs(at(join+delta).height-at(join-delta).height));
 maxEdgeSlope=Math.max(maxEdgeSlope,Math.abs(at(outer-delta).height-at(outer).height)/delta);
}
assert.ok(maxOutwardRise<.02,'Radial slopes must not form a raised rim or abrupt secondary bump');
assert.ok(maxJoinJump<1e-4,'The flat yard must meet its slopes continuously');
assert.ok(maxEdgeSlope<1e-4,'The outer foot must meet the flat steppe smoothly');
near(sample(1e6,1e6).height,base,1e-10,'Far outside terrain stays flat');

// Finite differences constrain cliffs and excessive steepness in every
// direction, including between the radial sections above. The previous hill
// reached gradient 1.154, with mean slope 0.662 across its narrow slope ring.
let maxGradient=0,totalGradient=0,slopeSamples=0;
for(let z=-260;z<=260;z+=2)for(let x=-280;x<=280;x+=2){
 const height=sample(x,z).height,delta=.1;
 const gx=(sample(x+delta,z).height-sample(x-delta,z).height)/(2*delta);
 const gz=(sample(x,z+delta).height-sample(x,z-delta).height)/(2*delta);
 const gradient=Math.hypot(gx,gz);assert.ok(Number.isFinite(gradient));
 maxGradient=Math.max(maxGradient,gradient);
 if(height>base+.1&&height<summit-.01){totalGradient+=gradient;slopeSamples++;}
}
assert.ok(slopeSamples>1000);
const meanGradient=totalGradient/slopeSamples;
assert.ok(maxGradient<1.05,'A steep artificial shoulder returned');
assert.ok(meanGradient<.60,'The broader slopes must remain gentler than the previous compact hill');

console.log('SATURN_NATURAL_TERRAIN_PASS',JSON.stringify({revision:SATURN_ACCESS.revision,
 vertices:p.count,triangles:index.count/3,shade:[minShade,maxShade],maxHeightError,maxUVError,
 plateauSamples,supportMeshSamples:supports.length,maxSupportMeshError,lampBases:lampPoints.length,
 outsideSamples,radialSamples,maxOutwardRise,maxJoinJump,maxEdgeSlope,maxGradient,meanGradient,
 worldSummit:elevation+scale*summit}));
