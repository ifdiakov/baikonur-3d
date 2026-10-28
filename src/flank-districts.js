import * as THREE from 'three';
import * as FLANK_GEOMETRY from './flank-boundaries.js?v=20261028-museum4-osm-live-v2';
export {FLANK_BORDERS} from './flank-boundaries.js?v=20261028-museum4-osm-live-v2';
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
 const zones=[],boundaries=[],materials=[],overviewMaterials=[],reliefSurfaces=[];
 const mapped=new Map();
 const geographicBoundary=FLANK_COORDINATE_SYSTEM==='osm-map';
 const transform=p=>{if(geographicBoundary||!mapTransform)return p;const key=p.join(',');if(!mapped.has(key))mapped.set(key,mapTransform(...p));return mapped.get(key);};
 const polygons=FLANK_POLYGONS.map(p=>p.map(transform));
 const borders=FLANK_BORDERS.map(p=>p.map(transform));
 const outline=FLANK_OUTLINE.map(transform);
 const outerFragments=FLANK_PERIMETER.map(p=>({...p,points:p.points.map(transform)}));
 // Self-lit map graphics must retain their color when the evening scene tints
 // ordinary MeshBasicMaterials. Log-depth chunks match the museum renderer.
 function ink(color,strength,additive=false,surfaceAlpha=false,clipPolygon=null,collection=materials){
  let clipFunction='';
  if(clipPolygon){
   const outline=clipPolygon.map(p=>{const v=point(...p);return [v.x,v.z];}),f=n=>Number(n).toFixed(6);
   clipFunction='bool insideFlank(vec2 p){bool inside=false;';
   outline.forEach((a,j)=>{const b=outline[(j+1)%outline.length];if(Math.abs(b[1]-a[1])<1e-9)return;
    clipFunction+=`if(p.y>${f(Math.min(a[1],b[1]))}&&p.y<=${f(Math.max(a[1],b[1]))}&&p.x<${f(a[0])}+(p.y-(${f(a[1])}))*${f((b[0]-a[0])/(b[1]-a[1]))})inside=!inside;`;
   });clipFunction+='return inside;}';
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
 function ribbon(parent,points,width,material,height,offset=0){
  for(let j=1;j<points.length;j++){
   const a=point(...points[j-1],height),b=point(...points[j],height),delta=b.clone().sub(a);
   const side=new THREE.Vector3(-delta.z,0,delta.x).normalize().multiplyScalar(offset);
   const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,delta.length()+width*.6),material);
   mesh.rotation.set(-Math.PI/2,0,Math.atan2(delta.x,delta.z));mesh.position.copy(a).lerp(b,.5).add(side);
   mesh.renderOrder=5;mesh.userData.pickable=false;parent.add(mesh);
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
 let alpha=0,overviewAlpha=0,overviewRequestedAlpha=0;
 // A flat map polygon sits below relief. Drape the same district colour over
 // the actual hill mesh, retaining its feathered footprint and depth shading.
 function addTerrainSurface(source,key){
  const district=FLANK_DISTRICTS.find(d=>d.key===key);
  if(!district||!source?.isMesh)throw new Error('A terrain mesh and known flank are required');
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
  const clipPolygon=polygons[FLANK_DISTRICTS.indexOf(district)];
  const overlay=new THREE.Mesh(geometry,ink(district.color,.19,false,true,clipPolygon));
  overlay.name='Цвет фланга на рельефе · '+key;overlay.renderOrder=4;
  overlay.userData={pickable:false,groundSurface:false,museumComponent:'flank-relief-overlay',flank:key,clipToDistrict:true};
  overlay.visible=alpha>.035;source.add(overlay);reliefSurfaces.push(overlay);
  overlay.material.uniforms.uOpacity.value=alpha*.19;
  return overlay;
 }
 function syncOpacity(){
  root.visible=alpha>.035;
  // The overview perimeter never stacks on the bright district perimeter.
  // The camera LOD fades overview out before bringing the districts in.
  overviewAlpha=root.visible?0:overviewRequestedAlpha;overviewRoot.visible=overviewAlpha>.001;
  for(const{mat,strength}of materials)mat.uniforms.uOpacity.value=alpha*strength;
  for(const{mat,strength}of overviewMaterials)mat.uniforms.uOpacity.value=overviewAlpha*strength;
  for(const mesh of reliefSurfaces)mesh.visible=root.visible;
 }
 function setOpacity(level){alpha=THREE.MathUtils.clamp(Number.isFinite(level)?level:0,0,1);syncOpacity();}
 function setOverviewOpacity(level){overviewRequestedAlpha=THREE.MathUtils.clamp(Number.isFinite(level)?level:0,0,1);syncOpacity();}
 syncOpacity();
 return {setOpacity,setOverviewOpacity,addTerrainSurface,state:()=>({version:FLANK_BOUNDARY_VERSION,alpha,zoneCount:zones.length,
  visibleZones:root.visible?zones.length:0,visibleBoundaries:root.visible?boundaries.length:0,
  visibleOuterBoundaries:root.visible?1:0,outerBoundarySegments:FLANK_PERIMETER.reduce((n,p)=>n+p.points.length-1,0),
  overviewAlpha,overviewRequestedAlpha,visibleOverviewBoundary:overviewRoot.visible?1:0,visibleOverviewFill:overviewRoot.visible?1:0,
  overviewFillOpacity:overviewFillMaterial.uniforms.uOpacity.value,overviewBoundaryOpacity:overviewBoundaryMaterial.uniforms.uOpacity.value,
  overviewBoundarySegments:ring.length,overviewLineWidth,overviewNeutral:true,overviewAdditive:false,
  reference:FLANK_REFERENCE,outline,outerBoundary:outline,polygons,reliefClipped:true,coordinateSystem:geographicBoundary||mapTransform?'osm-map':'original-schematic',
  reliefCount:reliefSurfaces.length,reliefFlanks:reliefSurfaces.map(m=>m.userData.flank),visibleReliefSurfaces:reliefSurfaces.filter(m=>m.visible&&m.parent.visible).length,
  thematicOnly:true,informationPlane:'screen',groundTextPanels:0,boundaryVertices:FLANK_BORDERS.map(p=>p.length)})};
}
