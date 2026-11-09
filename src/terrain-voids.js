import {GAGARIN_RIM_METRES,excavationCutout} from './soyuz-excavation-profile.js?v=20261103-soyuz-pits-v1';
import * as THREE from 'three';
// Cut terrain, not structures. Preserve the existing UKSS shader hook.
export function createTerrainVoids(){
 const items=[],materials=new Set();
 const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
 function sync(item){
  item.root.updateWorldMatrix(true,false);item.enabled.value=visible(item.root)?1:0;item.circle.value.w=item.enabled.value;
  if(item.lastMatrix?.equals(item.root.matrixWorld))return;
  item.lastMatrix=item.root.matrixWorld.clone();item.inverse.value.copy(item.root.matrixWorld).invert();
  const sh=item.shape,points=sh.polygon||[[(sh.x||0)-sh.rx,(sh.z||0)-sh.rz],[(sh.x||0)+sh.rx,(sh.z||0)-sh.rz],[(sh.x||0)+sh.rx,(sh.z||0)+sh.rz],[(sh.x||0)-sh.rx,(sh.z||0)+sh.rz]];
  let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
  for(const[x,z]of points){const p=new THREE.Vector3(x,0,z).applyMatrix4(item.root.matrixWorld);x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z);}
  item.bounds.value.set(x0-.001,z0-.001,x1+.001,z1+.001);
  if(sh.compactCircle){const c=new THREE.Vector3(sh.x||0,0,sh.z||0).applyMatrix4(item.root.matrixWorld),scale=new THREE.Vector3().setFromMatrixColumn(item.root.matrixWorld,0).length();item.circle.value.set(c.x,c.z,Math.pow((sh.rx-.04)*scale,2),item.enabled.value);}
 }
 function add(root,shape){const item={root,shape,inverse:{value:new THREE.Matrix4()},enabled:{value:1},circle:{value:new THREE.Vector4()},bounds:{value:new THREE.Vector4()},lastMatrix:null};items.push(item);sync(item);return item;}
 function update(){for(const i of items)sync(i);}
 function mask(mat){
  if(!mat||materials.has(mat))return;materials.add(mat);
  const prior=mat.onBeforeCompile,priorKey=mat.customProgramCacheKey.bind(mat),signature=JSON.stringify(items.map(i=>i.shape));
  mat.onBeforeCompile=function(shader,renderer){
   prior.call(this,shader,renderer);let uniforms='',body='',functions='';
   items.forEach((item,i)=>{
    const id='museumVoid'+i,sh=item.shape;
    if(sh.compactCircle){shader.uniforms[id+'Circle']=item.circle;uniforms+=`uniform vec4 ${id}Circle;\n`;body+=`if(${id}Circle.w>0.5&&dot(vMuseumTerrainWorld.xz-${id}Circle.xy,vMuseumTerrainWorld.xz-${id}Circle.xy)<${id}Circle.z)discard;\n`;return;}
    shader.uniforms[id+'Inverse']=item.inverse;shader.uniforms[id+'Enabled']=item.enabled;shader.uniforms[id+'Bounds']=item.bounds;
    uniforms+=`uniform mat4 ${id}Inverse;uniform float ${id}Enabled;uniform vec4 ${id}Bounds;\n`;let test;
    if(sh.polygon){let edges='';sh.polygon.forEach((a,j)=>{const b=sh.polygon[(j+1)%sh.polygon.length];if(Math.abs(b[1]-a[1])<1e-9)return;const f=n=>Number(n).toFixed(5);edges+=`if((p.y>${f(Math.min(a[1],b[1]))})&&(p.y<=${f(Math.max(a[1],b[1]))})&&p.x<${f(a[0])}+(p.y-(${f(a[1])}))*${f((b[0]-a[0])/(b[1]-a[1]))})inside=!inside;\n`;});functions+=`bool ${id}Contains(vec2 p){bool inside=false;${edges}return inside;}\n`;test=`${id}Contains(q.xz)`;
    }else{const rx=(sh.rx-.04).toFixed(5),rz=(sh.rz-.04).toFixed(5),x=Number(sh.x||0).toFixed(5),z=Number(sh.z||0).toFixed(5);test=sh.shape==='rectangle'?`abs(q.x-(${x}))<${rx}&&abs(q.z-(${z}))<${rz}`:`dot((q.xz-vec2(${x},${z}))/vec2(${rx},${rz}),(q.xz-vec2(${x},${z}))/vec2(${rx},${rz}))<1.0`;}
    body+=`if(${id}Enabled>0.5&&vMuseumTerrainWorld.x>=${id}Bounds.x&&vMuseumTerrainWorld.z>=${id}Bounds.y&&vMuseumTerrainWorld.x<=${id}Bounds.z&&vMuseumTerrainWorld.z<=${id}Bounds.w){vec3 q=(${id}Inverse*vec4(vMuseumTerrainWorld,1.0)).xyz;if(${test})discard;}\n`;
   });
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMuseumTerrainWorld;').replace('#include <project_vertex>',`#include <project_vertex>
vec4 museumTerrainPoint=vec4(transformed,1.0);
#ifdef USE_INSTANCING
museumTerrainPoint=instanceMatrix*museumTerrainPoint;
#endif
vMuseumTerrainWorld=(modelMatrix*museumTerrainPoint).xyz;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vMuseumTerrainWorld;\n'+uniforms+functions).replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n'+body);
  };mat.customProgramCacheKey=()=>priorKey()+'|museum-voids-v3-compact-silos|'+signature;mat.needsUpdate=true;
 }
 return {add,mask,update,exportPolygons(){update();return items.filter(i=>i.enabled.value).map(i=>{const s=i.shape;let p=s.polygon;if(!p){const rx=s.rx-.04,rz=s.rz-.04;p=s.shape==='rectangle'?[[-rx,-rz],[rx,-rz],[rx,rz],[-rx,rz]]:Array.from({length:40},(_,n)=>[Math.cos(n/40*Math.PI*2)*rx,Math.sin(n/40*Math.PI*2)*rz]);p=p.map(([x,z])=>[x+(s.x||0),z+(s.z||0)]);}const points=p.map(([x,z])=>{const w=new THREE.Vector3(x,0,z).applyMatrix4(i.root.matrixWorld);return [w.x,w.z];});return {points,bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]};});},stats:()=>({count:items.length,materials:materials.size,spatialCulling:true,items:items.map(i=>({name:i.root.name,enabled:i.enabled.value,shape:i.shape,bounds:i.bounds.value.toArray()}))})};
}
export function gagarinVoid(){return {...excavationCutout(GAGARIN_RIM_METRES),source:'Gagarin photographic plan; terrain seam hidden below a raised concrete collar'};}
