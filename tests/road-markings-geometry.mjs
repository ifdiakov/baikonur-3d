import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildRoadMarkings} from '../src/road-markings.js';
import {buildOsmTransportNetwork} from '../src/osm-transport.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {HIGHWAY_MARKINGS} from '../src/highway-surface.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const lift=.011;

// Supply real source-node topology independently of the marking planner.
// Each definition is one source way; inserting a degree-two way boundary
// below must not change the visible dash sequence along the same road.
function fixture(definitions,{height=()=>.72}={}){
 const nodes=new Map(),edges=[],ways=[],roads=[];
 const node=(id,p)=>{
  if(!nodes.has(id))nodes.set(id,{id,position:V(p[0],height(p[0],p[1]),p[1]),edges:[]});
  return nodes.get(id);
 };
 for(const def of definitions){
  const tags={highway:'primary',surface:'asphalt',lanes:'2',...def.tags},width=def.width??3.6;
  const ns=def.nodes.map(([id,x,z])=>node(id,[x,z])),segments=[];
  for(let i=1;i<ns.length;i++){
   const e={a:ns[i-1],b:ns[i],width,tags,wayId:def.id,length:ns[i-1].position.distanceTo(ns[i].position)};
   e.a.edges.push(e);e.b.edges.push(e);edges.push(e);segments.push(e);
  }
  ways.push({id:'way/'+def.id,osmId:def.id,width,tags,segments});
  roads.push({id:'road-'+def.id,wayId:def.id,points:ns.map(n=>n.position.clone()),width,tags,
   marked:true,startNodeId:ns[0].id,endNodeId:ns.at(-1).id});
 }
 const graph={nodes,edges,ways};
 return {graph,roads,surfaceHeightAt:p=>height(p.x,p.z),directionAt:(p,fallback)=>fallback};
}
const plan=spec=>buildRoadMarkings(spec);
function triangleContainsXZ(p,a,b,c,tolerance=1e-7){
 const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
 if(Math.abs(den)<1e-12)return false;
 const u=((b.z-c.z)*(p.x-c.x)+(c.x-b.x)*(p.z-c.z))/den;
 const v=((c.z-a.z)*(p.x-c.x)+(a.x-c.x)*(p.z-c.z))/den;
 return u>=-tolerance&&v>=-tolerance&&u+v<=1+tolerance;
}
function painted(result,x,z,{kind,color,nearY=.72}={}){
 const p=V(x,nearY,z);
 return result.quads.some(q=>{
  if(kind&&q.kind!==kind||color&&q.color!==color)return false;
  const [a,b,c,d]=q.vertices;
  if(Math.min(...q.vertices.map(v=>Math.abs(v.y-nearY)))>.5)return false;
  return triangleContainsXZ(p,a,c,b)||triangleContainsXZ(p,b,c,d);
 });
}
const anyCenter=result=>result.quads.filter(q=>q.kind==='center'||q.kind==='divider');
let syntheticAssertions=0;
function check(value,message){assert(value,message);syntheticAssertions++;}

const straight=[{id:'plain',nodes:[['west',-48,0],['east',52,0]]}];
const unsplit=plan(fixture(straight));
const split=plan(fixture([
 {id:'piece-a',nodes:[['west',-48,0],['split-a',-11,0]]},
 {id:'piece-b',nodes:[['split-b',17,0],['split-a',-11,0]]},
 {id:'piece-c',nodes:[['split-b',17,0],['east',52,0]]}
]));
const reversed=plan(fixture([{id:'reversed',nodes:[['east',52,0],['west',-48,0]]}]));
let dashPaint=0,dashGaps=0;
for(let x=-43.731;x<48;x+=.197){
 const expected=painted(unsplit,x,0,{kind:'center'});
 check(painted(split,x,0,{kind:'center'})===expected,'A degree-two source split resets the visible dash phase at '+x);
 check(painted(reversed,x,0,{kind:'center'})===expected,'Reversing a two-way source way moves its visible dashes at '+x);
 if(expected)dashPaint++;else dashGaps++;
}
check(dashPaint>30&&dashGaps>30,'A normal two-way local road has both painted center dashes and intentional gaps');

for(const tags of [
 {oneway:'yes',lanes:'1'},
 {oneway:'-1',lanes:'1'},
 {lanes:'1'},
 {surface:'gravel'},
 {surface:'unpaved'},
 {surface:'ground'}
]){
 const result=plan(fixture([{...straight[0],tags}]));
 check(anyCenter(result).length===0,'A single-lane or explicitly unpaved road receives a center/divider stripe: '+JSON.stringify(tags));
}
const twoLaneOneWay=plan(fixture([{...straight[0],tags:{highway:'trunk',oneway:'yes',lanes:'2'}}]));
check(twoLaneOneWay.quads.some(q=>q.kind==='divider'&&q.color==='white'),'Two same-direction lanes have a white lane divider');
check(!twoLaneOneWay.quads.some(q=>q.kind==='center'||q.color==='yellow'),'A one-way road must not receive an opposing-traffic yellow centerline');
check(twoLaneOneWay.quads.every(q=>['center','edge','divider'].includes(q.kind)),'Missing priority tags must not produce stop/yield markings');
const dividerSamples=Array.from({length:120},(_,i)=>painted(twoLaneOneWay,-42.373+i*.71,0,{kind:'divider',color:'white'}));
check(dividerSamples.some(Boolean)&&dividerSamples.some(v=>!v),'The same-direction lane divider must have both dashes and gaps');

function junction({main=false,cross=false,branchVisible=true,gradeSeparated=false,skew=false}={}){
 const host={id:'host',tags:{highway:main?'trunk':'primary'},nodes:[['west',-40,0],['junction',0,0],['east',40,0]]};
 const branch={id:'branch',width:3.1,tags:{highway:'secondary'},nodes:gradeSeparated?
  [['upper-south',0,-26],['upper-crossing',0,0],['upper-north',0,26]]:
  [['junction',0,0],['north',skew?12:0,26]]};
 const definitions=[host,branch];
 if(cross&&!gradeSeparated)definitions.push({id:'south',width:3.1,tags:{highway:'secondary'},nodes:[['south',0,-26],['junction',0,0]]});
 const input=fixture(definitions);
 if(gradeSeparated){
  const road=input.roads.find(r=>r.wayId==='branch');road.points.forEach(p=>p.y+=5.8);
  for(const id of ['upper-south','upper-crossing','upper-north'])input.graph.nodes.get(id).position.y+=5.8;
  input.surfaceHeightAt=p=>p.y>3?6.52:.72;
 }
 if(!branchVisible)input.roads=input.roads.filter(r=>r.wayId!=='branch');
 return plan(input);
}
const edgeOffset=3.6/2-HIGHWAY_MARKINGS.edgeInset;
const tJunction=junction();
check(!painted(tJunction,0,edgeOffset,{kind:'edge'}),'The joined-side host edge blocks a real T-junction mouth');
check(painted(tJunction,0,-edgeOffset,{kind:'edge'}),'A T junction must retain the opposite, exposed host edge');
for(const x of [-.35,0,.35])check(!painted(tJunction,x,0,{kind:'center'}),'Local center paint crosses the T-junction interior');
check(painted(tJunction,-12,edgeOffset,{kind:'edge'})&&painted(tJunction,12,edgeOffset,{kind:'edge'}),'A local mouth must not erase distant host edges');
// The physical T-junction apron can flare beyond the source branch strip.
// At x=3 the raw 3.1-wide branch is absent, but actual pavement extends
// across the old host curb; that obsolete line must open on this side too.
const flareInput=fixture([
 {id:'flare-host',nodes:[['west',-40,0],['flare-junction',0,0],['east',40,0]]},
 {id:'flare-branch',width:3.1,tags:{highway:'secondary'},nodes:[['flare-junction',0,0],['north',0,26]]}
]);
flareInput.surfaceHeightAt=p=>{
 const host=Math.abs(p.x)<=40&&Math.abs(p.z)<=1.8,branch=Math.abs(p.x)<=1.55&&p.z>=0&&p.z<=26;
 const radius=3,throat=1.8+radius,vertical=throat-p.z;
 const half=p.z>=1.8&&p.z<=throat?1.55+radius*(1-Math.sqrt(Math.max(0,1-(vertical/radius)**2))):0;
 return host||branch||(half>0&&Math.abs(p.x)<=half) ? .72 : null;
};
check(flareInput.surfaceHeightAt(V(3,.72,2))===.72&&flareInput.surfaceHeightAt(V(3,.72,4))===null,'The apron fixture must contain a real rounded expansion beyond the source branch');
const flaredT=plan(flareInput);
check(!painted(flaredT,3,edgeOffset,{kind:'edge'}),'The old host edge remains inside a wider physical junction apron');
check(painted(flaredT,3,-edgeOffset,{kind:'edge'}),'A physical apron flare removes the opposite exposed host edge');
const mainT=junction({main:true});
for(const offset of [-HIGHWAY_MARKINGS.centerOffset,HIGHWAY_MARKINGS.centerOffset])
 check(!painted(mainT,0,offset,{kind:'center',color:'yellow'}),'A perpendicular two-way T junction keeps a centerline across its turning area');
check(!painted(mainT,0,edgeOffset,{kind:'edge'}),'The highway edge remains painted across a real side-road mouth');
check(painted(mainT,0,-edgeOffset,{kind:'edge'}),'A highway T junction must retain its opposite exposed edge');
const mainMerge=plan(fixture([
 {id:'main',tags:{highway:'trunk'},nodes:[['west',-40,0],['merge',0,0],['east',40,0]]},
 {id:'taper',tags:{highway:'trunk_link',oneway:'yes',lanes:'1'},nodes:[['merge',0,0],['exit',30,5]]}
]));
for(const offset of [-HIGHWAY_MARKINGS.centerOffset,HIGHWAY_MARKINGS.centerOffset])
 check(painted(mainMerge,0,offset,{kind:'center',color:'yellow'}),'A shallow one-way taper interrupts the through-highway center pair');
const cross=junction({main:true,cross:true});
for(const side of [-1,1]){
 check(!painted(cross,0,side*edgeOffset,{kind:'edge'}),'A true crossing must open both host edges');
 check(!painted(cross,0,side*HIGHWAY_MARKINGS.centerOffset,{kind:'center'}),'A highway centerline crosses a true cross-junction interior');
}
const skew=junction({skew:true});
check(!painted(skew,.6,edgeOffset,{kind:'edge'}),'A skew side road needs an opening at its actual mouth');
check(painted(skew,.6,-edgeOffset,{kind:'edge'}),'A skew side road must not cut the opposite host edge');
for(const result of [junction({branchVisible:false}),junction({gradeSeparated:true})])
 for(const side of [-1,1])check(painted(result,0,side*edgeOffset,{kind:'edge'}),'An unrendered or unconnected upper road creates a phantom host-edge opening');

// Museum gates join source edges at known interior points, without inserting
// invented OSM nodes. Only an explicit, grade-compatible connection authorizes
// a mouth; visual contact by itself cannot erase the host's markings.
for(const [label,explicit,height,opens] of [
 ['explicit museum gate',true,.72,true],
 ['unconnected visual contact',false,.72,false],
 ['explicit gate at bridge height',true,6.52,false]
]){
 const input=fixture([{id:'host',nodes:[['west',-40,0],['east',40,0]]}]);
 const graphBefore=JSON.stringify({nodes:[...input.graph.nodes].map(([id,n])=>[id,n.position.toArray(),n.edges.length]),
  edges:input.graph.edges.map(e=>[e.wayId,e.a.id,e.b.id])});
 const access={id:'authored-gate',wayId:'museum-access',points:[V(0,height,0),V(0,height,18)],width:1.8,
  tags:{highway:'service',surface:'asphalt',lanes:'1'},marked:false};
 if(explicit)access.connections=[{nodeId:'museum-port:test',position:V(0,height,0),hostWayId:'host'}];
 input.roads.push(access);input.surfaceHeightAt=p=>p.y>3?6.52:.72;
 const result=plan(input);
 check(painted(result,0,edgeOffset,{kind:'edge'})===!opens,label+' gives the wrong host-mouth opening');
 check(painted(result,0,-edgeOffset,{kind:'edge'}),label+' erases the opposite exposed host edge');
 check(painted(result,-12,edgeOffset,{kind:'edge'})&&painted(result,12,edgeOffset,{kind:'edge'}),label+' erases host paint beyond the local mouth');
 check(JSON.stringify({nodes:[...input.graph.nodes].map(([id,n])=>[id,n.position.toArray(),n.edges.length]),
  edges:input.graph.edges.map(e=>[e.wayId,e.a.id,e.b.id])})===graphBefore,label+' mutates the source-node graph');
}

// A curved, rising road verifies the produced ribbons themselves. Both
// cross-section vertices must keep their promised horizontal stroke width;
// every vertex must be projected to the supplied physical surface.
const curveNodes=Array.from({length:65},(_,i)=>{
 const a=Math.PI*.5*i/64;return ['curve-'+i,28*Math.cos(a),28*Math.sin(a)];
});
const surface=(x,z)=>.72+.035*x+.0007*z*z;
const curved=plan(fixture([{id:'curve',tags:{highway:'trunk'},nodes:curveNodes}],{height:surface}));
let projectedVertices=0;
for(const q of curved.quads){
 const [a,b,c,d]=q.vertices;
 // At |coordinate| <= 28, Float32 rounding contributes under 1e-5 units
 // across two stroke vertices; the bound remains far below the paint width.
 for(const [l,r] of [[a,b],[c,d]])check(Math.abs(Math.hypot(l.x-r.x,l.z-r.z)-q.width)<1e-5,'A curved paint ribbon changes its horizontal stroke width');
 for(const p of q.vertices){check(Math.abs(p.y-surface(p.x,p.z)-lift)<1e-8,'A curved/sloping paint vertex misses the actual surface');projectedVertices++;}
}
check(projectedVertices>100,'The curved-grade fixture produces a substantive marking surface');

// Finally inspect the rendered museum meshes, not just planner declarations.
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>V((x-650)*3.4,h,(y-522.5)*3.4);
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')};
const before=JSON.stringify(data),layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false)});
assert.equal(JSON.stringify(data),before,'Road marking generation changes archived source data');
const bridge=transport.bridgeObjects()[0];
const pavementMeshes=['OSM · единое дорожное полотно','OSM · асфальт трассы'].map(name=>layers.roads.getObjectByName(name)).concat(bridge.getObjectByName('Виадук · asphalt'));
const paintMeshes=['OSM · разметка','Трасса · двойная жёлтая','Трасса · белые кромки'].map(name=>layers.roads.getObjectByName(name)).concat(['Виадук · yellow','Виадук · white'].map(name=>bridge.getObjectByName(name)));
const cells=new Map(),cellSize=12;
for(const mesh of pavementMeshes){
 assert(mesh,'A pavement batch required for independent marking inspection is missing');mesh.updateWorldMatrix(true,false);
 const pos=mesh.geometry.attributes.position,index=mesh.geometry.index;
 for(let i=0;i<(index?.count??pos.count);i+=3){
  const t=[0,1,2].map(k=>V().fromBufferAttribute(pos,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
  const box=new THREE.Box3().setFromPoints(t);
  for(let x=Math.floor(box.min.x/cellSize);x<=Math.floor(box.max.x/cellSize);x++)for(let z=Math.floor(box.min.z/cellSize);z<=Math.floor(box.max.z/cellSize);z++){
   const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(t);
  }
 }
}
function pavementAt(p){
 const hits=[];
 for(const [a,b,c] of cells.get(Math.floor(p.x/cellSize)+':'+Math.floor(p.z/cellSize))||[]){
  const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-12)continue;
  const u=((b.z-c.z)*(p.x-c.x)+(c.x-b.x)*(p.z-c.z))/den,v=((c.z-a.z)*(p.x-c.x)+(a.x-c.x)*(p.z-c.z))/den;
  const tolerance=.0006*Math.max(a.distanceTo(b),b.distanceTo(c),a.distanceTo(c))/Math.abs(den);
  if(u>=-tolerance&&v>=-tolerance&&u+v<=1+tolerance)hits.push(u*a.y+v*b.y+(1-u-v)*c.y);
 }
 return hits;
}
let actualPaintVertices=0,maxProjectionError=0;
for(const mesh of paintMeshes){
 assert(mesh,'A required actual paint batch is missing');mesh.updateWorldMatrix(true,false);
 const pos=mesh.geometry.attributes.position;
 for(let i=0;i<pos.count;i++){
  const p=V().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld),heights=pavementAt(p);
  const error=Math.min(...heights.map(y=>Math.abs(p.y-y-lift)));
  assert(error<.003,'Actual paint has no matching pavement beneath it: '+JSON.stringify({mesh:mesh.name,p:p.toArray(),heights,error}));
  maxProjectionError=Math.max(maxProjectionError,error);actualPaintVertices++;
 }
}
assert(actualPaintVertices>10000,'The real museum paint network was not exercised');
console.log('ROAD_MARKINGS_GEOMETRY_PASS',JSON.stringify({syntheticAssertions,dashPaint,dashGaps,projectedVertices,actualPaintVertices,maxProjectionError}));
