import * as THREE from 'three';

export const ENERGIA_GROUND_LIGHT_VERSION='energia-ground-light-20261114-v1';

/** A reflected launch glow belongs to the actual terrain fragments. Keeping
 * the same shader and changing only power avoids a new program at ignition;
 * the existing terrain/UKSS discard masks still define the visible surface. */
export function createEnergiaGroundLight({siteRoot,materials=[]}){
 const power={value:0},inverse={value:new THREE.Matrix4()},previousMatrix=new THREE.Matrix4();
 const patched=[];
 siteRoot.updateWorldMatrix(true,false);
 previousMatrix.copy(siteRoot.matrixWorld);inverse.value.copy(previousMatrix).invert();
 for(const material of new Set(materials)){
  if(!material||(!material.isMeshBasicMaterial&&!material.isMeshStandardMaterial))continue;
  const previousCompile=material.onBeforeCompile;
  const previousKey=material.customProgramCacheKey;
  const key=previousKey.call(material);
  const compile=function(shader,renderer){
   previousCompile.call(this,shader,renderer);
   shader.uniforms.energiaGroundPower=power;
   shader.uniforms.energiaGroundInverse=inverse;
   shader.vertexShader=shader.vertexShader.replace('#include <common>',
    '#include <common>\nvarying vec3 vEnergiaGroundWorld;');
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
vec4 energiaGroundPoint=vec4(transformed,1.0);
#ifdef USE_INSTANCING
energiaGroundPoint=instanceMatrix*energiaGroundPoint;
#endif
vEnergiaGroundWorld=(modelMatrix*energiaGroundPoint).xyz;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vEnergiaGroundWorld;
uniform float energiaGroundPower;
uniform mat4 energiaGroundInverse;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
if(energiaGroundPower>0.001){
 vec2 energiaGroundLocal=(energiaGroundInverse*vec4(vEnergiaGroundWorld,1.0)).xz;
 float energiaPadGlow=1.0-smoothstep(25.0,205.0,length(energiaGroundLocal));
 float energiaDuctGlow=1.0-smoothstep(0.0,1.0,length((energiaGroundLocal-vec2(155.0,0.0))/vec2(165.0,72.0)));
 float energiaGlow=max(energiaPadGlow*energiaPadGlow,energiaDuctGlow*energiaDuctGlow*0.72);
 float energiaSoil=0.20+0.80*clamp(dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722)),0.0,1.0);
 outgoingLight+=vec3(0.48,0.16,0.035)*energiaGroundPower*energiaGlow*energiaSoil;
}
#include <opaque_fragment>`);
  };
  const cache=()=>key+'|'+ENERGIA_GROUND_LIGHT_VERSION;
  material.onBeforeCompile=compile;material.customProgramCacheKey=cache;material.needsUpdate=true;
  patched.push({material,previousCompile,previousKey,compile,cache});
 }
 function update(value){
  siteRoot.updateWorldMatrix(true,false);
  if(!previousMatrix.equals(siteRoot.matrixWorld)){
   previousMatrix.copy(siteRoot.matrixWorld);inverse.value.copy(previousMatrix).invert();
  }
  power.value=Math.max(0,Math.min(1,Number(value)||0));
 }
 function hide(){power.value=0;}
 function dispose(){
  hide();
  for(const {material,previousCompile,previousKey,compile,cache} of patched){
   if(material.onBeforeCompile===compile)material.onBeforeCompile=previousCompile;
   if(material.customProgramCacheKey===cache)material.customProgramCacheKey=previousKey;
   material.needsUpdate=true;
  }
  patched.length=0;
 }
 return {update,hide,dispose,stats:()=>({version:ENERGIA_GROUND_LIGHT_VERSION,
  mode:'terrain-material-glow',power:power.value,materials:patched.length,extraDrawCalls:0})};
}
