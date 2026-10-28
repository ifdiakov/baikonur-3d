import * as THREE from 'three';
// Cut terrain, not structures. Preserve the existing UKSS shader hook.
export function createTerrainVoids(){
 const items=[],materials=new Set();
 const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
 function add(root,shape){const item={root,shape,inverse:{value:new THREE.Matrix4()},enabled:{value:1}};items.push(item);root.updateWorldMatrix(true,false);item.inverse.value.copy(root.matrixWorld).invert();return item;}
 function update(){for(const i of items){i.enabled.value=visible(i.root)?1:0;i.root.updateWorldMatrix(true,false);i.inverse.value.copy(i.root.matrixWorld).invert();}}
 function mask(mat){
  if(!mat||materials.has(mat))return;materials.add(mat);
  const prior=mat.onBeforeCompile,priorKey=mat.customProgramCacheKey.bind(mat),signature=JSON.stringify(items.map(i=>i.shape));
  mat.onBeforeCompile=function(shader,renderer){
   prior.call(this,shader,renderer);let uniforms='',body='',functions='';
   items.forEach((item,i)=>{
    const id='museumVoid'+i,sh=item.shape;
    shader.uniforms[id+'Inverse']=item.inverse;shader.uniforms[id+'Enabled']=item.enabled;
    uniforms+=`uniform mat4 ${id}Inverse;uniform float ${id}Enabled;\n`;let test;
    if(sh.polygon){let edges='';sh.polygon.forEach((a,j)=>{const b=sh.polygon[(j+1)%sh.polygon.length];if(Math.abs(b[1]-a[1])<1e-9)return;const f=n=>Number(n).toFixed(5);edges+=`if((p.y>${f(Math.min(a[1],b[1]))})&&(p.y<=${f(Math.max(a[1],b[1]))})&&p.x<${f(a[0])}+(p.y-(${f(a[1])}))*${f((b[0]-a[0])/(b[1]-a[1]))})inside=!inside;\n`;});functions+=`bool ${id}Contains(vec2 p){bool inside=false;${edges}return inside;}\n`;test=`${id}Contains(q.xz)`;
    }else{const rx=(sh.rx-.04).toFixed(5),rz=(sh.rz-.04).toFixed(5),x=Number(sh.x||0).toFixed(5),z=Number(sh.z||0).toFixed(5);test=sh.shape==='rectangle'?`abs(q.x-(${x}))<${rx}&&abs(q.z-(${z}))<${rz}`:`dot((q.xz-vec2(${x},${z}))/vec2(${rx},${rz}),(q.xz-vec2(${x},${z}))/vec2(${rx},${rz}))<1.0`;}
    body+=`if(${id}Enabled>0.5){vec3 q=(${id}Inverse*vec4(vMuseumTerrainWorld,1.0)).xyz;if(${test})discard;}\n`;
   });
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMuseumTerrainWorld;').replace('#include <project_vertex>','#include <project_vertex>\nvMuseumTerrainWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vMuseumTerrainWorld;\n'+uniforms+functions).replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n'+body);
  };mat.customProgramCacheKey=()=>priorKey()+'|museum-voids-v1|'+signature;mat.needsUpdate=true;
 }
 return {add,mask,update,stats:()=>({count:items.length,materials:materials.size,items:items.map(i=>({name:i.root.name,enabled:i.enabled.value,shape:i.shape}))})};
}
export function gagarinVoid(){
 const north=[[620,487],[619,355],[665,328],[715,310],[750,267],[780,271],[825,278],[880,290],[950,313],[1030,346],[1110,379],[1190,410],[1260,435],[1340,466],[1405,487],[1435,505],[1450,508]];
 const south=[[1450,581],[1435,593],[1405,608],[1340,623],[1260,650],[1190,677],[1110,714],[1030,750],[950,783],[880,806],[825,814],[780,813],[750,810],[686,796],[632,765],[613,711],[612,616]];
 return {polygon:[...north,...south].map(([x,z])=>[(z-546)*.5,-(x-674)*.5]),source:'gagarin-pad.js ductPlan and shoulders',rimY:18.1};
}
