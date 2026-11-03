import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {projectOsm,MUSEUM_DISPLAY_OFFSETS} from '../src/osm-geography.js';
import {FLANK_OUTLINE,FLANK_BORDERS,FLANK_POLYGONS,FLANK_PERIMETER,FLANK_REFERENCE,FLANK_COORDINATE_SYSTEM,FLANK_CENTERS,FLANK_BOUNDS,FLANK_REFERENCE_OUTLINE,FLANK_REFERENCE_DIVIDERS,referenceToPlan,containsFlankPoint} from '../src/flank-boundaries.js';
import {buildFlankDistricts,FLANK_DISTRICTS} from '../src/flank-districts.js';
import {CITY_TERRITORY_OUTLINE,CITY_TERRITORY_REFERENCE,CITY_TERRITORY_COLOR} from '../src/city-territory.js';
import {buildTerrainRelief} from '../src/terrain-relief.js';
import {SATURN_ACCESS,SATURN_TERRAIN_BOUNDS,SATURN_TERRAIN_SEGMENTS,saturnTerrainSample,saturnTerrainMeshHeight} from '../src/saturn-access.js';

const keys=['left','center','right'],colors=[0xd45a91,0x39bad2,0xefb65d];
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const scene=new THREE.Scene(),districts=buildFlankDistricts(scene,point,1300,1045,{mapTransform:()=>{throw new Error('The OSM contour must never be warped through the old museum scheme');}});
const root=scene.getObjectByName('Фланги · тематические территории');
assert.ok(root);districts.setOpacity(1);scene.updateMatrixWorld(true);
const cityRoot=scene.getObjectByName('Город Байконур · территория');
assert(cityRoot&&cityRoot.parent===root,'City has a separate group in the flank layer');
assert.equal(cityRoot.children.filter(m=>m.userData.museumComponent==='city-territory-boundary').length,3,'City has the same three luminous, continuous border bands as the flanks');
assert.equal(cityRoot.children.filter(m=>m.userData.museumComponent==='city-territory-fill').length,1,'City has an independently coloured fill');
assert.equal(districts.state().city.vertices,67);
assert(districts.state().city.solidBoundary,'The city outline must not be rendered as dashed sections');
assert.equal(districts.state().city.visible,true,'City appears with flank territory zoom');
assert(districts.state().city.fillOpacity>.1,'City fill is actually visible');
assert.equal(districts.state().city.color,CITY_TERRITORY_COLOR);
assert.equal(CITY_TERRITORY_REFERENCE.version,'owner-baikonur-city-screenshot-20261103-v1');
// Georeferenced screenshot must include the airport, city and Akai but leave
// adjacent Tyuratam and the river's opposite bank outside its boundary.
function cityContains([lon,lat]){
 const [x,y]=projectOsm([lon,lat]);let inside=false;
 for(let i=0,j=CITY_TERRITORY_OUTLINE.length-1;i<CITY_TERRITORY_OUTLINE.length;j=i++){
  const a=CITY_TERRITORY_OUTLINE[j],b=CITY_TERRITORY_OUTLINE[i];
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
for(const point of [[63.3209201,45.6321977],[63.1941252,45.6143654],[63.2272132,45.6294972],[63.2649836,45.6148609]])
 assert(cityContains(point),"The owner\'s city perimeter covers Baikonur, Krayniy and Akai");
for(const point of [[63.315601,45.650665],[63.286,45.591]])
 assert(!cityContains(point),'Tyuratam and territory across Syr Darya remain outside the city polygon');


// Raised 106/109 hill keeps its true source geometry but receives the right
// flank colour on the actual visible upper soil surface.
{
 const scene2=new THREE.Scene(),d=buildFlankDistricts(scene2,point,1300,1045);
 const geo=new THREE.PlaneGeometry(180,180,3,3);geo.rotateX(-Math.PI/2);
 const alpha=new Float32Array(geo.attributes.position.count*4);for(let i=0;i<alpha.length;i+=4){alpha[i]=alpha[i+1]=alpha[i+2]=1;alpha[i+3]=.7;}
 geo.setAttribute('color',new THREE.BufferAttribute(alpha,4));geo.computeVertexNormals();
 const hill=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({transparent:true,vertexColors:true}));
 hill.userData.museumComponent='shared-silo-hill';hill.position.copy(point(...FLANK_CENTERS.right,3));
 scene2.add(hill);const original=geo.attributes.position.array.slice();
 const tint=d.addTerrainSurface(hill,'right');
 assert.deepEqual(Array.from(geo.attributes.position.array),Array.from(original));
 assert.equal(tint.userData.localTerrainTint,true);
 assert.equal(tint.material.polygonOffset,true);
 assert.equal(d.state().localHillTintCount,1);
 d.setOpacity(1);assert.equal(tint.visible,true);d.setOpacity(0);assert.equal(tint.visible,false);
}
// The city cover is attached to Krayniy's actual model coordinates, not a
// flat polygon under the airport. Runway stripe heights remain above it.
{
 const scene2=new THREE.Scene(),d=buildFlankDistricts(scene2,point,1300,1045);
 const airport=new THREE.Group();airport.scale.setScalar(.28);airport.rotation.y=2.06;
 airport.userData.airport={length:1380,width:45,apronWidth:195,apronLength:400,taxiX:-100,apron:[-132.5,0]};
 scene2.add(airport);const patches=d.addAirportCitySurface(airport);
 assert.equal(patches.length,11);
 assert.equal(d.state().airportTintCount,11);
 assert(patches.every(m=>m.material.uniforms.uColor.value.getHex()===CITY_TERRITORY_COLOR));
 assert(patches.every(m=>m.material.depthTest&&!m.material.depthWrite));
 assert(patches.every(m=>m.material.fragmentShader.includes('insideFlank')));
 assert.equal(patches.find(m=>m.userData.pavement==='runway').position.y,1.768);
 d.setOpacity(1);assert.equal(d.state().visibleAirportTintCount,11);
 d.setOpacity(0);assert.equal(d.state().visibleAirportTintCount,0);
}

const zones=root.children.filter(o=>o.isMesh&&o.geometry.type==='ShapeGeometry');
assert.equal(zones.length,3);assert.equal(FLANK_OUTLINE.length,14);
assert.deepEqual(FLANK_BORDERS.map(p=>p.length),[2,2]);assert.equal(FLANK_POLYGONS.length,3);
assert.equal(FLANK_COORDINATE_SYSTEM,'osm-map');
assert.equal(FLANK_REFERENCE.version,'owner-osm-outline-20261028-v2');assert.deepEqual(FLANK_REFERENCE.imageSize,[1986,1632]);
assert.equal(FLANK_REFERENCE.sourceFile,'контур и фланги.png');
assert.deepEqual(FLANK_POLYGONS.map(p=>p.length),[4,6,10]);
const state=districts.state();
assert.equal(state.version,'contours-three-level-v5');assert.equal(state.visibleZones,3);
assert.equal(state.visibleBoundaries,2);assert.equal(state.visibleOuterBoundaries,1);assert.equal(state.outerBoundarySegments,16);
assert.equal(state.groundTextPanels,0);assert.equal(state.informationPlane,'screen');

// The outer contour must match the stored OSM ring itself, including the
// 16-km northern spur. Raster registration only locates the thematic dividers.
const features=JSON.parse(await readFile(new URL('../data/osm/facilities.geojson',import.meta.url),'utf8'));
const sourceRing=features.features.find(f=>f.id==='relation/6725906').geometry.coordinates[0][0].slice(0,-1);
assert.equal(sourceRing.length,14);
sourceRing.forEach((lonLat,i)=>{
 const expected=projectOsm(lonLat);
 assert.ok(Math.hypot(...expected.map((n,k)=>n-FLANK_OUTLINE[i][k]))<1e-9,'Outer vertex must retain the OSM source coordinates');
 const registered=referenceToPlan(FLANK_REFERENCE_OUTLINE[i]);
 assert.ok(Math.hypot(...registered.map((n,k)=>n-expected[k]))<3.1,'Image control point agrees with source within its stated registration tolerance');
});
const borderFixtures=[[[448.390251,85.947286],[414.582568,594.788777]],[[701.921728,90.941896],[758.364915,635.178765]]];
for(let i=0;i<2;i++)for(let j=0;j<2;j++)assert.ok(Math.hypot(FLANK_BORDERS[i][j][0]-borderFixtures[i][j][0],FLANK_BORDERS[i][j][1]-borderFixtures[i][j][1])<1e-5,'Divider remains registered to the new supplied image');
assert.deepEqual(FLANK_REFERENCE_DIVIDERS.map(p=>p.length),[2,2]);
assert(FLANK_BOUNDS.minY< -150&&FLANK_BOUNDS.maxX>1517,'Full overview includes both the northern spur and eastern tip');
assert(FLANK_OUTLINE[4][0]-FLANK_OUTLINE[3][0]>17&&FLANK_OUTLINE[4][0]-FLANK_OUTLINE[3][0]<18,'Narrow northern spur remains narrow');
assert(FLANK_OUTLINE[2][1]-FLANK_OUTLINE[3][1]>254,'Northern spur is not clipped to the former terrain rectangle');
assert.equal(state.coordinateSystem,'osm-map');
assert.deepEqual(state.outerBoundary,FLANK_OUTLINE);
assert.deepEqual(state.polygons,FLANK_POLYGONS);
keys.forEach(key=>assert(containsFlankPoint(key,FLANK_CENTERS[key]),'Card focus lies within '+key));

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
assert.equal(shared.length,2);assert.equal(outer.length,16);
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
assert.equal(new Set(perimeterEdges).size,16,'No external neon edge is drawn twice');
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
for(const [p,expected]of [[[210.851692,143.772978],0],[[640.779239,402.329595],1],[[638.091630,771.738127],1],[[904.877190,272.624297],2],[[600.755931,324.306744],1],[[1291,-100],2]]){
 assert.deepEqual(coverage(p),[expected],'Known site has the intended district: '+p);
}
for(const p of [[594.604513,902.943874],[484.333902,914.482160],[200,700],[400,900],[1250,700],[1270,-100],[1320,-100]])assert.deepEqual(coverage(p),[],'The southern space stays unpainted: '+p);
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
assert.equal(cores.length,18,'Two internal and sixteen external bright segments are drawn once');
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
terrain.rotation.x=-Math.PI/2;terrain.position.copy(point(638.091630,771.738127,17.45));terrain.scale.setScalar(.525);scene.add(terrain);
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

// A real DEM mesh must carry all three colours and the neutral overview
// without copying its large attribute buffers or moving the source contour.
// Include both rising ground and a narrow flat road between DEM vertices.
const unchangedContours=JSON.stringify({outline:FLANK_OUTLINE,polygons:FLANK_POLYGONS,borders:FLANK_BORDERS});
const worldOutline=FLANK_OUTLINE.map(p=>point(...p));
const reliefBounds={minX:Math.min(...worldOutline.map(p=>p.x))-260,maxX:Math.max(...worldOutline.map(p=>p.x))+260,
 minZ:Math.min(...worldOutline.map(p=>p.z))-260,maxZ:Math.max(...worldOutline.map(p=>p.z))+260};
const demWidth=17,demHeight=15,demValues=[];
for(let z=0;z<demHeight;z++)for(let x=0;x<demWidth;x++)
 demValues.push(Math.round(980+160*Math.sin(x/(demWidth-1)*Math.PI)*Math.sin(z/(demHeight-1)*Math.PI)+75*x/(demWidth-1)));
const broadRelief=buildTerrainRelief({dem:{width:demWidth,height:demHeight,bounds:reliefBounds,metresPerUnit:.1,offsetMetres:0,values:demValues},
 material:new THREE.MeshBasicMaterial({color:0xe4d1a8}),step:48,
 protection:{corridors:[{points:[{x:reliefBounds.minX,z:37},{x:reliefBounds.maxX,z:53}],width:6}]}});
scene.add(broadRelief.mesh);scene.updateMatrixWorld(true);
const reliefSource=broadRelief.mesh.geometry,sourcePositions=Array.from(reliefSource.attributes.position.array),sourceIndex=Array.from(reliefSource.index.array);
const boundaryBefore=new Map(neon.map(mesh=>[mesh,Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>
 new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld))]));
districts.addTerrainRelief(broadRelief);scene.updateMatrixWorld(true);
assert.equal(JSON.stringify({outline:FLANK_OUTLINE,polygons:FLANK_POLYGONS,borders:FLANK_BORDERS}),unchangedContours,'Draping must not change the surveyed contour or its district topology');
assert.deepEqual(Array.from(reliefSource.attributes.position.array),sourcePositions,'District overlays must leave DEM vertices unchanged');
assert.deepEqual(Array.from(reliefSource.index.array),sourceIndex,'District overlays must leave DEM triangles unchanged');
const demOverlays=broadRelief.mesh.children.filter(mesh=>mesh.userData.museumComponent==='flank-relief-overlay');
const overviewOverlay=broadRelief.mesh.children.find(mesh=>mesh.userData.museumComponent==='overview-relief-overlay');
assert.equal(demOverlays.length,3);assert.ok(overviewOverlay);
assert.deepEqual(demOverlays.map(mesh=>mesh.userData.flank),keys);
const sharedPosition=demOverlays[0].geometry.attributes.position;
assert.notStrictEqual(sharedPosition,reliefSource.attributes.position,'The lift has its own positions, never a mutation of the ground mesh');
for(const mesh of [...demOverlays,overviewOverlay]){
 for(const attribute of ['position','normal','uv','color'])
  assert.strictEqual(mesh.geometry.attributes[attribute],demOverlays[0].geometry.attributes[attribute],'All relief graphics share the '+attribute+' buffer');
 assert.notStrictEqual(mesh.geometry.index,reliefSource.index,'Each geographic clip owns only its triangle selection');
 assert.ok(mesh.geometry.index.count>0&&mesh.geometry.index.count<reliefSource.index.count,'Geographic bounds remove unrelated relief triangles');
 assert.equal(mesh.geometry.attributes.color.itemSize,4);
 assert.ok(mesh.geometry.attributes.color.array.every(value=>value===1),'Regional tint has uniform strength across flat ground and feathered soil');
 assert.ok(!mesh.material.vertexShader.includes('vSurfaceOpacity'),'Regional tint is independent of the soil opacity ramp');
 assert.equal(mesh.material.depthWrite,false);assert.equal(mesh.material.depthTest,true);
 assert.equal(mesh.renderOrder,4);assert.equal(mesh.userData.pickable,false);
 assert.ok(mesh.material.fragmentShader.includes('if(!insideFlank(vFlankWorld))discard;'),'Bounding rectangles require the complete polygon clip as well');
}
assert.ok(zones.every(mesh=>!mesh.visible),'The continuous drape replaces all flat district fills instead of double-painting their toes');
assert.equal(scene.getObjectByName('Космодром · почти прозрачная заливка').visible,false,'The overview also uses only one continuous fill');
assert.equal(districts.state().continuousReliefFill,true);
assert.equal(districts.state().flatFillMeshesVisible,0);

// Evaluate the generated scalar polygon predicate at independent source-map
// points. This catches a wrong district, truncated outline, or plan/world mix
// that a mere shader-string-presence assertion would miss.
function shaderContains(mesh){
 const body=mesh.material.fragmentShader.match(/bool insideFlank\(vec2 p\)\{([\s\S]*?)return inside;\}/)?.[1];
 assert.ok(body,'Relief graphics contain a world-coordinate polygon predicate');
 return new Function('x','z',body.replace('bool inside=false;','let inside=false;').replaceAll('p.x','x').replaceAll('p.y','z')+'return inside;');
}
const clips=[...demOverlays,overviewOverlay].map(shaderContains),clipPolygons=[...FLANK_POLYGONS,FLANK_OUTLINE];
let reliefClipProbes=0,raisedOverlayProbes=0;
for(let x=Math.min(...xs)-25;x<Math.max(...xs)+25;x+=71.3)for(let y=Math.min(...ys)-25;y<Math.max(...ys)+25;y+=67.9){
 const p=[x,y];if(allEdges.some(([a,b])=>segmentDistance(p,a,b)<.01))continue;
 const world=point(x,y,100);
 clips.forEach((clip,i)=>assert.equal(clip(world.x,world.z),inside(p,clipPolygons[i]),'Relief clip agrees with geographic source at '+p));
 reliefClipProbes++;
 if(raisedOverlayProbes>=45)continue;
 const district=FLANK_POLYGONS.findIndex(polygon=>inside(p,polygon));if(district<0)continue;
 ray.set(world,down);const groundHit=ray.intersectObject(broadRelief.mesh,false)[0];
 if(!groundHit||groundHit.point.y<=-2.4)continue;
 const fillHit=ray.intersectObject(demOverlays[district],false)[0];
 assert.ok(fillHit,'Each raised point keeps its correct clipped district geometry');
 assert.ok(fillHit.point.y-groundHit.point.y>.06&&fillHit.point.y-groundHit.point.y<.10,'The district fill sits just above the actual DEM triangle');
 raisedOverlayProbes++;
}
assert.ok(reliefClipProbes>250&&raisedOverlayProbes>=30);

// A protected road lies between DEM samples and removes triangles from the
// soil mesh. The district sheet must still cover this flat gap, at the same
// strength as the adjoining slopes, without depending on the old flat fill.
let flatDrapeProbes=0;
for(let t=.1;t<.9;t+=.07){
 const x=reliefBounds.minX+(reliefBounds.maxX-reliefBounds.minX)*t,z=37+16*t;
 const district=clips.slice(0,3).findIndex(clip=>clip(x,z));if(district<0)continue;
 assert.ok(Math.abs(broadRelief.heightAt(x,z)+2.755)<1e-6,'The independent probe follows the protected road centreline');
 ray.set(new THREE.Vector3(x,100,z),down);
 const fillHit=ray.intersectObject(demOverlays[district],false)[0];
 assert.ok(fillHit,'The continuous district sheet spans omitted flat soil triangles');
 assert.ok(Math.abs(fillHit.point.y+2.55)<1e-5,'The flat part retains the original visible fill level');
 flatDrapeProbes++;
}
assert.ok(flatDrapeProbes>=3,'Several districts and cells are checked through the road gap');

// The real ring is long: two endpoints cannot follow its intervening hills.
// Check every draped vertex and sample the physical ground beneath selected
// vertices, including the neutral overview ring and all neon widths.
const overviewBoundary=scene.getObjectByName('Космодром · единая обзорная граница');
assert.ok(overviewBoundary.geometry.attributes.position.count>FLANK_OUTLINE.length*20);
let drapedBoundaryVertices=0,physicalBoundaryProbes=0;
for(const mesh of [...neon,overviewBoundary]){
 assert.equal(mesh.userData.terrainDraped,true);
 const positions=mesh.geometry.attributes.position;
 for(let i=0;i<positions.count;i++){
  const world=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
  const sampled=broadRelief.heightAt(world.x,world.z);
  assert.ok(world.y-sampled>.87,'A draped boundary vertex must remain above actual terrain');
  if(boundaryBefore.has(mesh)){
   const before=boundaryBefore.get(mesh)[i];
   assert.ok(Math.hypot(world.x-before.x,world.z-before.z)<.001,'Draping changes height, never the geographic boundary');
   assert.ok(Math.abs(world.y-before.y-Math.max(0,sampled+2.755))<.001,'Boundary height follows the same terrain triangles as the ground');
  }
  if(i===Math.floor(positions.count/2)){
   ray.set(new THREE.Vector3(world.x,100,world.z),down);const hit=ray.intersectObject(broadRelief.mesh,false)[0];
   if(hit){assert.ok(world.y-hit.point.y>.87,'A boundary is above the rendered triangle, not only its analytic DEM');physicalBoundaryProbes++;}
  }
  drapedBoundaryVertices++;
 }
}
assert.ok(drapedBoundaryVertices>3000&&physicalBoundaryProbes>15);
const overviewPositions=overviewBoundary.geometry.attributes.position;
for(let i=0;i<overviewPositions.count;i+=2){
 const j=(i+2)%overviewPositions.count;
 const ax=(overviewPositions.getX(i)+overviewPositions.getX(i+1))/2,az=(overviewPositions.getZ(i)+overviewPositions.getZ(i+1))/2;
 const bx=(overviewPositions.getX(j)+overviewPositions.getX(j+1))/2,bz=(overviewPositions.getZ(j)+overviewPositions.getZ(j+1))/2;
 assert.ok(Math.hypot(bx-ax,bz-az)<=12.01,'The continuous overview ring has dense terrain samples between original corners');
}

assert.ok(demOverlays.every(mesh=>!mesh.visible)&&!overviewOverlay.visible,'No relief graphics appear when both map levels are hidden');
districts.setOverviewOpacity(1);
assert.ok(overviewOverlay.visible&&demOverlays.every(mesh=>!mesh.visible),'Overview shows only its neutral relief fill');
assert.equal(overviewOverlay.material.uniforms.uOpacity.value,.025);
districts.setOpacity(1);
assert.ok(!overviewOverlay.visible&&demOverlays.every(mesh=>mesh.visible),'District appearance suppresses the overview relief fill');
assert.equal(overviewOverlay.material.uniforms.uOpacity.value,0);
demOverlays.forEach(mesh=>assert.equal(mesh.material.uniforms.uOpacity.value,.19));
districts.setOpacity(.02);
assert.ok(overviewOverlay.visible&&demOverlays.every(mesh=>!mesh.visible),'Crossing the district threshold restores the requested overview level');
districts.setOverviewOpacity(0);assert.equal(overviewOverlay.visible,false);
districts.setOpacity(.6);demOverlays.forEach(mesh=>assert.ok(Math.abs(mesh.material.uniforms.uOpacity.value-.114)<1e-12));
districts.setOpacity(0);
assert.ok(!overviewOverlay.visible&&demOverlays.every(mesh=>!mesh.visible));
assert.equal(districts.state().overviewReliefCount,1);assert.equal(districts.state().terrainDraped,true);

// Saturn's translucent soil toe must never produce a second colour layer.
// Exercise an off-centre square under a translated, rotated, scaled parent;
// the replacement patch and its regional cutout must agree in world space.
const patchScene=new THREE.Scene(),patchDistricts=buildFlankDistricts(patchScene,point,1300,1045);
const hillRoot=new THREE.Group();hillRoot.position.copy(point(638.091630,771.738127,17.45));
hillRoot.rotation.y=.13;hillRoot.scale.setScalar(.525);patchScene.add(hillRoot);
const hillGrid=184,hillBounds={minX:-280,maxX:640,minZ:-650,maxZ:270},hillPositions=[],hillColors=[],hillIndices=[];
const hillBase=(-2.755-17.45)/.525;
for(let z=0;z<=hillGrid;z++)for(let x=0;x<=hillGrid;x++){
 const xx=hillBounds.minX+(hillBounds.maxX-hillBounds.minX)*x/hillGrid,zz=hillBounds.minZ+(hillBounds.maxZ-hillBounds.minZ)*z/hillGrid;
 const bump=Math.sin(x/hillGrid*Math.PI)**4*Math.sin(z/hillGrid*Math.PI)**4;
 hillPositions.push(xx,hillBase+bump*52,zz);hillColors.push(1,1,1,bump);
 if(x<hillGrid&&z<hillGrid){const a=z*(hillGrid+1)+x,b=a+1,c=a+hillGrid+1,d=c+1;hillIndices.push(a,c,b,b,c,d);}
}
const hillGeometry=new THREE.BufferGeometry();hillGeometry.setAttribute('position',new THREE.Float32BufferAttribute(hillPositions,3));
hillGeometry.setAttribute('color',new THREE.Float32BufferAttribute(hillColors,4));hillGeometry.setIndex(hillIndices);hillGeometry.computeVertexNormals();
const hill=new THREE.Mesh(hillGeometry,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:true,alphaTest:.001}));
hill.userData.museumComponent='murguduk-hill';hillRoot.add(hill);patchScene.updateMatrixWorld(true);
const originalHillPositions=Array.from(hillGeometry.attributes.position.array),originalHillColors=Array.from(hillGeometry.attributes.color.array);
const hillPatch=patchDistricts.addTerrainSurface(hill,'center');
const hillFootprint=Array.from({length:32},(_,i)=>{
 const angle=i*Math.PI/16,p=hill.localToWorld(new THREE.Vector3(180+220*Math.cos(angle),0,-190+200*Math.sin(angle)));
 return {x:p.x,z:p.z};
});
const region=buildTerrainRelief({dem:{width:demWidth,height:demHeight,bounds:reliefBounds,metresPerUnit:.1,offsetMetres:0,values:demValues},
 material:new THREE.MeshBasicMaterial(),step:48,transitionWidth:180,
 protection:{polygons:[hillFootprint]}});
patchScene.add(region.mesh);patchDistricts.addTerrainRelief(region);patchScene.updateMatrixWorld(true);
const regionFill=region.mesh.children.find(m=>m.userData.museumComponent==='flank-relief-overlay'&&m.userData.flank==='center');
const regionOverview=region.mesh.children.find(m=>m.userData.museumComponent==='overview-relief-overlay');
const hillOverview=hill.children.find(m=>m.userData.museumComponent==='overview-relief-patch');
assert.ok(hillOverview);assert.equal(patchDistricts.state().continuousTerrainPatches,1);
assert.equal(hillPatch.geometry.index.count,hillGeometry.index.count,'The colour patch includes the full flat skirt, not only the opaque hill');
assert.deepEqual(Array.from(hillGeometry.attributes.position.array),originalHillPositions,'Tint continuity does not change the hill shape');
assert.deepEqual(Array.from(hillGeometry.attributes.color.array),originalHillColors,'The original soil retains its soft transparency');
assert.ok(hillPatch.geometry.attributes.color.array.every(value=>value===1));
assert.ok(!hillPatch.material.vertexShader.includes('vSurfaceOpacity'),'Hill colour never changes at the soil alpha cutoff');
assert.strictEqual(hillOverview.geometry,hillPatch.geometry,'Overview and district reuse the same continuous patch');
function patchMask(mesh,name='insideTerrainPatch0'){
 const body=mesh.material.fragmentShader.match(new RegExp('bool '+name+'\\(vec2 p\\)\\{([\\s\\S]*?)return inside;\\}'))?.[1];
 assert.ok(body,'The lower fill explicitly excludes the replacement patch');
 return new Function('x','z',body.replace('bool inside=false;','let inside=false;').replaceAll('p.x','x').replaceAll('p.y','z')+'return inside;');
}
const rejectsPatch=patchMask(regionFill),rejectsOverviewPatch=patchMask(regionOverview),acceptsPatch=patchMask(hillPatch,'insideLocalTerrainPatch'),insideCenter=shaderContains(hillPatch);
let patchCoverageProbes=0,patchEdgeProbes=0,raisedPatchRimProbes=0;
for(let ix=0;ix<11;ix++)for(let iz=0;iz<11;iz++){
 const x=hillBounds.minX-15+(hillBounds.maxX-hillBounds.minX+30)*ix/10,z=hillBounds.minZ-15+(hillBounds.maxZ-hillBounds.minZ+30)*iz/10;
 const probe=hill.localToWorld(new THREE.Vector3(x,0,z));
 const expected=x>hillBounds.minX&&x<hillBounds.maxX&&z>hillBounds.minZ&&z<hillBounds.maxZ;
 assert.equal(rejectsPatch(probe.x,probe.z),expected,'The patch mask follows transformed off-centre bounds');
 assert.equal(rejectsOverviewPatch(probe.x,probe.z),expected,'Overview excludes the identical patch');
 assert.equal(acceptsPatch(probe.x,probe.z),rejectsPatch(probe.x,probe.z),'The replacement and underlying sheet use complementary clipping, even at their boundary');
 if(!insideCenter(probe.x,probe.z))continue;
 ray.set(new THREE.Vector3(probe.x,100,probe.z),down);
 const patchHit=ray.intersectObject(hillPatch,false)[0],regionalHit=ray.intersectObject(regionFill,false)[0];
 const coverage=Number(!!patchHit)+Number(!!regionalHit&&!rejectsPatch(probe.x,probe.z));
 assert.equal(coverage,1,'Exactly one colour sheet covers each flat toe or raised hill probe');
 if(patchHit)assert.ok(patchHit.point.y>region.heightAt(probe.x,probe.z)+.03,'Replacement tint stays above regional terrain in unprotected patch corners');
 patchCoverageProbes++;
}
for(let i=0;i<hillGeometry.attributes.position.count;i++){
 const x=i%(hillGrid+1),z=Math.floor(i/(hillGrid+1));if(x!==0&&x!==hillGrid&&z!==0&&z!==hillGrid)continue;
 const v=new THREE.Vector3().fromBufferAttribute(hillPatch.geometry.attributes.position,i).applyMatrix4(hillPatch.matrixWorld);
 const regionalHeight=region.heightAt(v.x,v.z);
 assert.ok(Math.abs(v.y-Math.max(-2.55,regionalHeight+.08))<2e-5,'The patch rim follows the local regional surface, including raised corners');
 if(regionalHeight>-.5)raisedPatchRimProbes++;
 patchEdgeProbes++;
}
assert.ok(patchCoverageProbes>80&&patchEdgeProbes>700&&raisedPatchRimProbes>100,`The replacement is tested over substantial non-flat regional terrain: ${patchCoverageProbes} coverage, ${patchEdgeProbes} rim, ${raisedPatchRimProbes} raised rim`);
patchDistricts.setOverviewOpacity(1);assert.ok(hillOverview.visible&&!hillPatch.visible);
patchDistricts.setOpacity(1);assert.ok(!hillOverview.visible&&hillPatch.visible);
assert.equal(hillPatch.material.uniforms.uOpacity.value,regionFill.material.uniforms.uOpacity.value,'The patch and surrounding district share identical tint strength');
hillRoot.visible=false;patchDistricts.setOpacity(1);
assert.equal(regionFill.material.uniforms.uTerrainPatchActive0.value,0,'Hiding Saturn restores the complete regional tint');
assert.equal(regionOverview.material.uniforms.uTerrainPatchActive0.value,0,'Historic overview has no unpainted square before Saturn exists');
hillRoot.visible=true;patchDistricts.setOpacity(1);
assert.equal(regionFill.material.uniforms.uTerrainPatchActive0.value,1,'The complementary cutout follows Saturn when it reappears');

// The city-facing perimeter crosses Saturn's real eastern shoulder and
// southern toe. The regional DEM is deliberately flat under this exhibit:
// checking only regional heights cannot catch a line buried in the local hill.
const saturnMatches=JSON.parse(await readFile(new URL('../data/osm/catalog-matches.json',import.meta.url),'utf8'));
const saturnMatch=saturnMatches.matches.find(m=>m.siteId==='pad-23');assert.ok(saturnMatch);
const saturnMap=projectOsm(saturnMatch.representativeLonLat).map((v,i)=>v+MUSEUM_DISPLAY_OFFSETS['pad-23'][i]);
const boundaryScene=new THREE.Scene(),boundaryDistricts=buildFlankDistricts(boundaryScene,point,1300,1045);
const saturnRoot=new THREE.Group();saturnRoot.position.copy(point(...saturnMap,SATURN_ACCESS.elevation));
saturnRoot.scale.setScalar(SATURN_ACCESS.scale);boundaryScene.add(saturnRoot);
const localGrid=SATURN_TERRAIN_SEGMENTS,localBounds=SATURN_TERRAIN_BOUNDS,localPositions=[],localColors=[],localIndices=[];
for(let z=0;z<=localGrid;z++)for(let x=0;x<=localGrid;x++){
 const xx=localBounds.minX+(localBounds.maxX-localBounds.minX)*x/localGrid,zz=localBounds.minZ+(localBounds.maxZ-localBounds.minZ)*z/localGrid;
 const sample=saturnTerrainSample(xx,zz);localPositions.push(xx,sample.height,zz);localColors.push(1,1,1,sample.opacity);
 if(x<localGrid&&z<localGrid){const a=z*(localGrid+1)+x,b=a+1,c=a+localGrid+1,d=c+1;localIndices.push(a,c,b,b,c,d);}
}
const localGeometry=new THREE.BufferGeometry();localGeometry.setAttribute('position',new THREE.Float32BufferAttribute(localPositions,3));
localGeometry.setAttribute('color',new THREE.Float32BufferAttribute(localColors,4));localGeometry.setIndex(localIndices);localGeometry.computeVertexNormals();
const localHill=new THREE.Mesh(localGeometry,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:true,alphaTest:.001}));
localHill.userData.museumComponent='murguduk-hill';saturnRoot.add(localHill);boundaryScene.updateMatrixWorld(true);
const samplePoint=new THREE.Vector3();
const localHeightAt=(x,z)=>{
 localHill.worldToLocal(samplePoint.set(x,0,z));const {x:xx,z:zz}=samplePoint;
 if(xx<localBounds.minX||xx>localBounds.maxX||zz<localBounds.minZ||zz>localBounds.maxZ||saturnTerrainSample(xx,zz).opacity<=.001)return -Infinity;
 samplePoint.y=saturnTerrainMeshHeight(xx,zz);return localHill.localToWorld(samplePoint).y;
};
boundaryDistricts.addTerrainSurface(localHill,'center',{heightAt:localHeightAt});
const flatRegion=buildTerrainRelief({dem:{width:3,height:3,bounds:reliefBounds,metresPerUnit:.1,offsetMetres:0,values:Array(9).fill(680)},
 material:new THREE.MeshBasicMaterial(),step:96});
boundaryScene.add(flatRegion.mesh);boundaryDistricts.addTerrainRelief(flatRegion);boundaryDistricts.setOpacity(1);boundaryScene.updateMatrixWorld(true);
const cityPerimeter=boundaryScene.getObjectByName('Внешняя граница тематических флангов');
const cityOverview=boundaryScene.getObjectByName('Космодром · единая обзорная граница');
const cityBoundaries=[...cityPerimeter.children,cityOverview];
const boundaryWorld=mesh=>Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>
 new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld));
const visibleBoundaryPositions=new Map(cityBoundaries.map(mesh=>[mesh,boundaryWorld(mesh)]));
const localRay=new THREE.Raycaster(),probePoint=new THREE.Vector3();
const actualHillHeight=(x,z)=>{
 localRay.set(probePoint.set(x,100,z),down);return localRay.intersectObject(localHill,false)[0]?.point.y??-Infinity;
};
let localBoundaryProbes=0,localOverviewProbes=0,localInteriorProbes=0,oldBuriedProbes=0,minLocalBoundaryClearance=Infinity;
const barycentric=[[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6],[.1,.45,.45],[.45,.1,.45]];
for(const mesh of cityBoundaries){
 const p=visibleBoundaryPositions.get(mesh),index=mesh.geometry.index;
 for(let i=0;i<index.count;i+=3){
  const triangle=[p[index.getX(i)],p[index.getX(i+1)],p[index.getX(i+2)]];
  // Strictly interior samples catch a lifted strip whose long triangles
  // still cut through the shoulder between otherwise clear vertices.
  for(const weights of barycentric){
   const v=triangle.reduce((sum,a,j)=>sum.addScaledVector(a,weights[j]),new THREE.Vector3());
   const local=localHill.worldToLocal(v.clone());
   if(local.x<localBounds.minX||local.x>localBounds.maxX||local.z<localBounds.minZ||local.z>localBounds.maxZ||saturnTerrainSample(local.x,local.z).opacity<=.001)continue;
   const ground=actualHillHeight(v.x,v.z);if(ground<-.5)continue;
   const clearance=v.y-ground;
   assert.ok(clearance>.25,`The ${mesh===cityOverview?'overview':'flank'} boundary remains above Saturn's rendered triangles: ${clearance}`);
   minLocalBoundaryClearance=Math.min(minLocalBoundaryClearance,clearance);localInteriorProbes++;
   if(mesh===cityOverview)localOverviewProbes++;else localBoundaryProbes++;
  }
 }
}
assert.ok(localBoundaryProbes>100&&localOverviewProbes>20,'Both map levels are checked across substantial raised parts of the real shoulder');
const cityCoreMeshes=cityPerimeter.children.filter(mesh=>mesh.geometry.parameters.width===2.2);
for(const [a,b]of [[FLANK_OUTLINE[12],FLANK_OUTLINE[11]],[FLANK_OUTLINE[11],FLANK_OUTLINE[10]]]){
 let segmentBuried=0;
 for(let i=1;i<160;i++){
  const v=point(THREE.MathUtils.lerp(a[0],b[0],i/160),THREE.MathUtils.lerp(a[1],b[1],i/160));
  const ground=actualHillHeight(v.x,v.z);if(ground<=-1.42)continue;
  localRay.set(probePoint.set(v.x,100,v.z),down);const hit=localRay.intersectObjects(cityCoreMeshes,false)[0];
  assert.ok(hit&&hit.point.y>ground+.25,'Every formerly buried centreline sample now has a visible bright core');
  segmentBuried++;oldBuriedProbes++;
 }
 assert.ok(segmentBuried>=5,'The fixture reproduces the missing city-side segment, including the shallow southern toe');
}

// The historical timeline hides a parent of the hill. Both the neutral
// overview and bright district contour must return to the remaining terrain,
// then recover exactly once when the hill becomes visible again.
saturnRoot.visible=false;boundaryDistricts.setOpacity(0);boundaryDistricts.setOverviewOpacity(1);boundaryScene.updateMatrixWorld(true);
assert.equal(boundaryDistricts.state().visibleOverviewBoundary,1);
let restoredFlatVertices=0;
for(const mesh of cityBoundaries){
 const hidden=boundaryWorld(mesh),shown=visibleBoundaryPositions.get(mesh);
 for(let i=0;i<hidden.length;i++){
  assert.ok(Math.hypot(hidden[i].x-shown[i].x,hidden[i].z-shown[i].z)<.001,'Timeline changes preserve every geographic boundary vertex');
  const expected=mesh===cityOverview?-1.56:mesh.geometry.parameters.width===32?-1.85:mesh.geometry.parameters.width===8?-1.65:-1.42;
  assert.ok(Math.abs(hidden[i].y-expected)<.001,'A hidden local hill leaves no floating contour above the flat regional terrain');
  if(shown[i].y-hidden[i].y>1)restoredFlatVertices++;
 }
}
assert.ok(restoredFlatVertices>100,'Hiding Saturn actually lowers the contour across its shoulder');
saturnRoot.visible=true;boundaryDistricts.setOverviewOpacity(1);boundaryScene.updateMatrixWorld(true);
assert.equal(boundaryDistricts.state().visibleOverviewBoundary,1);
boundaryDistricts.setOpacity(1);boundaryDistricts.setOpacity(1);boundaryScene.updateMatrixWorld(true);
assert.equal(boundaryDistricts.state().visibleOuterBoundaries,1);
for(const mesh of cityBoundaries){
 const restored=boundaryWorld(mesh),shown=visibleBoundaryPositions.get(mesh);
 for(let i=0;i<restored.length;i++)assert.ok(restored[i].distanceTo(shown[i])<.001,'Restoring and repeatedly updating the hill does not accumulate contour height');
}
console.log('FLANKS_GEOMETRY_PASS',JSON.stringify({version:state.version,coordinateSystem:state.coordinateSystem,northernSpur:true,outlineArea,polygonAreas,overlapArea,coverageProbes,insideProbes,outsideProbes,sharedSegments:shared.length,perimeterSegments:perimeterEdges.length,neonCoreSegments:cores.length,saturnDistrict:'center',southernCityCovered:false,reliefClipProbes,raisedOverlayProbes,flatDrapeProbes,drapedBoundaryVertices,physicalBoundaryProbes,reliefAttributesShared:true,overviewReliefVisibility:true,continuousReliefFill:true,patchCoverageProbes,patchEdgeProbes,raisedPatchRimProbes,localBoundaryProbes,localOverviewProbes,localInteriorProbes,oldBuriedProbes,minLocalBoundaryClearance,restoredFlatVertices}));
