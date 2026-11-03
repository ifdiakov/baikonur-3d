import * as THREE from 'three';
export const SOYUZ_LAUNCH_GREEN=0x234b36;
export const SOYUZ_PAINT_VERSION='20261103-dark-green-v1';

// The source mesh combines concrete, safety markings and machinery in one
// palette texture. Repaint only its green swatches, keeping texture and light.
export function applySoyuzLaunchPaint(root){
 const visited=new Set();
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   if(visited.has(material)||material.name!=='PaletteMaterial001'||material.userData.soyuzPaint)continue;visited.add(material);
   const prior=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);
   material.onBeforeCompile=function(shader,renderer){
    prior.call(this,shader,renderer);shader.uniforms.soyuzLaunchGreen={value:new THREE.Color(SOYUZ_LAUNCH_GREEN)};
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 soyuzLaunchGreen;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
float paintOther=max(diffuseColor.r,diffuseColor.b);
float paintMask=smoothstep(0.025,0.09,diffuseColor.g-paintOther*1.35);
vec3 paintedGreen=soyuzLaunchGreen*(0.65+0.35*clamp(diffuseColor.g,0.0,1.0));
diffuseColor.rgb=mix(diffuseColor.rgb,paintedGreen,paintMask);`);
   };
   material.customProgramCacheKey=()=>cache()+'|'+SOYUZ_PAINT_VERSION;
   material.userData.soyuzPaint={version:SOYUZ_PAINT_VERSION,color:'#234b36',scope:'green palette swatches'};
   material.needsUpdate=true;
  }
 });
 root.userData.soyuzLaunchPaint={version:SOYUZ_PAINT_VERSION,color:'#234b36'};return root;
}
