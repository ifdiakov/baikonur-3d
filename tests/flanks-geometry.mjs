import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FLANK_OUTLINE,FLANK_BORDERS,FLANK_POLYGONS,FLANK_PERIMETER,FLANK_REFERENCE,containsFlankPoint} from '../src/flank-boundaries.js';
import {buildFlankDistricts,FLANK_DISTRICTS} from '../src/flank-districts.js';

const keys=['left','center','right'],colors=[0xd45a91,0x39bad2,0xefb65d];
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const scene=new THREE.Scene(),districts=buildFlankDistricts(scene,point,1300,1045);
const root=scene.getObjectByName('Фланги · тематические территории');
assert.ok(root);districts.setOpacity(1);scene.updateMatrixWorld(true);
const zones=root.children.filter(o=>o.isMesh&&o.geometry.type==='ShapeGeometry');
assert.equal(zones.length,3);assert.equal(FLANK_OUTLINE.length,6);
assert.deepEqual(FLANK_BORDERS.map(p=>p.length),[3,3]);assert.equal(FLANK_POLYGONS.length,3);
assert.equal(FLANK_REFERENCE.version,'owner-outline-20261028');assert.deepEqual(FLANK_REFERENCE.imageSize,[2048,1738]);
const state=districts.state();
assert.equal(state.version,'image-outline-territories-v4-relief');assert.equal(state.visibleZones,3);
assert.equal(state.visibleBoundaries,2);assert.equal(state.visibleOuterBoundaries,1);assert.equal(state.outerBoundarySegments,10);
assert.equal(state.groundTextPanels,0);assert.equal(state.informationPlane,'screen');

// Independent registered checkpoints from the owner's image, not from the
// renderer's generated metadata. White image margins are not map coordinates.
const outlineFixture=[[-33.65,-78.82],[1587.24,98.01],[1554.90,341.33],[790.71,777.76],[570.09,752.70],[-57.22,182.00]];
const borderFixtures=[[[335.41,-38.55],[567.88,303.02],[384.90,584.22]],[[800.47,12.18],[803.22,390.76],[1179.70,555.61]]];
for(let i=0;i<6;i++)assert.ok(Math.hypot(FLANK_OUTLINE[i][0]-outlineFixture[i][0],FLANK_OUTLINE[i][1]-outlineFixture[i][1])<.5,'Outline vertex remains registered to the supplied image');
for(let i=0;i<2;i++)for(let j=0;j<3;j++)assert.ok(Math.hypot(FLANK_BORDERS[i][j][0]-borderFixtures[i][j][0],FLANK_BORDERS[i][j][1]-borderFixtures[i][j][1])<.5,'Divider remains registered to the supplied image');

const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=p=>Math.abs(signedArea(p));
function signedArea(p){return p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2;}
const edges=p=>p.map((a,i)=>[a,p[(i+1)%p.length]]);
function segmentDistance(p,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function inside(p,polygon){
 let contained=false;
 for(const [a,b]of edges(polygon))if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])contained=!contained;
 return contained;
}
function simple(polygon){
 assert.ok(polygon.length>=3&&polygon.flat().every(Number.isFinite));
 const es=edges(polygon);
 for(let i=0;i<es.length;i++)for(let j=i+2;j<es.length;j++){
  if(i===0&&j===es.length-1)continue;
  const [a,b]=es[i],[c,d]=es[j];
  assert.ok(!(cross(a,b,c)*cross(a,b,d)<-1e-7&&cross(c,d,a)*cross(c,d,b)<-1e-7),'A district cannot have crossing edges');
 }
 assert.ok(area(polygon)>1);
}
[FLANK_OUTLINE,...FLANK_POLYGONS].forEach(simple);
const outlineArea=area(FLANK_OUTLINE),polygonAreas=FLANK_POLYGONS.map(area);
assert.ok(Math.abs(polygonAreas.reduce((a,b)=>a+b,0)-outlineArea)<1e-7*outlineArea,'The three districts exactly cover the outer contour');
const coordinate=p=>p.map(v=>v.toFixed(7)).join(',');
const edgeKey=(a,b)=>[coordinate(a),coordinate(b)].sort().join('|');
const owners=new Map();
FLANK_POLYGONS.forEach((polygon,i)=>edges(polygon).forEach(([a,b])=>{
 const key=edgeKey(a,b);if(!owners.has(key))owners.set(key,[]);
 owners.get(key).push({district:keys[i],a,b});
}));
const shared=[...owners.values()].filter(list=>list.length===2),outer=[...owners.entries()].filter(([,list])=>list.length===1);
assert.equal(shared.length,4);assert.equal(outer.length,10);
assert.ok([...owners.values()].every(list=>list.length===1||list.length===2));
for(const pair of shared){
 assert.deepEqual(pair[0].a,pair[1].b);assert.deepEqual(pair[0].b,pair[1].a,'Shared boundaries use identical vertices in opposite directions');
 assert.notEqual(pair[0].district,pair[1].district);
}
const dividerEdges=FLANK_BORDERS.flatMap(p=>p.slice(1).map((b,i)=>edgeKey(p[i],b)));
assert.deepEqual(shared.map(pair=>edgeKey(pair[0].a,pair[0].b)).sort(),dividerEdges.sort());
const perimeterEdges=FLANK_PERIMETER.flatMap(({key,points})=>{
 assert.ok(keys.includes(key));
 return points.slice(1).map((b,i)=>{
  const id=edgeKey(points[i],b),owner=owners.get(id);assert.equal(owner?.length,1,'Only an external edge belongs to the perimeter');
  assert.equal(owner[0].district,key,'Perimeter glow uses its adjacent district color');return id;
 });
});
assert.equal(new Set(perimeterEdges).size,10,'No external neon edge is drawn twice');
assert.deepEqual(perimeterEdges.sort(),outer.map(([key])=>key).sort());

// Inspect the physical triangulation: it must neither overlap a neighbour
// nor fill the large southern area left empty in the owner's outline.
function renderedTriangles(mesh){
 const p=mesh.geometry.attributes.position,index=mesh.geometry.index,triangles=[];
 for(let i=0;i<(index?.count??p.count);i+=3){
  const triangle=[];
  for(let j=0;j<3;j++){
   const world=new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld);
   assert.ok(world.toArray().every(Number.isFinite));assert.ok(Math.abs(world.y+2.56)<1e-5);
   triangle.push([world.x/3.4+650,world.z/3.4+522.5]);
  }
  assert.ok(area(triangle)>1e-8);triangles.push(triangle);
 }
 return triangles;
}
const triangles=zones.map(renderedTriangles);
triangles.forEach((ts,i)=>assert.ok(Math.abs(ts.reduce((sum,t)=>sum+area(t),0)-polygonAreas[i])<polygonAreas[i]*1e-6,'Rendered fill has the intended area'));
function convexIntersection(subject,clip){
 let output=subject.map(p=>[...p]);const sign=Math.sign(signedArea(clip));
 for(const [a,b]of edges(clip)){
  const input=output;output=[];
  for(let i=0;i<input.length;i++){
   const p=input[i],q=input[(i+1)%input.length],dp=sign*cross(a,b,p),dq=sign*cross(a,b,q),pin=dp>=-1e-9,qin=dq>=-1e-9;
   if(pin)output.push(p);
   if(pin!==qin){const t=dp/(dp-dq);output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
  }
  if(!output.length)break;
 }
 return output;
}
let overlapArea=0;
for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)for(const a of triangles[i])for(const b of triangles[j]){
 const overlap=convexIntersection(a,b);if(overlap.length>=3)overlapArea+=area(overlap);
}
assert.ok(overlapArea<outlineArea*1e-7,'Physical district triangles do not double-paint shared regions');
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
function coverage(p){
 ray.set(point(p[0],p[1],100),down);
 return [...new Set(ray.intersectObjects(zones,false).map(hit=>zones.indexOf(hit.object)))];
}
const allEdges=FLANK_POLYGONS.flatMap(edges),xs=FLANK_OUTLINE.map(p=>p[0]),ys=FLANK_OUTLINE.map(p=>p[1]);
let coverageProbes=0,insideProbes=0,outsideProbes=0;
for(let x=Math.min(...xs)-30;x<Math.max(...xs)+30;x+=23.7)for(let y=Math.min(...ys)-30;y<1000;y+=19.3){
 const p=[x,y];if(allEdges.some(([a,b])=>segmentDistance(p,a,b)<.05))continue;
 const expected=FLANK_POLYGONS.flatMap((polygon,i)=>inside(p,polygon)?[i]:[]),actual=coverage(p);
 assert.equal(expected.length,inside(p,FLANK_OUTLINE)?1:0,'The topology leaves no gap inside its contour');
 assert.deepEqual(actual,expected,'Raycast coverage at '+p);
 keys.forEach((key,i)=>assert.equal(containsFlankPoint(key,p),expected.includes(i)));
 coverageProbes++;if(expected.length)insideProbes++;else outsideProbes++;
}
assert.ok(insideProbes>500&&outsideProbes>500);
for(const [p,expected]of [[[145,114],0],[[699,365],1],[[741,716],1],[[1017,228],2]]){
 assert.deepEqual(coverage(p),[expected],'Known site has the intended district: '+p);
}
for(const p of [[710,924],[539,962],[200,700],[400,900],[1250,700]])assert.deepEqual(coverage(p),[],'The southern space stays unpainted: '+p);
for(let i=0;i<FLANK_BORDERS.length;i++)for(let j=1;j<FLANK_BORDERS[i].length;j++){
 const a=FLANK_BORDERS[i][j-1],b=FLANK_BORDERS[i][j],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
 for(const t of [.2,.5,.8]){
  const mid=[a[0]+t*dx,a[1]+t*dy],sides=[-1,1].map(sign=>coverage([mid[0]-dy/length*.05*sign,mid[1]+dx/length*.05*sign]));
  assert.ok(sides.every(hit=>hit.length===1),'Both sides of a shared edge have a real fill');
  assert.deepEqual(sides.flat().sort(),[i,i+1],'Shared edges separate the two intended neighbours');
 }
}

// Freeze the existing fill and neon treatment while allowing the outline
// coordinates to change: same colors, alpha, shader, widths and depth order.
assert.deepEqual(FLANK_DISTRICTS.map(d=>d.color),colors);
zones.forEach((mesh,i)=>{
 assert.equal(mesh.material.type,'ShaderMaterial');assert.equal(mesh.material.uniforms.uColor.value.getHex(),colors[i]);
 assert.equal(mesh.material.uniforms.uOpacity.value,.19);assert.equal(mesh.material.blending,THREE.NormalBlending);
 assert.equal(mesh.material.toneMapped,false);assert.equal(mesh.material.depthWrite,false);assert.equal(mesh.material.depthTest,true);
 assert.equal(mesh.material.side,THREE.DoubleSide);assert.equal(mesh.renderOrder,3);assert.equal(mesh.userData.pickable,false);
});
const neon=[];root.traverse(mesh=>{if(mesh.isMesh&&mesh.geometry.type==='PlaneGeometry')neon.push(mesh);});
const cores=neon.filter(mesh=>mesh.geometry.parameters.width===2.2&&mesh.material.uniforms.uColor.value.getHex()===0xecfbff);
assert.equal(cores.length,14,'Four internal and ten external bright segments are drawn once');
const segments=[...FLANK_BORDERS.flatMap(p=>p.slice(1).map((b,i)=>[p[i],b])),...FLANK_PERIMETER.flatMap(({points})=>points.slice(1).map((b,i)=>[points[i],b]))];
for(const [a,b]of segments){
 const pa=point(...a,-1.42),pb=point(...b,-1.42),mid=pa.clone().lerp(pb,.5),delta=pb.clone().sub(pa).normalize();
 const matches=cores.filter(mesh=>mesh.getWorldPosition(new THREE.Vector3()).distanceTo(mid)<1e-5);
 assert.equal(matches.length,1,'The neon core follows its real geographic segment');
 assert.ok(Math.abs(new THREE.Vector3(0,1,0).transformDirection(matches[0].matrixWorld).dot(delta))>1-1e-8);
}
for(const mesh of neon){
 assert.ok([32,8,2.2].includes(mesh.geometry.parameters.width));
 assert.equal(mesh.material.type,'ShaderMaterial');assert.equal(mesh.material.blending,THREE.AdditiveBlending);
 assert.equal(mesh.material.depthWrite,false);assert.equal(mesh.material.depthTest,true);assert.equal(mesh.material.toneMapped,false);
 assert.equal(mesh.renderOrder,5);assert.equal(mesh.userData.pickable,false);
 assert.equal(mesh.material.uniforms.uOpacity.value,mesh.geometry.parameters.width===32?.14:mesh.geometry.parameters.width===8?.58:1);
}

// Retain the real hill's feathering and height offset. The browser test also
// renders a crossing surface to prove the shader clips outside the centre.
const terrain=new THREE.Mesh(new THREE.PlaneGeometry(500,500,2,2),new THREE.MeshBasicMaterial());
terrain.rotation.x=-Math.PI/2;terrain.position.copy(point(741,716,17.45));terrain.scale.setScalar(.525);scene.add(terrain);
const rgba=new Float32Array(terrain.geometry.attributes.position.count*4);for(let i=0;i<rgba.length;i+=4){rgba[i]=rgba[i+1]=rgba[i+2]=1;rgba[i+3]=i/rgba.length;}
terrain.geometry.setAttribute('color',new THREE.BufferAttribute(rgba,4));scene.updateMatrixWorld(true);
const originalPositions=Array.from(terrain.geometry.attributes.position.array),overlay=districts.addTerrainSurface(terrain,'center');scene.updateMatrixWorld(true);
assert.deepEqual(Array.from(terrain.geometry.attributes.position.array),originalPositions);
assert.deepEqual(Array.from(overlay.geometry.attributes.color.array),Array.from(rgba),'Relief retains its existing feathered alpha');
for(let i=0;i<terrain.geometry.attributes.position.count;i++){
 const base=new THREE.Vector3().fromBufferAttribute(terrain.geometry.attributes.position,i).applyMatrix4(terrain.matrixWorld);
 const raised=new THREE.Vector3().fromBufferAttribute(overlay.geometry.attributes.position,i).applyMatrix4(overlay.matrixWorld);
 assert.ok(Math.abs(raised.y-base.y-.08)<1e-5);assert.ok(Math.hypot(raised.x-base.x,raised.z-base.z)<1e-5);
}
assert.equal(districts.state().reliefClipped,true);assert.equal(districts.state().visibleReliefSurfaces,1);
districts.setOpacity(0);assert.equal(root.visible,false);assert.equal(overlay.visible,false);
assert.equal(districts.state().visibleZones,0);assert.equal(districts.state().visibleBoundaries,0);assert.equal(districts.state().visibleOuterBoundaries,0);
console.log('FLANKS_GEOMETRY_PASS',JSON.stringify({outlineArea,polygonAreas,overlapArea,coverageProbes,insideProbes,outsideProbes,sharedSegments:shared.length,perimeterSegments:perimeterEdges.length,neonCoreSegments:cores.length,saturnDistrict:'center',southernCityCovered:false}));
