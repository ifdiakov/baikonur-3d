import * as THREE from 'three';
import {buildAlrosaAircraft as buildFallback,titleTexture,diamondTexture,AIRCRAFT_SCALE,AIRCRAFT_LIGHT_FADE} from './aircraft-livery.js?v=20261101-a320-tail-v2';
import {createLightField} from './light-field.js?v=20261101-museum-view-v1';
import {A320_PROFILE,a320Support} from './a320-profile.js?v=20261101-a320-tail-v2';
export {AIRCRAFT_SCALE,AIRCRAFT_LIGHT_FADE,A320_PROFILE,a320Support};
export const AIRCRAFT_APPEARANCE_VERSION='a320-alrosa-v1';
const V=(...p)=>new THREE.Vector3(...p),ASSET=new URL('../assets/models/a320-alrosa/model-v1.glb',import.meta.url).href;
const SOURCES=['https://drive.google.com/file/d/13iJKCaKflNAiV7aGWgpf-hVw27DHVZ3S/view','https://sketchfab.com/3d-models/bulgaria-air-airbus-a320-214-ab1d295a30c1477eb8a81b072b5fbf06','https://aero.alrosa.ru/airline/our-fleet/'];
function paintBody(mesh){
 const matrix=mesh.matrixWorld.clone();mesh.material=mesh.material.clone();
 mesh.material.onBeforeCompile=shader=>{
  shader.uniforms.a320Frame={value:matrix};
  shader.vertexShader='varying vec3 a320Position;uniform mat4 a320Frame;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\na320Position=(a320Frame*vec4(position,1.0)).xyz;');
  const c=hex=>'vec3('+new THREE.Color(hex).toArray().map(x=>x.toFixed(6)).join(',')+')';
  shader.fragmentShader='varying vec3 a320Position;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   vec3 paint=vec3(1.0);
   if(a320Position.y<0.12)paint=${c('#bce9ed')};
   if(a320Position.y<-.05)paint=${c('#64c4e9')};
   if(a320Position.y<-.24)paint=${c('#318ac8')};
   if(a320Position.y<-.48)paint=${c('#20549f')};
   if(a320Position.y<-.73)paint=${c('#132c61')};
   diffuseColor.rgb*=paint;`);
 };mesh.material.customProgramCacheKey=()=>AIRCRAFT_APPEARANCE_VERSION+'-body';
}
function decal(root,target,side,{z,y,w,h,map,name}){
 const p=[],uv=[],idx=[],valid=[],ray=new THREE.Raycaster(),nx=32,ny=10;
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
  const u=i/nx,v=j/ny,zz=z-side*(u-.5)*w,yy=y+(v-.5)*h;ray.set(V(side*10,yy,zz),V(-side,0,0));
  const hit=ray.intersectObject(target,true)[0];valid.push(!!hit);
  const point=hit?hit.point.clone().addScaledVector(hit.face.normal.clone().transformDirection(hit.object.matrixWorld),.012):V(0,yy,zz);p.push(...point.toArray());uv.push(u,v);
 }
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;if([a,b,c,d].every(v=>valid[v]))idx.push(a,b,c,b,d,c);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(idx);geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({map,transparent:true,depthWrite:false,side:THREE.DoubleSide,roughness:.45,polygonOffset:true,polygonOffsetFactor:-2});const mesh=new THREE.Mesh(geometry,material);mesh.name=name;root.add(mesh);return mesh;
}
function addFanBlades(group){
 const positions=[];for(let i=0;i<18;i++){const a=i*Math.PI*2/18,points=[[.24,a-.08,.008],[.81,a+.12,0],[.81,a+.25,0],[.24,a+.08,.008]],v=points.map(([r,t,z])=>[r*Math.cos(t),r*Math.sin(t),z]);for(const j of [0,1,2,0,2,3])positions.push(...v[j]);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x53616c,metalness:.65,roughness:.4,side:THREE.DoubleSide}));mesh.name='Вентилятор · 18 лопаток';group.add(mesh);
}
export function buildAlrosaAircraft(parent,{fallback=true}={}){
 const model=new THREE.Group();model.name='Airbus A320-214 · АЛРОСА';model.scale.setScalar(AIRCRAFT_SCALE);model.userData.pickable=false;parent.add(model);
 const temporary=fallback?buildFallback(model):null;if(temporary){temporary.model.scale.setScalar(1);for(const f of ['nav','strobes','beacon','landing'])temporary[f].root.visible=false;}
 const opts={fog:true,distanceFade:AIRCRAFT_LIGHT_FADE},wingY=1.31,wingZ=-7.5,span=A320_PROFILE.wingspan/2;
 const nav=createLightField(model,[{x:-span,y:wingY,z:wingZ,height:0,color:0xff3548,size:6},{x:span,y:wingY,z:wingZ,height:0,color:0x58ffb1,size:6},{x:0,y:1.6,z:-22.7,height:0,color:0xfff6e4,size:5}],{...opts,name:'A320 · БАНО',minPixels:4});
 const strobes=createLightField(model,[-1,1].map(s=>({x:s*span,y:wingY+.08,z:wingZ,height:0,color:0xffffff,size:13})),{...opts,name:'A320 · стробоскопы',minPixels:8});
 const beacon=createLightField(model,[{x:0,y:2.77,z:-2,height:0,color:0xff3f31,size:10},{x:0,y:-1.7,z:-1,height:0,color:0xff4d38,size:8}],{...opts,name:'A320 · маяки',minPixels:6});
 const landing=createLightField(model,[-1,1].map(s=>({x:s*2.8,y:-.3,z:1.5,height:0,color:0xffedc9,size:12})),{...opts,name:'A320 · посадочные фары',minPixels:6});
 const gear=new THREE.Group();gear.name='A320 · ниши шасси';model.add(gear);const doors=[];
 for(const [name,pivot]of Object.entries(A320_PROFILE.pivots).filter(([n])=>n.startsWith('gear-')))for(const side of [-1,1]){
  const group=new THREE.Group(),nose=name==='gear-nose';group.position.set(pivot[0]+side*(nose?.3:.48),pivot[1]+.07,pivot[2]);gear.add(group);
  const panel=new THREE.Mesh(new THREE.BoxGeometry(nose?.3:.5,.055,nose?1.6:1.65),new THREE.MeshStandardMaterial({color:0x16346c,metalness:.2,roughness:.5}));panel.position.x=-side*(nose?.15:.25);group.add(panel);doors.push({root:group,side});
 }
 const state={status:'loading',error:null},legs=[],fans=[];let imported=null,body=null,cockpit=[],night=true,progress=0,gearTime=null,time=0;
 function setEvening(value){night=!!value;temporary?.setEvening(value);if(body)body.material.emissiveIntensity=night?1.25:.015;for(const mesh of cockpit)mesh.material.emissiveIntensity=night?.6:.04;}
 function setGear(value,phaseTime=null){progress=THREE.MathUtils.clamp(value,0,1);gearTime=phaseTime;temporary?.setGear(progress,phaseTime);
  for(const {root,nose,side}of legs){root.visible=progress>.002;root.rotation.set(nose?-(1-progress)*Math.PI/2:0,0,nose?0:-side*(1-progress)*1.48);}
  for(const d of doors)d.root.rotation.z=d.side*(phaseTime===null?Math.sin(progress*Math.PI):THREE.MathUtils.smoothstep(phaseTime,73,78)*(1-THREE.MathUtils.smoothstep(phaseTime,94,98)))*1.3;
  gear.visible=true;
 }
 const ready=(async()=>{
  try{
   const [{GLTFLoader},{MeshoptDecoder}]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs')]);
   const loaded=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(ASSET)).scene;loaded.updateWorldMatrix(true,true);
   loaded.traverse(mesh=>{if(!mesh.isMesh)return;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.museumComponent='a320-imported-model';if(mesh.name==='body'){body=mesh;paintBody(mesh);}if(mesh.name.startsWith('cockpit'))cockpit.push(mesh);});
   if(!body)throw Error('The supplied A320 fuselage is missing');
   const tail=loaded.getObjectByName('tail'),word=titleTexture('АЛРОСА','#173f82','italic 900 128px Arial'),emblem=diamondTexture(),engineWord=titleTexture('alrosa.aero','#f1f7fb','700 118px Arial');
   for(const side of [-1,1]){
    decal(loaded,body,side,{z:6.6,y:1.85,w:7.7,h:.64,map:word,name:'АЛРОСА · надпись на борту'});
    decal(loaded,tail,side,{z:-18.85,y:5.65,w:2.45,h:2.45,map:emblem,name:'АЛРОСА · алмаз на киле'});
   }
   const nacelles=[];loaded.traverse(mesh=>{if(mesh.isMesh&&mesh.name.startsWith('nacelle'))nacelles.push(mesh);});
   for(const side of [-1,1])for(const nacelle of nacelles)decal(loaded,nacelle,side,{z:.9,y:-1.4,w:2.2,h:.35,map:engineWord,name:'alrosa.aero · двигатель'});
   for(const name of ['gear-left','gear-right','gear-nose']){const group=loaded.getObjectByName(name);if(!group)throw Error('A320 gear missing: '+name);legs.push({root:group,nose:name==='gear-nose',side:name==='gear-left'?-1:1});}
   for(const name of ['fan-left','fan-right']){const group=loaded.getObjectByName(name);if(group){fans.push(group);addFanBlades(group);}}
   imported=loaded;model.add(imported);if(temporary){temporary.model.removeFromParent();const geometry=new Set(),materials=new Set(),textures=new Set();temporary.model.traverse(m=>{if(m.geometry)geometry.add(m.geometry);for(const mat of Array.isArray(m.material)?m.material:m.material?[m.material]:[]){materials.add(mat);for(const t of Object.values(mat))if(t?.isTexture)textures.add(t);}});geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
   state.status='ready';setEvening(night);setGear(progress,gearTime);fans.forEach((f,i)=>f.rotation.z=time*(12+i*.15));return true;
  }catch(error){state.status='fallback';state.error=String(error.message||error);return false;}
 })();
 return {model,gear,nav,strobes,beacon,landing,ready,setEvening,setGear,updateGear:setGear,updateDetails(t){time=t;if(!imported)temporary?.updateDetails(t);for(const [i,fan]of fans.entries())fan.rotation.z=t*(12+i*.15);},
  stats:()=>({version:AIRCRAFT_APPEARANCE_VERSION,status:state.status,error:state.error,airframe:'Airbus A320-214',livery:'АЛРОСА',liveryBasis:'museum adaptation',sourceUrls:SOURCES,sourceCredit:'Dave Love SketchFab · CC BY 4.0',bodyLength:A320_PROFILE.length,wingspan:A320_PROFILE.wingspan,scale:AIRCRAFT_SCALE,skin:'source-geometry-with-new-panel-livery',cabinWindows:A320_PROFILE.cabinWindows,litWindows:A320_PROFILE.cabinWindows,cockpitPanels:6,cockpitLit:night,night,cabinLightIntensity:night?1.25:.015,cockpitLightIntensity:night?.6:.04,gearLegs:3,gearWheelCount:6,gearVisible:progress>.002,gearLegRotations:legs.map(l=>l.root.rotation.toArray().slice(0,3)),gearDoorAngles:doors.map(d=>d.root.rotation.z),fuselageTitles:2,tailEmblems:2,engineCount:2,fanBladesPerEngine:18,pointLights:0,assetBytes:A320_PROFILE.assetBytes})};
}
