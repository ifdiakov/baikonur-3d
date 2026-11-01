import * as THREE from 'three';
import {STEPPE_VERSION,sampleSteppeFields} from './steppe-field.js?v=20261101-steppe-v6';

export const STEPPE_BIOME_EXTENT=18000;
export const STEPPE_BIOME_RESOLUTION=1024;
const installed=new WeakMap();

export function createSteppeBiomeTexture(){
 const size=STEPPE_BIOME_RESOLUTION,data=new Uint8Array(size*size*4);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const p=sampleSteppeFields(((x+.5)/size-.5)*STEPPE_BIOME_EXTENT,((z+.5)/size-.5)*STEPPE_BIOME_EXTENT),i=(z*size+x)*4;
  data[i]=Math.round(p.salt*255);data[i+1]=Math.round(p.sand*255);data[i+2]=Math.round(p.scrub*255);data[i+3]=255;
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
 texture.name=STEPPE_VERSION+' / soil types';texture.colorSpace=THREE.NoColorSpace;
 texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
 texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

// Kept as one shared body so material QA can compile exactly what is shipped.
export const STEPPE_FRAGMENT=/* glsl */`
 uniform sampler2D steppeBiomes,steppeMicro,steppeMeso;
 varying vec3 vSteppeWorld;
 vec3 steppeSurfaceTone(vec2 p){
  float pixelSize=max(length(dFdx(p)),length(dFdy(p)));
  // Mipmaps average subpixel grains; derivative fades remove their residual
  // contrast before a moving camera can turn them into moire or sparkles.
  float landscapeDetail=1.0-smoothstep(18.0,70.0,pixelSize);
  float mediumDetail=1.0-smoothstep(.6,5.0,pixelSize);
  if(landscapeDetail<.001)return vec3(1.0);
  vec3 biome=texture2D(steppeBiomes,p/${STEPPE_BIOME_EXTENT.toFixed(1)}+vec2(.5)).rgb;
  float salt=biome.r,sand=biome.g,scrub=biome.b;
  vec2 rotated=mat2(.8,-.6,.6,.8)*p;
  // Dense soil mosaics remain visible from the overview. Two unrelated
  // periods suppress a recognisable tiled repeat, with no directional dunes.
  vec3 broad=texture2D(steppeMeso,p/213.0).rgb;
  vec3 broken=texture2D(steppeMeso,rotated/79.0+vec2(.317,.691)).rgb;
  float mottles=(broad.r-.5)*1.10+(broken.r-.5)*1.80;
  float darkGrains=smoothstep(.53,.70,broken.g)*.28*(1.0-salt*.75);
  vec3 tone=vec3(1.0)+(mottles-darkGrains)*landscapeDetail;
  if(mediumDetail>.001){
   vec3 a=texture2D(steppeMeso,p/41.0).rgb;
   float soilVariation=(a.r-.5)*.40;
   float gravel=(a.g-.5)*.24*(1.0-salt*.85)*(1.0-sand*.6);
   tone+=vec3((soilVariation+gravel)*mediumDetail);
  }
  // Sparse low plants are a ground texture: no giant billboards or extra
  // geometry across launch pads, roads and airfield pavements.
  float plantDetail=1.0-smoothstep(.12,.9,pixelSize);
  if(plantDetail>.001){
   float plants=texture2D(steppeMeso,rotated/10.0+vec2(.17,.31)).b;
   float cover=plants*scrub*(1.0-salt)*(1.0-sand*.8)*plantDetail;
   tone*=mix(vec3(1.0),vec3(.52,.59,.46),cover*.85);
  }
  float closeDetail=1.0-smoothstep(.045,.25,pixelSize);
  if(closeDetail>.001){
   vec3 micro=texture2D(steppeMicro,p/2.0).rgb;
   float soil=(micro.r-.5)*.48;
   float aeolian=(micro.g-.5)*.27;
   // Salt crust appears only in the salt-pan field, with narrow dark seams
   // and pale plates. The rest of the steppe keeps its own granular surface.
   float crust=(micro.b-.85)*.40;
   float detail=mix(mix(soil,aeolian,sand),crust,salt);
   tone*=1.0+detail*closeDetail;
  }
  return clamp(tone,vec3(.45),vec3(1.34));
 }
`;

/** Install on soil only. Chaining preserves UKSS and every portal cutout. */
export function installSteppeSurface(material,{biomeTexture,microTexture,mesoTexture}){
 if(!material?.isMeshBasicMaterial)throw new Error('Shared steppe requires the museum unlit ground material');
 if(!biomeTexture||!microTexture||!mesoTexture)throw new Error('Missing shared steppe textures');
 if(installed.has(material))return material;
 const prior=material.onBeforeCompile,priorKey=material.customProgramCacheKey.bind(material);
 const uniforms={steppeBiomes:{value:biomeTexture},steppeMicro:{value:microTexture},steppeMeso:{value:mesoTexture}};
 material.extensions={...material.extensions,derivatives:true};
 material.onBeforeCompile=function(shader,renderer){
  prior.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nvarying vec3 vSteppeWorld;`)
   .replace('#include <project_vertex>',`#include <project_vertex>
    vec4 steppePoint=vec4(transformed,1.0);
    #ifdef USE_INSTANCING
      steppePoint=instanceMatrix*steppePoint;
    #endif
    vSteppeWorld=(modelMatrix*steppePoint).xyz;
   `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+STEPPE_FRAGMENT)
   .replace('#include <color_fragment>',`#include <color_fragment>
    diffuseColor.rgb*=steppeSurfaceTone(vSteppeWorld.xz);
   `);
 };
 material.customProgramCacheKey=()=>priorKey()+'|'+STEPPE_VERSION;
 // WeakMap tracks the actual installed callback. Three.clone copies userData
 // but drops shader callbacks; a hill clone therefore still gets its hook.
 installed.set(material,uniforms);
 material.userData.steppeSurface={version:STEPPE_VERSION,projection:'world-xz',detailMaps:2,mipmapped:true,derivativeFade:true,displacement:false};
 material.needsUpdate=true;return material;
}

export async function createSteppeSurface({renderer}={}){
 const loader=new THREE.TextureLoader();
 const [microTexture,mesoTexture]=await Promise.all(['steppe-micro-v1.png','steppe-meso-v1.png'].map(file=>loader.loadAsync(new URL('../assets/terrain/'+file,import.meta.url).href)));
 for(const texture of [microTexture,mesoTexture]){
  texture.colorSpace=THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=Math.min(renderer?.capabilities?.getMaxAnisotropy?.()||4,8);
  texture.needsUpdate=true;
 }
 const textures={biomeTexture:createSteppeBiomeTexture(),microTexture,mesoTexture},materials=new Set();
 return {apply(material){installSteppeSurface(material,textures);materials.add(material);return material;},
  stats:()=>({version:STEPPE_VERSION,projection:'world-xz',materials:materials.size,detailMaps:2,
   textureSize:512,biomeResolution:STEPPE_BIOME_RESOLUTION,biomeExtent:STEPPE_BIOME_EXTENT,
   mipmapped:true,derivativeFade:true,extraGeometry:0,types:['dry-steppe','sand','salt-crust','sparse-scrub']})};
}
