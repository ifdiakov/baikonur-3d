import {SOIL_ANTI_TILING_GLSL,SOIL_ANTI_TILING_VERSION} from './soil-anti-tiling.js?v=20261105-dual-domain-v1';

// GPU-only, georeferenced material blending shared by every soil mesh.
// This module contains no external images; the atlas is built after first paint.
export const GLOBAL_SOIL_DETAIL_VERSION='world-builder-five-material-global-v2-anti-tiling';
const COMMON=[
 SOIL_ANTI_TILING_GLSL,
 'uniform sampler2D globalSoilAlbedo,globalSoilNormal,globalSoilRoughness;',
 'uniform float globalSoilStrength;',
 'void globalSoilPair(vec3 w,out float a,out float b,out float fraction){',
 ' vec2 p=w.xz;',
 ' vec2 warp=vec2(soilDetailNoise(p/107.0+vec2(4.1,-2.2)),',
 '                soilDetailNoise(p/91.0+vec2(-9.7,7.4)))-.5;',
 ' vec2 uneven=p+warp*36.0;',
 ' float sand=soilDetailNoise(uneven/73.0+vec2(12.1,-2.3));',
 ' float gravel=soilDetailNoise(uneven/49.0+vec2(-7.2,8.3));',
 ' float salt=soilDetailNoise(uneven/109.0+vec2(3.8,19.7));',
 ' float scrub=soilDetailNoise(uneven/57.0+vec2(-13.4,4.1));',
 ' float gradient=clamp(length(vec2(dFdx(w.y),dFdy(w.y)))/max(length(dFdx(w.xz))+length(dFdy(w.xz)),.0001)*2.3,0.0,1.0);',
 ' float weights[5];',
 ' weights[0]=.35+.17*(1.0-sand)+.06*(1.0-gradient);',
 ' weights[1]=.21+.40*sand-.13*gradient;',
 ' weights[2]=.10+.29*gravel+.30*gradient;',
 ' weights[3]=.10+.33*smoothstep(.48,.83,salt)*(1.0-.68*gradient);',
 ' weights[4]=.10+.27*scrub*(1.0-.5*gradient);',
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
 'vec2 globalCoordsA=vec2(0.0),globalCoordsB=vec2(0.0);float globalDomainMix=0.0;',
 'if(globalSoilStrength>.001){',
 ' globalSoilPair(vSteppeWorld,globalSoilA,globalSoilB,globalSoilMix);',
 ' soilDetailDomains(vSteppeWorld.xz,globalCoordsA,globalCoordsB,globalDomainMix);',
 ' vec3 familyA=mix(texture2D(globalSoilAlbedo,soilDetailAtlasUV(globalSoilA,globalCoordsA)).rgb,',
 '  texture2D(globalSoilAlbedo,soilDetailAtlasUV(globalSoilA,globalCoordsB)).rgb,globalDomainMix);',
 ' vec3 familyB=mix(texture2D(globalSoilAlbedo,soilDetailAtlasUV(globalSoilB,globalCoordsA)).rgb,',
 '  texture2D(globalSoilAlbedo,soilDetailAtlasUV(globalSoilB,globalCoordsB)).rgb,globalDomainMix);',
 ' vec3 globalTone=mix(familyA,familyB,globalSoilMix);',
 ' diffuseColor.rgb=mix(diffuseColor.rgb,globalTone,globalSoilStrength*.35);',
 '}'
].join('\n');
const SHADE_NORMAL=[
 'if(globalSoilStrength>.001){',
 ' vec3 gnA=mix(texture2D(globalSoilNormal,soilDetailAtlasUV(globalSoilA,globalCoordsA)).rgb,',
 '  texture2D(globalSoilNormal,soilDetailAtlasUV(globalSoilA,globalCoordsB)).rgb,globalDomainMix);',
 ' vec3 gnB=mix(texture2D(globalSoilNormal,soilDetailAtlasUV(globalSoilB,globalCoordsA)).rgb,',
 '  texture2D(globalSoilNormal,soilDetailAtlasUV(globalSoilB,globalCoordsB)).rgb,globalDomainMix);',
 ' vec3 gn=mix(gnA,gnB,globalSoilMix)*2.0-1.0;',
 ' vec3 gx=normalize(vec3(1.00001,0.0,0.0)-normal*normal.x);',
 ' vec3 gz=normalize(cross(normal,gx));',
 ' normal=normalize(normal+(gx*gn.x+gz*gn.y)*globalSoilStrength*.20);',
 '}'
].join('\n');
const SHADE_ROUGHNESS=[
 'if(globalSoilStrength>.001){',
 ' float roughA=mix(texture2D(globalSoilRoughness,soilDetailAtlasUV(globalSoilA,globalCoordsA)).r,',
 '  texture2D(globalSoilRoughness,soilDetailAtlasUV(globalSoilA,globalCoordsB)).r,globalDomainMix);',
 ' float roughB=mix(texture2D(globalSoilRoughness,soilDetailAtlasUV(globalSoilB,globalCoordsA)).r,',
 '  texture2D(globalSoilRoughness,soilDetailAtlasUV(globalSoilB,globalCoordsB)).r,globalDomainMix);',
 ' float value=mix(roughA,roughB,globalSoilMix);',
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
 material.customProgramCacheKey=()=>key()+'|'+GLOBAL_SOIL_DETAIL_VERSION+'|'+SOIL_ANTI_TILING_VERSION;
 material.userData.globalSoilDetailInstalled=true;
 material.needsUpdate=true;return true;
}
