// GPU-only, georeferenced material blending shared by every soil mesh.
// This module contains no external images; the atlas is built after first paint.
export const GLOBAL_SOIL_DETAIL_VERSION='world-builder-five-material-global-v1';
const COMMON=[
 'uniform sampler2D globalSoilAlbedo,globalSoilNormal,globalSoilRoughness;',
 'uniform float globalSoilStrength;',
 'vec2 globalSoilUV(float kind,vec2 world){',
 ' vec2 cell=vec2(mod(kind,4.0),floor(kind/4.0));',
 ' return (cell+mix(vec2(.0015),vec2(.9985),fract(world/3.2)))/vec2(4.0,2.0);',
 '}',
 'void globalSoilPair(vec3 w,out float a,out float b,out float fraction){',
 ' float n=sin(w.x*.011+sin(w.z*.017))*cos(w.z*.013-cos(w.x*.009));',
 ' float s=sin(w.x*.022+w.z*.014)*cos(w.z*.031-w.x*.005);',
 ' float gradient=clamp(length(vec2(dFdx(w.y),dFdy(w.y)))/max(length(dFdx(w.xz))+length(dFdy(w.xz)),.0001)*2.3,0.0,1.0);',
 ' float weights[5];',
 ' weights[0]=.46+.10*n;',
 ' weights[1]=.27+.20*n+.10*s-.10*gradient;',
 ' weights[2]=.13+.30*gradient+.13*s;',
 ' weights[3]=.08+.16*smoothstep(.1,.9,-n)*(.8-.35*gradient);',
 ' weights[4]=.15+.09*sin(w.z*.019-w.x*.024);',
 ' float best=-10.0,runner=-10.0;a=0.0;b=1.0;',
 ' for(int i=0;i<5;i++){',
 '  if(weights[i]>best){runner=best;b=a;best=weights[i];a=float(i);}',
 '  else if(weights[i]>runner){runner=weights[i];b=float(i);}',
 ' }',
 ' fraction=clamp(runner/max(best+runner,.0001),0.0,.5);',
 '}'
].join('\n');
const SHADE_COLOR=[
 'float globalSoilA=0.0,globalSoilB=1.0,globalSoilMix=0.0;',
 'if(globalSoilStrength>.001){',
 ' globalSoilPair(vSteppeWorld,globalSoilA,globalSoilB,globalSoilMix);',
 ' vec3 globalTone=mix(texture2D(globalSoilAlbedo,globalSoilUV(globalSoilA,vSteppeWorld.xz)).rgb,',
 '  texture2D(globalSoilAlbedo,globalSoilUV(globalSoilB,vSteppeWorld.xz)).rgb,globalSoilMix);',
 ' diffuseColor.rgb=mix(diffuseColor.rgb,globalTone,globalSoilStrength*.35);',
 '}'
].join('\n');
const SHADE_NORMAL=[
 'if(globalSoilStrength>.001){',
 ' vec3 gn=mix(texture2D(globalSoilNormal,globalSoilUV(globalSoilA,vSteppeWorld.xz)).rgb,',
 '  texture2D(globalSoilNormal,globalSoilUV(globalSoilB,vSteppeWorld.xz)).rgb,globalSoilMix)*2.0-1.0;',
 ' vec3 gx=normalize(vec3(1.00001,0.0,0.0)-normal*normal.x);',
 ' vec3 gz=normalize(cross(normal,gx));',
 ' normal=normalize(normal+(gx*gn.x+gz*gn.y)*globalSoilStrength*.20);',
 '}'
].join('\n');
const SHADE_ROUGHNESS=[
 'if(globalSoilStrength>.001){',
 ' float value=mix(texture2D(globalSoilRoughness,globalSoilUV(globalSoilA,vSteppeWorld.xz)).r,',
 ' texture2D(globalSoilRoughness,globalSoilUV(globalSoilB,vSteppeWorld.xz)).r,globalSoilMix);',
 ' roughnessFactor=mix(roughnessFactor,value,globalSoilStrength*.6);',
 '}'
].join('\n');
export function installGlobalSoilDetail(material,atlases,strength){
 if(material.userData.globalSoilDetailInstalled)return false;
 if(!material.userData.steppeSurface)throw new Error('Only existing steppe soil may receive detailed materials');
 const old=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
 material.onBeforeCompile=function(shader,renderer){
  old.call(this,shader,renderer);
  shader.uniforms.globalSoilAlbedo={value:atlases.albedo};
  shader.uniforms.globalSoilNormal={value:atlases.normal};
  shader.uniforms.globalSoilRoughness={value:atlases.roughness};
  shader.uniforms.globalSoilStrength=strength;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+COMMON);
  const satellite='diffuseColor.rgb*=steppeTone;';
  const procedural='diffuseColor.rgb*=steppeSurfaceTone(vSteppeWorld.xz);';
  const anchor=shader.fragmentShader.includes(satellite)?satellite:procedural;
  if(!shader.fragmentShader.includes(anchor))throw new Error('Global detailed soil requires a world XZ base surface');
  shader.fragmentShader=shader.fragmentShader.replace(anchor,anchor+'\n'+SHADE_COLOR);
  if(material.isMeshStandardMaterial){
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+SHADE_NORMAL);
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n'+SHADE_ROUGHNESS);
  }
 };
 material.customProgramCacheKey=()=>key()+'|'+GLOBAL_SOIL_DETAIL_VERSION;
 material.userData.globalSoilDetailInstalled=true;
 material.needsUpdate=true;return true;
}
