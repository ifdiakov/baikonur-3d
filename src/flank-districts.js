import * as THREE from 'three';
import * as FLANK_GEOMETRY from './flank-boundaries.js?v=20261031-facilities-rails-lighting-v1';
import {CITY_TERRITORY_COLOR,CITY_TERRITORY_OUTLINE,CITY_TERRITORY_REFERENCE} from './city-territory.js?v=20261103-solid-city-v1';
export {FLANK_BORDERS} from './flank-boundaries.js?v=20261031-facilities-rails-lighting-v1';
const {FLANK_BOUNDARY_VERSION,FLANK_REFERENCE,FLANK_OUTLINE,FLANK_BORDERS,FLANK_POLYGONS,FLANK_PERIMETER,FLANK_COORDINATE_SYSTEM}=FLANK_GEOMETRY;

/**
 * Thematic RocketTrip enterprise districts, not administrative borders or
 * surveyed launch-site ownership. Boundaries follow the owner's marked image
 * appear at the flank zoom level. A separate, restrained outline identifies
 * the whole cosmodrome at the overview level. District styling is retained.
 */
export const FLANK_DISTRICTS = [
  {key:'left',name:'НПО машиностроения · Центр Хруничева',color:0xd45a91,
   enterprises:['НПО машиностроения','Центр Хруничева'],
   rockets:'УР-100 · УР-500 «Протон»',
   purpose:'Испытания стратегических ракет; запуск тяжёлых спутников и орбитальных станций.',
   features:'Унификация ракетных систем; долгохранимые компоненты топлива.',
   sources:['https://npomash.ru/press/ru/tribuna060226.htm?l=0&prn=y','https://www.prlib.ru/history/619392']},
  {key:'center',name:'РКК «Энергия» · РКЦ «Прогресс»',color:0x39bad2,
   enterprises:['РКК «Энергия»','РКЦ «Прогресс»'],
   rockets:'Р-7 · «Восток» · «Союз» · Н-1 · «Энергия»',
   purpose:'Пилотируемые полёты, доставка грузов, запуск спутников; лунная программа.',
   features:'Семейство Р-7; кислородно-керосиновые носители; комплекс «Энергия — Буран».',
   sources:['https://www.samspace.ru/products/launch_vehicles/rakety_nositeli_semeystva_r7/','https://en.samspace.ru/about/history/']},
  {key:'right',name:'КБ «Южное» · «Южмаш»',color:0xefb65d,
   enterprises:['КБ «Южное»','«Южмаш»'],
   rockets:'Р-16 · Р-36 · «Циклон» · «Зенит» · «Днепр»',
   purpose:'Испытания стратегических ракет и выведение космических аппаратов на орбиту.',
   features:'Носители на базе боевых ракет; автоматизированный старт «Зенита».',
   sources:['https://www.unoosa.org/pdf/pres/stsc2010/tech-41.pdf','https://yuzhmash.com/en/about-company/','https://www.testpilot.ru/espace/bibl/kb-ujn/05.php']}
];

export function buildFlankDistricts(scene,point,W,H,{mapTransform=null}={}){
 const root=new THREE.Group();root.name='Фланги · тематические территории';scene.add(root);
 const overviewRoot=new THREE.Group();overviewRoot.name='Космодром · общий контур';scene.add(overviewRoot);
 const cityRoot=new THREE.Group();cityRoot.name='Город Байконур · территория';root.add(cityRoot);
 const zones=[],boundaries=[],materials=[],overviewMaterials=[],reliefSurfaces=[],overviewReliefSurfaces=[],boundaryMeshes=[],cityReliefSurfaces=[];
 const terrainPatches=[],regionalFills=[],boundaryRestPositions=new WeakMap();
 let localTerrainBoundaryVertices=0;
 const mapped=new Map();
 const geographicBoundary=FLANK_COORDINATE_SYSTEM==='osm-map';
 const transform=p=>{if(geographicBoundary||!mapTransform)return p;const key=p.join(',');if(!mapped.has(key))mapped.set(key,mapTransform(...p));return mapped.get(key);};
 const polygons=FLANK_POLYGONS.map(p=>p.map(transform));
 const borders=FLANK_BORDERS.map(p=>p.map(transform));
 const outline=FLANK_OUTLINE.map(transform);
 const outerFragments=FLANK_PERIMETER.map(p=>({...p,points:p.points.map(transform)}));
 const cityOutline=CITY_TERRITORY_OUTLINE;
 function polygonPredicate(name,polygon){
  const f=n=>Number(n).toFixed(6);let shader=`bool ${name}(vec2 p){bool inside=false;`;
  polygon.forEach((a,j)=>{const b=polygon[(j+1)%polygon.length];if(Math.abs(b[1]-a[1])<1e-9)return;
   shader+=`if(p.y>${f(Math.min(a[1],b[1]))}&&p.y<=${f(Math.max(a[1],b[1]))}&&p.x<${f(a[0])}+(p.y-(${f(a[1])}))*${f((b[0]-a[0])/(b[1]-a[1]))})inside=!inside;`;
  });return shader+'return inside;}';
 }
 // Self-lit map graphics must retain their color when the evening scene tints
 // ordinary MeshBasicMaterials. Log-depth chunks match the museum renderer.
 function ink(color,strength,additive=false,surfaceAlpha=false,clipPolygon=null,collection=materials){
  let clipFunction='';
  if(clipPolygon){
   clipFunction=polygonPredicate('insideFlank',clipPolygon.map(p=>{const v=point(...p);return [v.x,v.z];}));
  }
  const mat=new THREE.ShaderMaterial({
   uniforms:{uColor:{value:new THREE.Color(color)},uOpacity:{value:0}},
   vertexShader:`#include <common>
#include <logdepthbuf_pars_vertex>
${surfaceAlpha?'attribute vec4 color; varying float vSurfaceOpacity;':''}
${clipPolygon?'varying vec2 vFlankWorld;':''}
void main(){${surfaceAlpha?'vSurfaceOpacity=color.a;':''}${clipPolygon?'vFlankWorld=(modelMatrix*vec4(position,1.)).xz;':''}gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
#include <logdepthbuf_vertex>
}`,
   fragmentShader:`uniform vec3 uColor;uniform float uOpacity;
#include <common>
#include <logdepthbuf_pars_fragment>
${surfaceAlpha?'varying float vSurfaceOpacity;':''}
${clipPolygon?'varying vec2 vFlankWorld;'+clipFunction:''}
void main(){
#include <logdepthbuf_fragment>
${clipPolygon?'if(!insideFlank(vFlankWorld))discard;':''}
gl_FragColor=vec4(uColor,uOpacity${surfaceAlpha?'*vSurfaceOpacity':''});
#include <colorspace_fragment>
}`,
   transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
   blending:additive?THREE.AdditiveBlending:THREE.NormalBlending
  });mat.toneMapped=false;collection.push({mat,strength});return mat;
 }
 for(let i=0;i<3;i++){
  const shape=new THREE.Shape();polygons[i].forEach(([x,z],j)=>{const p=point(x,z);j?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z);});shape.closePath();
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),ink(FLANK_DISTRICTS[i].color,.19));
  mesh.rotation.x=-Math.PI/2;mesh.position.y=-2.56;mesh.renderOrder=3;
  mesh.name='Тематическая зона · '+FLANK_DISTRICTS[i].name;mesh.userData.pickable=false;root.add(mesh);zones.push(mesh);
  mesh.userData.flank=FLANK_DISTRICTS[i].key;
 }

 // The city's mapped perimeter is a fourth, independent district on the
 // FLANK zoom level. Reuse the district fill shader and the 32/8/2.2
 // glowing edge sizes, but not the launch-site ownership colours.
 const cityShape=new THREE.Shape();
 cityOutline.forEach(([x,z],i)=>{const p=point(x,z);i?cityShape.lineTo(p.x,-p.z):cityShape.moveTo(p.x,-p.z);});
 cityShape.closePath();
 const cityFlatFill=new THREE.Mesh(new THREE.ShapeGeometry(cityShape),ink(CITY_TERRITORY_COLOR,.21));
 cityFlatFill.rotation.x=-Math.PI/2;cityFlatFill.position.y=-2.56;cityFlatFill.renderOrder=3;
 cityFlatFill.name='Город Байконур · цветная заливка';cityFlatFill.userData={pickable:false,museumComponent:'city-territory-fill'};
 cityRoot.add(cityFlatFill);
 // Shared miter joins close the perimeter without overlapping glow fragments,
 // unlike a separately placed panel per road/shoreline segment.
 function closedCityRibbon(width,height,material){
  const nodes=cityOutline.map(([x,z])=>point(x,z,height)),sampled=[];
  for(let i=0;i<nodes.length;i++){
   const a=nodes[i],b=nodes[(i+1)%nodes.length],steps=Math.max(1,Math.ceil(a.distanceTo(b)/12));
   for(let j=0;j<steps;j++)sampled.push(a.clone().lerp(b,j/steps));
  }
  const v=[],idx=[];
  for(let i=0;i<sampled.length;i++){
   const prev=sampled[(i+sampled.length-1)%sampled.length],curr=sampled[i],next=sampled[(i+1)%sampled.length];
   const d0=curr.clone().sub(prev).setY(0).normalize(),d1=next.clone().sub(curr).setY(0).normalize();
   const n0=new THREE.Vector3(-d0.z,0,d0.x),n1=new THREE.Vector3(-d1.z,0,d1.x),miter=n0.clone().add(n1);
   if(miter.lengthSq()<1e-12)miter.copy(n1);else miter.normalize();
   const reach=Math.min(width*2,width*.5/Math.max(.25,Math.abs(miter.dot(n1))));
   for(const sign of [-1,1])v.push(curr.x+sign*reach*miter.x,curr.y,curr.z+sign*reach*miter.z);
   const a=2*i,b=2*((i+1)%sampled.length);idx.push(a,a+1,b,a+1,b+1,b);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
  geometry.setIndex(idx);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Город Байконур · сплошная граница';mesh.renderOrder=5;
  mesh.userData={pickable:false,museumComponent:'city-territory-boundary',continuous:true};
  cityRoot.add(mesh);boundaryMeshes.push(mesh);return mesh;
 }
 const cityBoundaryMeshes=[
  closedCityRibbon(32,-1.85,ink(CITY_TERRITORY_COLOR,.14,true)),
  closedCityRibbon(8,-1.65,ink(CITY_TERRITORY_COLOR,.58,true)),
  closedCityRibbon(2.2,-1.42,ink(0xecfbff,1,true))
 ];

 function ribbon(parent,points,width,material,height,offset=0){
  for(let j=1;j<points.length;j++){
   const a=point(...points[j-1],height),b=point(...points[j],height),delta=b.clone().sub(a);
   const side=new THREE.Vector3(-delta.z,0,delta.x).normalize().multiplyScalar(offset);
   const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,delta.length()+width*.6,1,Math.ceil(delta.length()/12)),material);
   mesh.rotation.set(-Math.PI/2,0,Math.atan2(delta.x,delta.z));mesh.position.copy(a).lerp(b,.5).add(side);
   mesh.renderOrder=5;mesh.userData.pickable=false;parent.add(mesh);boundaryMeshes.push(mesh);
  }
 }
 borders.forEach((points,i)=>{
  const border=new THREE.Group();border.name='Граница тематических флангов '+(i+1);root.add(border);boundaries.push(border);
  ribbon(border,points,32,ink(FLANK_DISTRICTS[i].color,.14,true),-1.85,-8);
  ribbon(border,points,32,ink(FLANK_DISTRICTS[i+1].color,.14,true),-1.83,8);
  ribbon(border,points,8,ink(FLANK_DISTRICTS[i].color,.58,true),-1.65,-3.3);
  ribbon(border,points,8,ink(FLANK_DISTRICTS[i+1].color,.58,true),-1.63,3.3);
  ribbon(border,points,2.2,ink(0xecfbff,1,true),-1.42);
 });
 const perimeter=new THREE.Group();perimeter.name='Внешняя граница тематических флангов';root.add(perimeter);
 for(const {key,points} of outerFragments){
  const district=FLANK_DISTRICTS.find(d=>d.key===key);
  ribbon(perimeter,points,32,ink(district.color,.14,true),-1.85);
  ribbon(perimeter,points,8,ink(district.color,.58,true),-1.65);
  ribbon(perimeter,points,2.2,ink(0xecfbff,1,true),-1.42);
 }
 // The first zoom level has one continuous, neutral perimeter. A mitered
 // ribbon shares its corner vertices, avoiding bright doubled alpha at joins.
 const overviewShape=new THREE.Shape();
 outline.forEach(([x,z],i)=>{const p=point(x,z);i?overviewShape.lineTo(p.x,-p.z):overviewShape.moveTo(p.x,-p.z);});overviewShape.closePath();
 const overviewFillMaterial=ink(0xa8bcc1,.025,false,false,null,overviewMaterials);
 const overviewFill=new THREE.Mesh(new THREE.ShapeGeometry(overviewShape),overviewFillMaterial);
 overviewFill.name='Космодром · почти прозрачная заливка';overviewFill.rotation.x=-Math.PI/2;overviewFill.position.y=-2.55;overviewFill.renderOrder=3;
 overviewFill.userData={pickable:false,museumComponent:'cosmodrome-overview-fill'};overviewRoot.add(overviewFill);
 const overviewLineWidth=8,overviewBoundaryMaterial=ink(0xbfd0d2,.26,false,false,null,overviewMaterials);
 const ring=outline.map(p=>point(...p,-1.56));
 if(ring.length>1&&ring[0].distanceToSquared(ring.at(-1))<1e-12)ring.pop();
 const vertices=[],indices=[];
 for(let i=0;i<ring.length;i++){
  const current=ring[i],previous=ring[(i+ring.length-1)%ring.length],next=ring[(i+1)%ring.length];
  const before=current.clone().sub(previous).setY(0).normalize(),after=next.clone().sub(current).setY(0).normalize();
  const n0=new THREE.Vector3(-before.z,0,before.x),n1=new THREE.Vector3(-after.z,0,after.x),miter=n0.clone().add(n1);
  if(miter.lengthSq()<1e-12)miter.copy(n1);else miter.normalize();
  const reach=Math.min(overviewLineWidth*2,overviewLineWidth*.5/Math.max(.25,Math.abs(miter.dot(n1))));
  for(const side of [-1,1])vertices.push(current.x+miter.x*reach*side,current.y,current.z+miter.z*reach*side);
  const a=i*2,b=((i+1)%ring.length)*2;indices.push(a,a+1,b,a+1,b+1,b);
 }
 const overviewLineGeometry=new THREE.BufferGeometry();overviewLineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));overviewLineGeometry.setIndex(indices);overviewLineGeometry.computeVertexNormals();
 const overviewBoundary=new THREE.Mesh(overviewLineGeometry,overviewBoundaryMaterial);overviewBoundary.name='Космодром · единая обзорная граница';overviewBoundary.renderOrder=5;
 overviewBoundary.userData={pickable:false,museumComponent:'cosmodrome-overview-boundary',continuous:true};overviewRoot.add(overviewBoundary);
 let alpha=0,overviewAlpha=0,overviewRequestedAlpha=0,continuousReliefFill=false,regionalTerrain=null;
 // A flat map polygon sits below relief. Drape the same district colour over
 // the actual hill mesh, retaining its feathered footprint and depth shading.
 function liftedGeometry(source){
  const geometry=source.geometry.clone(),position=geometry.attributes.position;
  if(!geometry.attributes.normal)geometry.computeVertexNormals();
  const normal=geometry.attributes.normal;
  source.updateWorldMatrix(true,false);
  const scale=source.getWorldScale(new THREE.Vector3()),lift=.08/Math.min(scale.x,scale.y,scale.z);
  for(let i=0;i<position.count;i++)position.setXYZ(i,position.getX(i)+normal.getX(i)*lift,position.getY(i)+normal.getY(i)*lift,position.getZ(i)+normal.getZ(i)*lift);
  position.needsUpdate=true;
  if(geometry.attributes.color?.itemSize!==4){
   const colors=new Float32Array(position.count*4);colors.fill(1);geometry.setAttribute('color',new THREE.BufferAttribute(colors,4));
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
 }
 const flatFillHeight=()=>Math.max(zones[0].getWorldPosition(new THREE.Vector3()).y,overviewFill.getWorldPosition(new THREE.Vector3()).y);
 // Saturn is a much denser mesh than the regional grid. Replace the tint
 // below its full, flat-edged square with one equally coloured hill sheet.
 // Feathering the colour by soil alpha would paint a halo around the toe.
 function continuousHillGeometry(source){
  const geometry=source.geometry.clone(),position=geometry.attributes.position;
  source.updateWorldMatrix(true,false);
  const inverse=source.matrixWorld.clone().invert(),vertex=new THREE.Vector3(),floor=flatFillHeight();
  for(let i=0;i<position.count;i++){
   vertex.fromBufferAttribute(source.geometry.attributes.position,i).applyMatrix4(source.matrixWorld);
   vertex.y=Math.max(floor,vertex.y+.08);
   vertex.applyMatrix4(inverse);position.setXYZ(i,vertex.x,vertex.y,vertex.z);
  }
  const colors=new Float32Array(position.count*4);colors.fill(1);geometry.setAttribute('color',new THREE.BufferAttribute(colors,4));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  source.geometry.computeBoundingBox();const b=source.geometry.boundingBox;
  const footprint=[[b.min.x,b.min.z],[b.max.x,b.min.z],[b.max.x,b.max.z],[b.min.x,b.max.z]].map(([x,z])=>{
   const p=new THREE.Vector3(x,0,z).applyMatrix4(source.matrixWorld);return [p.x,p.z];
  });
  return {geometry,footprint};
 }
 function applyTerrainPatchMask(material,key){
  const patches=terrainPatches.filter(patch=>key==='overview'||patch.key===key);if(!patches.length)return;
  const saved=material.userData.terrainPatchShader??={vertex:material.vertexShader,fragment:material.fragmentShader};
  let vertex=saved.vertex,fragment=saved.fragment;
  if(!vertex.includes('varying vec2 vFlankWorld;'))vertex=vertex
   .replace('#include <common>','#include <common>\nvarying vec2 vFlankWorld;')
   .replace('void main(){','void main(){vFlankWorld=(modelMatrix*vec4(position,1.)).xz;');
  if(!fragment.includes('varying vec2 vFlankWorld;'))fragment='varying vec2 vFlankWorld;\n'+fragment;
  const predicates=patches.map((patch,i)=>{
   material.uniforms['uTerrainPatchActive'+i]=patch.enabled;
   return `uniform float uTerrainPatchActive${i};`+polygonPredicate('insideTerrainPatch'+i,patch.footprint);
  }).join('\n');
  const rejects=patches.map((_,i)=>`if(uTerrainPatchActive${i}>.5&&insideTerrainPatch${i}(vFlankWorld))discard;`).join('');
  material.vertexShader=vertex;material.fragmentShader=fragment.replace('void main(){',predicates+'\nvoid main(){'+rejects);
  material.needsUpdate=true;
 }
 function clipTerrainPatch(material,footprint){
  material.fragmentShader=material.fragmentShader.replace('void main(){',
   polygonPredicate('insideLocalTerrainPatch',footprint)+'\nvoid main(){if(!insideLocalTerrainPatch(vFlankWorld))discard;');
  material.needsUpdate=true;
 }
 function adaptTerrainPatch(patch,terrain){
  const source=patch.source,original=source.geometry.attributes.position,position=patch.geometry.attributes.position;
  source.updateWorldMatrix(true,false);
  const inverse=source.matrixWorld.clone().invert(),vertex=new THREE.Vector3(),floor=flatFillHeight();
  for(let i=0;i<position.count;i++){
   vertex.fromBufferAttribute(original,i).applyMatrix4(source.matrixWorld);
   vertex.y=Math.max(floor,vertex.y+.08,terrain.heightAt(vertex.x,vertex.z)+.08);
   vertex.applyMatrix4(inverse);position.setXYZ(i,vertex.x,vertex.y,vertex.z);
  }
  position.needsUpdate=true;patch.geometry.computeBoundingBox();patch.geometry.computeBoundingSphere();
 }
 function registerTerrainPatch(source,key,patch,heightAt){
  const record={...patch,key,source,heightAt,enabled:{value:1}};terrainPatches.push(record);
  if(regionalTerrain)adaptTerrainPatch(record,regionalTerrain);
  const overview=new THREE.Mesh(patch.geometry,ink(0xa8bcc1,.025,false,false,outline,overviewMaterials));
  overview.name='Космодром · непрерывная заливка холма Сатурна';overview.renderOrder=4;
  overview.userData={pickable:false,groundSurface:false,museumComponent:'overview-relief-patch',clipToDistrict:true};
  clipTerrainPatch(overview.material,patch.footprint);
  source.add(overview);overviewReliefSurfaces.push(overview);
  for(let i=0;i<zones.length;i++)applyTerrainPatchMask(zones[i].material,FLANK_DISTRICTS[i].key);
  applyTerrainPatchMask(overviewFill.material,'overview');
  for(const fill of regionalFills)applyTerrainPatchMask(fill.material,fill.key);
  if(regionalTerrain&&heightAt)drapeBoundaries();
 }
 // Regional tint is one continuous sheet, including engineered flat areas.
 // Reusing the soil's sparse triangles and feathered alpha would switch from
 // the old flat fill to the raised fill at a depth-test threshold, drawing a
 // false contour even when the underlying slope is smooth.
 function continuousReliefGeometry(terrain){
  const source=terrain.mesh,{columns,rows}=terrain.stats().grid;
  const positions=source.geometry.attributes.position,stride=columns+1;
  if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||positions.count!==stride*(rows+1))
   throw new Error('Regional district fill requires the complete terrain grid');
  const geometry=new THREE.BufferGeometry();
  for(const [name,attribute]of Object.entries(source.geometry.attributes))
   geometry.setAttribute(name,name==='position'?attribute.clone():attribute);
  const position=geometry.attributes.position,colors=new Float32Array(position.count*4);colors.fill(1);
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,4));
  source.updateWorldMatrix(true,false);
  const inverse=source.matrixWorld.clone().invert(),vertex=new THREE.Vector3();
  const flatHeight=flatFillHeight();
  for(let i=0;i<position.count;i++){
   vertex.fromBufferAttribute(positions,i).applyMatrix4(source.matrixWorld);
   vertex.y=Math.max(flatHeight,vertex.y+.08);
   vertex.applyMatrix4(inverse);position.setXYZ(i,vertex.x,vertex.y,vertex.z);
  }
  const indices=new (position.count>65535?Uint32Array:Uint16Array)(columns*rows*6);
  let k=0;
  for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){
   const a=z*stride+x,b=a+1,c=a+stride,d=c+1;
   indices[k++]=a;indices[k++]=c;indices[k++]=b;indices[k++]=b;indices[k++]=c;indices[k++]=d;
  }
  geometry.setIndex(new THREE.BufferAttribute(indices,1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
 }
 // Share lifted vertex attributes; restrict each district's index to its
 // bounding rectangle. The existing exact polygon shader clips the rim.
 function boundedGeometry(geometry,polygon,source=null){
  const world=polygon.map(p=>point(...p)),xs=world.map(p=>p.x),zs=world.map(p=>p.z);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const p=geometry.attributes.position,index=geometry.index,indices=[];
  // Selection takes place in world X/Z, but the overlay remains a child of
  // its terrain mesh and retains local vertices, including parent transforms.
  let worldXZ=null;
  if(source){
   source.updateWorldMatrix(true,false);worldXZ=new Float64Array(p.count*2);
   const vertex=new THREE.Vector3();
   for(let i=0;i<p.count;i++){
    vertex.fromBufferAttribute(p,i).applyMatrix4(source.matrixWorld);
    worldXZ[i*2]=vertex.x;worldXZ[i*2+1]=vertex.z;
   }
  }
  const x=i=>worldXZ?worldXZ[i*2]:p.getX(i),z=i=>worldXZ?worldXZ[i*2+1]:p.getZ(i);
  for(let i=0;i<index.count;i+=3){
   const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
   if(Math.max(x(a),x(b),x(c))<minX||Math.min(x(a),x(b),x(c))>maxX||
      Math.max(z(a),z(b),z(c))<minZ||Math.min(z(a),z(b),z(c))>maxZ)continue;
   indices.push(a,b,c);
  }
  const result=new THREE.BufferGeometry();
  for(const [name,attribute]of Object.entries(geometry.attributes))result.setAttribute(name,attribute);
  result.setIndex(indices);result.computeBoundingBox();result.computeBoundingSphere();return result;
 }
 function addTerrainSurface(source,key,{sharedGeometry=null,heightAt=null}={}){
  const district=FLANK_DISTRICTS.find(d=>d.key===key);
  if(!district||!source?.isMesh)throw new Error('A terrain mesh and known flank are required');
  const clipPolygon=polygons[FLANK_DISTRICTS.indexOf(district)];
  const patch=!sharedGeometry&&source.userData.museumComponent==='murguduk-hill'?continuousHillGeometry(source):null;
  const geometry=sharedGeometry?boundedGeometry(sharedGeometry,clipPolygon,source):patch?.geometry??liftedGeometry(source);
  const overlay=new THREE.Mesh(geometry,ink(district.color,.19,false,!sharedGeometry&&!patch,clipPolygon));
  overlay.name='Цвет фланга на рельефе · '+key;overlay.renderOrder=4;
  overlay.userData={pickable:false,groundSurface:false,museumComponent:'flank-relief-overlay',flank:key,clipToDistrict:true};
  overlay.visible=alpha>.035;source.add(overlay);reliefSurfaces.push(overlay);
  overlay.material.uniforms.uOpacity.value=alpha*.19;
  if(sharedGeometry){regionalFills.push({material:overlay.material,key});applyTerrainPatchMask(overlay.material,key);}
  if(patch){overlay.userData.continuousTintPatch=true;clipTerrainPatch(overlay.material,patch.footprint);registerTerrainPatch(source,key,patch,heightAt);syncOpacity();}
  return overlay;
 }
 function addTerrainRelief(terrain){
  const {mesh:source}=terrain,geometry=continuousReliefGeometry(terrain);
  regionalTerrain=terrain;for(const patch of terrainPatches)adaptTerrainPatch(patch,terrain);
  for(const district of FLANK_DISTRICTS)addTerrainSurface(source,district.key,{sharedGeometry:geometry});
  // Draped tint follows the same DEM surface and exact polygon clipping as
  // the three flanks. The planar sheet is retained only where DEM has no data.
  const cityDraped=new THREE.Mesh(boundedGeometry(geometry,cityOutline,source),ink(CITY_TERRITORY_COLOR,.21,false,false,cityOutline));
  cityDraped.name='Город Байконур · заливка на рельефе';cityDraped.renderOrder=4;
  cityDraped.userData={pickable:false,museumComponent:'city-territory-relief',clipToDistrict:true};
  source.add(cityDraped);cityReliefSurfaces.push(cityDraped);
  regionalFills.push({material:cityDraped.material,key:'city'});applyTerrainPatchMask(cityDraped.material,'city');
  const overlay=new THREE.Mesh(boundedGeometry(geometry,outline,source),ink(0xa8bcc1,.025,false,false,outline,overviewMaterials));
  overlay.name='Космодром · обзорная заливка на рельефе';overlay.renderOrder=4;
  overlay.userData={pickable:false,museumComponent:'overview-relief-overlay',clipToDistrict:true};
  source.add(overlay);overviewReliefSurfaces.push(overlay);
  regionalFills.push({material:overlay.material,key:'overview'});applyTerrainPatchMask(overlay.material,'overview');
  // Each place receives exactly one tint. The original flat fills remain a
  // fallback for scenes without regional relief; Saturn replaces its footprint.
  for(const zone of zones)zone.visible=false;
  overviewFill.visible=false;continuousReliefFill=true;
  // Refine each side of the continuous mitered ring before draping it.
  const old=overviewBoundary.geometry,positions=old.attributes.position,vertices=[],indices=[];
  for(let i=0;i<ring.length;i++){
   const next=(i+1)%ring.length,count=Math.max(1,Math.ceil(ring[i].distanceTo(ring[next])/12));
   for(let j=0;j<count;j++)for(let side=0;side<2;side++){
    const a=i*2+side,b=next*2+side,t=j/count;
    vertices.push(THREE.MathUtils.lerp(positions.getX(a),positions.getX(b),t),positions.getY(a),THREE.MathUtils.lerp(positions.getZ(a),positions.getZ(b),t));
   }
  }
  const pairCount=vertices.length/6;
  for(let i=0;i<pairCount;i++){const a=i*2,b=((i+1)%pairCount)*2;indices.push(a,a+1,b,a+1,b+1,b);}
  const refined=new THREE.BufferGeometry();refined.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));refined.setIndex(indices);
  overviewBoundary.geometry=refined;old.dispose();
  drapeBoundaries();
  syncOpacity();
 }
 function drapeBoundaries(){
  if(!regionalTerrain)return;
  // A protected regional grid stays flat beneath local terrain such as
  // Saturn. Follow the highest visible surface, including its real triangles.
  // Always start from the original ribbon so historic hide/show never adds
  // the hill's height twice or moves the registered X/Z outline.
  const localSurfaces=terrainPatches.filter(patch=>patch.heightAt&&patch.enabled.value>.5);
  localTerrainBoundaryVertices=0;
  const vertex=new THREE.Vector3();
  for(const mesh of [...boundaryMeshes,overviewBoundary]){
   mesh.updateWorldMatrix(true,false);const inverse=mesh.matrixWorld.clone().invert(),p=mesh.geometry.attributes.position;
   let rest=boundaryRestPositions.get(p);
   if(!rest){rest=p.array.slice();boundaryRestPositions.set(p,rest);}
   for(let i=0;i<p.count;i++){
    vertex.fromArray(rest,i*3).applyMatrix4(mesh.matrixWorld);
    const regionalHeight=regionalTerrain.heightAt(vertex.x,vertex.z);
    let height=regionalHeight;
    for(const patch of localSurfaces)height=Math.max(height,patch.heightAt(vertex.x,vertex.z));
    if(height>regionalHeight+1e-5)localTerrainBoundaryVertices++;
    vertex.y+=Math.max(0,height+2.755);
    vertex.applyMatrix4(inverse);p.setXYZ(i,vertex.x,vertex.y,vertex.z);
   }
   p.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
   mesh.userData.terrainDraped=true;
  }
 }
 function syncOpacity(){
  // The time machine can hide Saturn before its construction. Restore the
  // underlying regional tint whenever its replacement source is not visible.
  let terrainVisibilityChanged=false;
  for(const patch of terrainPatches){
   let visible=true;for(let node=patch.source;node;node=node.parent)if(!node.visible){visible=false;break;}
   if(patch.heightAt&&patch.enabled.value!==(visible?1:0))terrainVisibilityChanged=true;
   patch.enabled.value=visible?1:0;
  }
  if(terrainVisibilityChanged)drapeBoundaries();
  root.visible=alpha>.035;
  // The overview perimeter never stacks on the bright district perimeter.
  // The camera LOD fades overview out before bringing the districts in.
  overviewAlpha=root.visible?0:overviewRequestedAlpha;overviewRoot.visible=overviewAlpha>.001;
  for(const{mat,strength}of materials)mat.uniforms.uOpacity.value=alpha*strength;
  for(const{mat,strength}of overviewMaterials)mat.uniforms.uOpacity.value=overviewAlpha*strength;
  for(const mesh of reliefSurfaces)mesh.visible=root.visible;
  for(const mesh of cityReliefSurfaces)mesh.visible=root.visible;
  for(const mesh of overviewReliefSurfaces)mesh.visible=overviewRoot.visible;
 }
 function setOpacity(level){alpha=THREE.MathUtils.clamp(Number.isFinite(level)?level:0,0,1);syncOpacity();}
 function setOverviewOpacity(level){overviewRequestedAlpha=THREE.MathUtils.clamp(Number.isFinite(level)?level:0,0,1);syncOpacity();}
 syncOpacity();
 return {setOpacity,setOverviewOpacity,addTerrainSurface,addTerrainRelief,state:()=>({version:FLANK_BOUNDARY_VERSION,alpha,zoneCount:zones.length,
  visibleZones:root.visible?zones.length:0,visibleBoundaries:root.visible?boundaries.length:0,
  visibleOuterBoundaries:root.visible?1:0,outerBoundarySegments:FLANK_PERIMETER.reduce((n,p)=>n+p.points.length-1,0),
  overviewAlpha,overviewRequestedAlpha,visibleOverviewBoundary:overviewRoot.visible?1:0,visibleOverviewFill:overviewRoot.visible?1:0,
  overviewFillOpacity:overviewFillMaterial.uniforms.uOpacity.value,overviewBoundaryOpacity:overviewBoundaryMaterial.uniforms.uOpacity.value,
  overviewBoundarySegments:ring.length,overviewLineWidth,overviewNeutral:true,overviewAdditive:false,
  reference:FLANK_REFERENCE,outline,outerBoundary:outline,polygons,reliefClipped:true,coordinateSystem:geographicBoundary||mapTransform?'osm-map':'original-schematic',
  reliefCount:reliefSurfaces.length,reliefFlanks:reliefSurfaces.map(m=>m.userData.flank),visibleReliefSurfaces:reliefSurfaces.filter(m=>m.visible&&m.parent.visible).length,
  overviewReliefCount:overviewReliefSurfaces.length,terrainDraped:overviewBoundary.userData.terrainDraped===true,
  continuousReliefFill,flatFillMeshesVisible:root.visible?zones.filter(mesh=>mesh.visible).length:0,
  continuousTerrainPatches:terrainPatches.length,
  boundaryTerrainSources:terrainPatches.filter(patch=>patch.heightAt).length,localTerrainBoundaryVertices,
  thematicOnly:true,informationPlane:'screen',groundTextPanels:0,boundaryVertices:FLANK_BORDERS.map(p=>p.length),
  city:{visible:root.visible,reference:CITY_TERRITORY_REFERENCE,color:CITY_TERRITORY_COLOR,
   polygon:cityOutline,vertices:cityOutline.length,fillOpacity:cityFlatFill.material.uniforms.uOpacity.value,
   terrainReliefOverlays:cityReliefSurfaces.length,terrainOverlayVisible:cityReliefSurfaces.some(m=>m.visible&&m.parent.visible),
   solidBoundary:true,continuousBoundaryMeshes:cityBoundaryMeshes.length,
   terrainDraped:cityBoundaryMeshes.every(m=>m.userData.terrainDraped===true)}})};
}
