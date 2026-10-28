import * as THREE from 'three';

/**
 * Thematic RocketTrip enterprise districts, not administrative borders or
 * surveyed launch-site ownership. Boundaries follow the historical diagram
 * loosely and exist ONLY at the flank zoom level.
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

// Graphic, thematic boundaries only: deliberately angular, not cadastral lines.
export const FLANK_BORDERS=[
 [[425,40],[425,190],[480,245],[480,390],[430,440],[430,610],[480,660],[480,800]],
 [[890,40],[890,175],[830,235],[830,400],[880,450],[880,620],[925,665],[925,800]]
];
export function buildFlankDistricts(scene,point,W,H){
 const root=new THREE.Group();root.name='Фланги · тематические территории';scene.add(root);
 const zones=[],boundaries=[],materials=[];
 // Self-lit map graphics must retain their color when the evening scene tints
 // ordinary MeshBasicMaterials. Log-depth chunks match the museum renderer.
 function ink(color,strength,additive=false){
  const mat=new THREE.ShaderMaterial({
   uniforms:{uColor:{value:new THREE.Color(color)},uOpacity:{value:0}},
   vertexShader:`#include <common>
#include <logdepthbuf_pars_vertex>
void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
#include <logdepthbuf_vertex>
}`,
   fragmentShader:`uniform vec3 uColor;uniform float uOpacity;
#include <common>
#include <logdepthbuf_pars_fragment>
void main(){
#include <logdepthbuf_fragment>
gl_FragColor=vec4(uColor,uOpacity);
#include <colorspace_fragment>
}`,
   transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
   blending:additive?THREE.AdditiveBlending:THREE.NormalBlending
  });mat.toneMapped=false;materials.push({mat,strength});return mat;
 }
 const polygons=[
  [[0,40],...FLANK_BORDERS[0],[0,800]],
  [...FLANK_BORDERS[0],...FLANK_BORDERS[1].slice().reverse()],
  [...FLANK_BORDERS[1],[W,800],[W,40]]
 ];
 for(let i=0;i<3;i++){
  const shape=new THREE.Shape();polygons[i].forEach(([x,z],j)=>{const p=point(x,z);j?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z);});shape.closePath();
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),ink(FLANK_DISTRICTS[i].color,.19));
  mesh.rotation.x=-Math.PI/2;mesh.position.y=-2.56;mesh.renderOrder=3;
  mesh.name='Тематическая зона · '+FLANK_DISTRICTS[i].name;mesh.userData.pickable=false;root.add(mesh);zones.push(mesh);
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
 FLANK_BORDERS.forEach((points,i)=>{
  const border=new THREE.Group();border.name='Граница тематических флангов '+(i+1);root.add(border);boundaries.push(border);
  ribbon(border,points,32,ink(FLANK_DISTRICTS[i].color,.14,true),-1.85,-8);
  ribbon(border,points,32,ink(FLANK_DISTRICTS[i+1].color,.14,true),-1.83,8);
  ribbon(border,points,8,ink(FLANK_DISTRICTS[i].color,.58,true),-1.65,-3.3);
  ribbon(border,points,8,ink(FLANK_DISTRICTS[i+1].color,.58,true),-1.63,3.3);
  ribbon(border,points,2.2,ink(0xecfbff,1,true),-1.42);
 });
 let alpha=0;
 function setOpacity(level){alpha=THREE.MathUtils.clamp(level,0,1);root.visible=alpha>.035;for(const{mat,strength}of materials)mat.uniforms.uOpacity.value=alpha*strength;}
 setOpacity(0);
 return {setOpacity,state:()=>({version:'angular-territories-v2',alpha,zoneCount:zones.length,
  visibleZones:root.visible?zones.length:0,visibleBoundaries:root.visible?boundaries.length:0,
  thematicOnly:true,informationPlane:'screen',groundTextPanels:0,boundaryVertices:FLANK_BORDERS.map(p=>p.length)})};
}
