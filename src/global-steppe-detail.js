import {SOIL_ANTI_TILING_GLSL,SOIL_ANTI_TILING_VERSION} from './soil-anti-tiling.js?v=20261105-seamless-v2';

// GPU-only, georeferenced material blending shared by every soil mesh.
// This module contains no external images; the atlas is built after first paint.
export const GLOBAL_SOIL_DETAIL_VERSION='world-builder-five-material-global-v3-continuous-blend';
const installed=new WeakSet();
const COMMON=[
 SOIL_ANTI_TILING_GLSL,
 'uniform sampler2D globalSoilAlbedo,globalSoilNormal,globalSoilRoughness;',
 'uniform float globalSoilStrength;',
 'void globalSoilPair(vec3 w,out float a,out float b,out float fraction){',
 ' vec2 p=w.xz;',
 ' vec2 broadWarp=vec2(soilDetailNoise(p/173.0+vec2(8.2,-1.7)),',
 '                     soilDetailNoise(p/157.0+vec2(-4.6,7.1)))-.5;',
 ' vec2 bent=p+broadWarp*58.0;',
 ' float broad=soilDetailNoise(bent/211.0+vec2(2.3,9.1))-.5;',
 ' float breakup=soilDetailNoise(bent/81.0+vec2(-9.6,3.4))-.5;',
 ' float grit=soilDetailNoise(bent/27.0+vec2(5.8,-4.3))-.5;',
 ' float gradient=clamp(length(vec2(dFdx(w.y),dFdy(w.y)))/max(length(dFdx(w.xz))+length(dFdy(w.xz)),.0001)*2.3,0.0,1.0);',
 ' float family=clamp(2.0+7.2*(broad*.53+breakup*.31+grit*.16),0.0,4.0);',
 ' family=mix(family,2.0,gradient*.42);',
 ' soilDetailNeighbours(family,a,b,fraction);',
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
 ' vec3 globalVariation=soilDetailMacro(vSteppeWorld);',
 ' diffuseColor.rgb*=mix(vec3(1.0),globalVariation,globalSoilStrength*.96);',
 ' diffuseColor.rgb=mix(diffuseColor.rgb,globalTone,globalSoilStrength*.34);',
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
 // Three.js copies userData to clones but not the onBeforeCompile hook.
 // Track the actual material instance, not a copied flag.
 if(installed.has(material))return false;
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
 installed.add(material);
 material.userData.globalSoilDetailInstalled=true;
 material.needsUpdate=true;return true;
}
