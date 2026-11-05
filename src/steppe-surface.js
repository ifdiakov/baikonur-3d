import * as THREE from 'three';
import {installGlobalSoilDetail,GLOBAL_SOIL_DETAIL_VERSION} from './global-steppe-detail.js?v=20261105-seamless-v3';
import {STEPPE_VERSION,sampleSteppeFields} from './steppe-field.js?v=20261101-steppe-v7';

export const STEPPE_BIOME_EXTENT=18000;
export const STEPPE_BIOME_RESOLUTION=1024;
// The generated field and the material program have separate revisions: an
// image treatment must not silently claim that the fallback soil field changed.
export const STEPPE_SURFACE_VERSION='baikonur-steppe-surface-v15-soft-soil-joins';
const installed=new WeakMap();

function satelliteSurrounding(options){
 if(options==null)return null;
 const color=(value,name)=>{
  if(!Array.isArray(value)||value.length!==3||!value.every(c=>Number.isFinite(c)&&c>=0&&c<=255))
   throw new Error(`Satellite surrounding ${name} requires three sRGB channels between 0 and 255`);
  return Object.freeze([...value]);
 };
 const middle=color(options.color,'color'),dark=color(options.darkColor??middle.map(c=>c*.86),'darkColor');
 const light=color(options.lightColor??middle.map(c=>Math.min(255,c*1.16)),'lightColor');
 const featherWorld=options.featherWorld??720,edgeIrregularity=options.edgeIrregularity??.3;
 if(!Number.isFinite(featherWorld)||featherWorld<=0)throw new Error('Satellite surrounding feather must be a positive world distance');
 if(!Number.isFinite(edgeIrregularity)||edgeIrregularity<0||edgeIrregularity>.6)
  throw new Error('Satellite surrounding edge irregularity must be between 0 and 0.6');
 return Object.freeze({color:middle,darkColor:dark,lightColor:light,featherWorld,edgeIrregularity});
}

const satelliteEdgeVariation=(x,z)=>.55*Math.sin(x/670+.65*Math.sin(z/490))+
 .30*Math.sin(z/410+.4*Math.sin(x/330))+.15*Math.sin((x+z)/250);

/** Row-major affine coefficients: u=a*x+b*z+c, v=d*x+e*z+f.
 * TextureLoader flips image rows, so the top of an image is v=1. Distances
 * to each transformed image edge are measured in world units, even when
 * the registration rotates, shears or stretches the image. */
export function createSatelliteProjection({worldToUv,featherWorld=160,surrounding=null}={}){
 if(!Array.isArray(worldToUv)||worldToUv.length!==6||!worldToUv.every(Number.isFinite))
  throw new Error('Satellite registration requires six finite world-to-UV coefficients');
 if(!Number.isFinite(featherWorld)||featherWorld<=0)
  throw new Error('Satellite edge feather must be a positive world distance');
 const outside=satelliteSurrounding(surrounding);if(outside)featherWorld=outside.featherWorld;
 const coefficients=Object.freeze([...worldToUv]),[a,b,c,d,e,f]=coefficients;
 const uGradient=Math.hypot(a,b),vGradient=Math.hypot(d,e),det=a*e-b*d;
 if(!uGradient||!vGradient||!Number.isFinite(det)||Math.abs(det)/(uGradient*vGradient)<1e-8)
  throw new Error('Satellite world-to-UV registration must be invertible');
 const worldAt=(u,v)=>[(e*(u-c)-b*(v-f))/det,(a*(v-f)-d*(u-c))/det];
 const worldCorners=Object.freeze([[0,1],[1,1],[1,0],[0,0]].map(uv=>Object.freeze(worldAt(...uv))));
 if(!worldCorners.flat().every(Number.isFinite))throw new Error('Satellite registration has non-finite world bounds');
 const bounds=Object.freeze({minX:Math.min(...worldCorners.map(p=>p[0])),maxX:Math.max(...worldCorners.map(p=>p[0])),
  minZ:Math.min(...worldCorners.map(p=>p[1])),maxZ:Math.max(...worldCorners.map(p=>p[1]))});
 const smooth=(value,width)=>{const t=Math.min(1,Math.max(0,value/width));return t*t*t*(t*(t*6-15)+10);};
 function sample(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('Satellite sampling requires finite world coordinates');
  const u=a*x+b*z+c,v=d*x+e*z+f;
  const width=featherWorld*(1+(outside?.edgeIrregularity??0)*satelliteEdgeVariation(x,z));
  const coverage=u<=0||u>=1||v<=0||v>=1?0:
   smooth(u/uGradient,width)*smooth((1-u)/uGradient,width)*smooth(v/vGradient,width)*smooth((1-v)/vGradient,width);
  return {uv:[u,v],coverage};
 }
 return Object.freeze({worldToUv:coefficients,featherWorld,uGradient,vGradient,worldCorners,bounds,surrounding:outside,sample});
}

/** Numerical image registration only: no geometry or source feature moves.
 * Row zero is v=0; values sit at texel centres. Sampling reproduces WebGL's
 * clamped LINEAR filter, including its half-texel convention at the edges. */
export function createSatelliteUvCorrection({width,height,data,maxOffset,provenance=null}={}){
 if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1||
    !(data instanceof Uint8Array)||data.length!==width*height*4)
  throw new Error('Satellite UV correction requires a complete RGBA8 grid');
 if(!Array.isArray(maxOffset)||maxOffset.length!==2||!maxOffset.every(value=>Number.isFinite(value)&&value>=0))
  throw new Error('Satellite UV correction requires two nonnegative UV offset limits');
 const pixels=new Uint8Array(data),range=Object.freeze([...maxOffset]);
 let minimum=255,maximum=0,total=0,reduced=0;
 for(let i=2;i<pixels.length;i+=4){const confidence=pixels[i];minimum=Math.min(minimum,confidence);maximum=Math.max(maximum,confidence);total+=confidence;if(confidence<255)reduced++;}
 const texture=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat);texture.name='Satellite UV correction and confidence';
 texture.colorSpace=THREE.NoColorSpace;texture.flipY=false;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
 texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 const clamp=(value,limit)=>Math.max(0,Math.min(limit,value));
 function sample(u,v){
  if(!Number.isFinite(u)||!Number.isFinite(v))throw new Error('Satellite correction sampling requires finite UV coordinates');
  const px=clamp(u,1)*width-.5,py=clamp(v,1)*height-.5,x=Math.floor(px),y=Math.floor(py),fx=px-x,fy=py-y,channels=[0,0,0];
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   const k=(clamp(y+dy,height-1)*width+clamp(x+dx,width-1))*4,weight=(dx?fx:1-fx)*(dy?fy:1-fy);
   for(let c=0;c<3;c++)channels[c]+=pixels[k+c]*weight;
  }
  return {offset:[(channels[0]-128)/127*range[0],(channels[1]-128)/127*range[1]],confidence:channels[2]/255};
 }
 return {texture,maxOffset:range,sample,stats:()=>({resolution:[width,height],bytes:pixels.byteLength,maxOffset:[...range],
  encoding:'RGBA8: RG offsets around 128; B confidence; row 0 at v=0',filter:'linear-clamped-no-mipmaps',
  confidence:{min:minimum/255,max:maximum/255,mean:total/(255*width*height),reducedPixels:reduced},provenance})};
}

/** A lower-resolution image continues the registered source. Its own affine
 * transform is derived from the generated image's actual retained centre.
 * Transfer the primary UV correction through the affine relation, rather
 * than shifting either image's world geometry or stretching the source. */
export function createSatelliteExtensionProjection(primary,{worldToUv,featherWorld=720}={}){
 if(!primary?.worldToUv||typeof primary.sample!=='function')throw new Error('Satellite extension requires a primary registration');
 const projection=createSatelliteProjection({worldToUv,featherWorld,
  surrounding:primary.surrounding?{...primary.surrounding,featherWorld}:null});
 const [a,b,c,d,e,f]=primary.worldToUv,[g,h,i,j,k,l]=projection.worldToUv,det=a*e-b*d;
 const p=(g*e-h*d)/det,q=(h*a-g*b)/det,r=(j*e-k*d)/det,s=(k*a-j*b)/det;
 const fromPrimaryUv=Object.freeze([p,q,i-p*c-q*f,r,s,l-r*c-s*f]);
 if(!fromPrimaryUv.every(Number.isFinite))throw new Error('Satellite extension has a non-finite affine relation');
 // The existing correction remains exact throughout the primary rectangle;
 // clamped edge values taper outside it instead of making a visible UV seam.
 const correctionFadeWorld=Math.min(primary.featherWorld,160);
 const smooth=value=>{const t=Math.min(1,Math.max(0,value));return t*t*t*(t*(t*6-15)+10);};
 function sample(x,z,primarySample=primary.sample(x,z)){
  const native=projection.sample(x,z),original=primarySample.affineUv??primarySample.uv;
  const distances=[original[0]/primary.uGradient,(1-original[0])/primary.uGradient,
   original[1]/primary.vGradient,(1-original[1])/primary.vGradient];
  const correctionInfluence=distances.reduce((weight,distance)=>weight*smooth(1+distance/correctionFadeWorld),1);
  const corrected=primarySample.uv,mapped=[p*corrected[0]+q*corrected[1]+fromPrimaryUv[2],r*corrected[0]+s*corrected[1]+fromPrimaryUv[5]];
  const confidence=1+((primarySample.confidence??1)-1)*correctionInfluence;
  const coverage=native.coverage*confidence;
  const contributionWeight=coverage*(1-(primarySample.affineCoverage??primarySample.coverage));
  return {uv:native.uv.map((value,index)=>value+(mapped[index]-value)*correctionInfluence),affineUv:native.uv,
   confidence,correctionInfluence,affineCoverage:native.coverage,coverage,contributionWeight,
   underlayCoverage:contributionWeight/Math.max(1-primarySample.coverage,.000001)};
 }
 return Object.freeze({projection,fromPrimaryUv,correctionFadeWorld,sample});
}

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
 // The photograph and the fallback soils use the SAME world-space grain.
 // Neither small sample repeats alone; broad, irregular warps and a rotated
 // second phase keep the 2-unit source texture from reading as square tiles.
 vec3 steppeUntiledMicro(vec2 p){
  vec2 rotated=mat2(.819152,.573576,-.573576,.819152)*p;
  vec2 broad=(texture2D(steppeMeso,p/173.0+vec2(.27,.61)).rg-.5)*8.5;
  vec2 broken=(texture2D(steppeMeso,rotated/23.0+vec2(.71,.13)).gb-.5)*2.3;
  vec2 a=(p+broad+broken)/2.37;
  vec2 b=(rotated+vec2(17.31,-9.47)+broad.yx*.72-broken.yx)/3.11;
  return mix(texture2D(steppeMicro,a).rgb,texture2D(steppeMicro,b).rgb,.51);
 }
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
  float mottles=(broad.r-.5)*.85+(broken.r-.5)*1.35;
  float darkGrains=smoothstep(.53,.70,broken.g)*.14*(1.0-salt*.75);
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
   tone*=mix(vec3(1.0),vec3(.62,.60,.48),cover*.70);
  }
  float closeDetail=1.0-smoothstep(.045,.25,pixelSize);
  if(closeDetail>.001){
   vec3 micro=steppeUntiledMicro(p);
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

export const STEPPE_SATELLITE_FRAGMENT=/* glsl */`
 uniform sampler2D steppeSatellite;
 uniform mat3 steppeSatelliteTransform;
 // x/y: UV change per world unit; z: feather distance; w: ignore old vertex RGB.
 uniform vec4 steppeSatelliteEdges;
 vec3 steppeSatelliteProjection(vec2 p){
  vec2 uv=(steppeSatelliteTransform*vec3(p,1.0)).xy;
  vec4 distanceToEdge=vec4(uv.x,1.0-uv.x,uv.y,1.0-uv.y)/steppeSatelliteEdges.xxyy;
  float edgeWidth=steppeSatelliteEdges.z;
  #ifdef STEPPE_SATELLITE_SURROUNDING
   edgeWidth*=steppeSatelliteEdgeScale(p);
  #endif
  vec4 fade=clamp(distanceToEdge/edgeWidth,0.0,1.0);
  fade=fade*fade*fade*(fade*(fade*6.0-15.0)+10.0);
  // Four smooth factors avoid a crease along the corner's diagonal.
  return vec3(uv,fade.x*fade.y*fade.z*fade.w);
 }
 vec3 steppeSatelliteMicroTone(vec2 p){
  float pixelSize=max(length(dFdx(p)),length(dFdy(p)));
  float closeDetail=1.0-smoothstep(.045,.25,pixelSize);
  // The photograph supplies all broad soil structure. A restrained neutral
  // grain only appears at close range; no new salt fields or painted plants.
  float grain=steppeUntiledMicro(p).r-.5;
  return vec3(1.0+grain*.12*closeDetail);
 }
`;

export const STEPPE_SATELLITE_SURROUNDING_FRAGMENT=/* glsl */`
 #define STEPPE_SATELLITE_SURROUNDING
 uniform vec3 steppeSatelliteSoilColor,steppeSatelliteSoilDark,steppeSatelliteSoilLight;
 uniform float steppeSatelliteEdgeIrregularity;
 float steppeSatelliteEdgeScale(vec2 p){
  float wave=.55*sin(p.x/670.0+.65*sin(p.y/490.0))+
   .30*sin(p.y/410.0+.4*sin(p.x/330.0))+.15*sin((p.x+p.y)/250.0);
  return 1.0+steppeSatelliteEdgeIrregularity*wave;
 }
 vec3 steppeSatelliteSurrounding(vec2 p){
  vec2 rotated=mat2(.8,-.6,.6,.8)*p;
  float broad=texture2D(steppeMeso,p/2100.0).r;
  float medium=texture2D(steppeMeso,rotated/670.0+vec2(.31,.67)).r;
  float fine=texture2D(steppeMeso,p/185.0+vec2(.13,.47)).r;
  float ground=clamp(.5+(broad-.5)*1.15+(medium-.5)*.6,0.0,1.0);
  vec3 soil=mix(steppeSatelliteSoilDark,steppeSatelliteSoilColor,smoothstep(.08,.52,ground));
  soil=mix(soil,steppeSatelliteSoilLight,smoothstep(.56,.88,ground)*.55);
  // The source-derived palette replaces the old large cream salt patches.
  // Modest irregular variations continue the photograph without new landmarks.
  return soil*(1.0+(fine-.5)*.08);
 }
`;

export const STEPPE_SATELLITE_CORRECTION_FRAGMENT=/* glsl */`
 uniform sampler2D steppeSatelliteCorrection;
 uniform vec2 steppeSatelliteOffsetRange;
 vec3 steppeSampleSatelliteCorrection(vec2 uv){
  vec3 correction=texture2D(steppeSatelliteCorrection,uv).rgb;
  vec2 offset=(correction.rg*255.0-vec2(128.0))/127.0*steppeSatelliteOffsetRange;
  return vec3(offset,correction.b);
 }
 vec3 steppeCorrectSatelliteUv(vec3 projected){
  vec3 correction=steppeSampleSatelliteCorrection(projected.xy);
  return vec3(projected.xy+correction.rg,projected.z*correction.b);
 }
`;

export const STEPPE_SATELLITE_EXTENSION_FRAGMENT=/* glsl */`
 uniform sampler2D steppeSatelliteExtension;
 uniform mat3 steppeSatelliteExtensionTransform,steppeSatelliteExtensionFromPrimary;
 uniform vec3 steppeSatelliteExtensionEdges;
 uniform float steppeSatelliteExtensionCorrectionFade;
 vec3 steppeSatelliteExtensionProjection(vec2 p,vec2 primaryUv,vec3 correction){
  vec2 nativeUv=(steppeSatelliteExtensionTransform*vec3(p,1.0)).xy;
  vec4 distanceToEdge=vec4(nativeUv.x,1.0-nativeUv.x,nativeUv.y,1.0-nativeUv.y)/steppeSatelliteExtensionEdges.xxyy;
  float width=steppeSatelliteExtensionEdges.z;
  #ifdef STEPPE_SATELLITE_SURROUNDING
   width*=steppeSatelliteEdgeScale(p);
  #endif
  vec4 fade=clamp(distanceToEdge/width,0.0,1.0);
  fade=fade*fade*fade*(fade*(fade*6.0-15.0)+10.0);
  float coverage=fade.x*fade.y*fade.z*fade.w;
  vec4 primaryDistance=vec4(primaryUv.x,1.0-primaryUv.x,primaryUv.y,1.0-primaryUv.y)/steppeSatelliteEdges.xxyy;
  vec4 support=clamp(1.0+primaryDistance/steppeSatelliteExtensionCorrectionFade,0.0,1.0);
  support=support*support*support*(support*(support*6.0-15.0)+10.0);
  float influence=support.x*support.y*support.z*support.w;
  vec2 correctedUv=(steppeSatelliteExtensionFromPrimary*vec3(primaryUv+correction.xy,1.0)).xy;
  // Invalid primary river branches reveal matched soil in both images. The
  // restriction releases smoothly outside the original source footprint.
  float confidence=mix(1.0,correction.z,influence);
  return vec3(mix(nativeUv,correctedUv,influence),coverage*confidence);
 }
`;

/** Install on soil only. Chaining preserves UKSS and every portal cutout. */
export function installSteppeSurface(material,{biomeTexture,microTexture,mesoTexture,satelliteTexture=null,satelliteProjection=null,satelliteCorrection=null,
 extensionTexture=null,satelliteExtension=null},options={}){
 if(!material?.isMeshBasicMaterial&&!material?.isMeshStandardMaterial)throw new Error('Shared steppe requires a basic or PBR soil material');
 if(!biomeTexture||!microTexture||!mesoTexture)throw new Error('Missing shared steppe textures');
 if(Boolean(satelliteTexture)!==Boolean(satelliteProjection))throw new Error('Satellite texture and registration must be supplied together');
 if(satelliteCorrection&&!satelliteTexture)throw new Error('Satellite UV correction requires a satellite surface');
 if(Boolean(extensionTexture)!==Boolean(satelliteExtension)||extensionTexture&&!satelliteTexture)
  throw new Error('Satellite extension requires its texture, registration and primary image');
 const surrounding=satelliteProjection?.surrounding??null;
 const existing=installed.get(material);
 const ignoreVertexColor=options.ignoreVertexColor??existing?.ignoreVertexColor??material.userData.steppeSurface?.ignoreVertexColor??false;
 if(typeof ignoreVertexColor!=='boolean')throw new Error('ignoreVertexColor must be a boolean');
 if(existing){
  if(existing.uniforms.steppeSatelliteEdges){
   existing.uniforms.steppeSatelliteEdges.value.w=ignoreVertexColor?1:0;
   existing.ignoreVertexColor=ignoreVertexColor;material.userData.steppeSurface.ignoreVertexColor=ignoreVertexColor;
  }
  return material;
 }
 const prior=material.onBeforeCompile,priorKey=material.customProgramCacheKey.bind(material);
 const uniforms={steppeBiomes:{value:biomeTexture},steppeMicro:{value:microTexture},steppeMeso:{value:mesoTexture}};
 if(satelliteTexture){
  const [a,b,c,d,e,f]=satelliteProjection.worldToUv;
  uniforms.steppeSatellite={value:satelliteTexture};
  uniforms.steppeSatelliteTransform={value:new THREE.Matrix3().set(a,b,c,d,e,f,0,0,1)};
  uniforms.steppeSatelliteEdges={value:new THREE.Vector4(satelliteProjection.uGradient,satelliteProjection.vGradient,
   satelliteProjection.featherWorld,ignoreVertexColor?1:0)};
  if(surrounding){
   const color=rgb=>new THREE.Color().setRGB(...rgb.map(c=>c/255),THREE.SRGBColorSpace);
   uniforms.steppeSatelliteSoilColor={value:color(surrounding.color)};
   uniforms.steppeSatelliteSoilDark={value:color(surrounding.darkColor)};
   uniforms.steppeSatelliteSoilLight={value:color(surrounding.lightColor)};
   uniforms.steppeSatelliteEdgeIrregularity={value:surrounding.edgeIrregularity};
  }
  if(satelliteCorrection){
   uniforms.steppeSatelliteCorrection={value:satelliteCorrection.texture};
   uniforms.steppeSatelliteOffsetRange={value:new THREE.Vector2(...satelliteCorrection.maxOffset)};
  }
  if(satelliteExtension){
   const projection=satelliteExtension.projection,[g,h,i,j,k,l]=projection.worldToUv,[p,q,r,s,t,u]=satelliteExtension.fromPrimaryUv;
   uniforms.steppeSatelliteExtension={value:extensionTexture};
   uniforms.steppeSatelliteExtensionTransform={value:new THREE.Matrix3().set(g,h,i,j,k,l,0,0,1)};
   uniforms.steppeSatelliteExtensionFromPrimary={value:new THREE.Matrix3().set(p,q,r,s,t,u,0,0,1)};
   uniforms.steppeSatelliteExtensionEdges={value:new THREE.Vector3(projection.uGradient,projection.vGradient,projection.featherWorld)};
   uniforms.steppeSatelliteExtensionCorrectionFade={value:satelliteExtension.correctionFadeWorld};
  }
 }
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
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+STEPPE_FRAGMENT+
   (surrounding?STEPPE_SATELLITE_SURROUNDING_FRAGMENT:'')+(satelliteTexture?STEPPE_SATELLITE_FRAGMENT:'')+
   (satelliteCorrection?STEPPE_SATELLITE_CORRECTION_FRAGMENT:'')+(satelliteExtension?STEPPE_SATELLITE_EXTENSION_FRAGMENT:''));
  if(satelliteTexture){
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
    vec3 steppePhoto=steppeSatelliteProjection(vSteppeWorld.xz);
    ${satelliteExtension?'vec3 steppeAffinePhoto=steppePhoto;':''}
    ${satelliteCorrection?(satelliteExtension?`vec3 steppeImageCorrection=steppeSampleSatelliteCorrection(steppePhoto.xy);
    steppePhoto=vec3(steppePhoto.xy+steppeImageCorrection.xy,steppePhoto.z*steppeImageCorrection.z);`:
    'steppePhoto=steppeCorrectSatelliteUv(steppePhoto);'):(satelliteExtension?'vec3 steppeImageCorrection=vec3(0.0,0.0,1.0);':'')}
    // Evaluate implicit texture derivatives outside coverage-dependent flow.
    // Clamp wrapping is safe outside the image; zero coverage adds no color.
    vec3 steppePhotoBase=diffuse*texture2D(steppeSatellite,steppePhoto.xy).rgb;
    ${satelliteExtension?`vec3 steppeExtendedPhoto=steppeSatelliteExtensionProjection(vSteppeWorld.xz,steppeAffinePhoto.xy,steppeImageCorrection);
    vec3 steppeExtensionBase=diffuse*texture2D(steppeSatelliteExtension,steppeExtendedPhoto.xy).rgb;
    // Both images share the same confidence, not two cumulative chances to
    // paint an unregistered river. The extension occupies the primary feather.
    float steppeExtensionContribution=steppeExtendedPhoto.z*(1.0-steppeAffinePhoto.z);
    float steppeExtensionBlend=steppeExtensionContribution/max(1.0-steppePhoto.z,.000001);`:''}
    ${surrounding?'diffuseColor.rgb=diffuse*steppeSatelliteSurrounding(vSteppeWorld.xz);':''}
    ${satelliteExtension?'diffuseColor.rgb=mix(diffuseColor.rgb,steppeExtensionBase,steppeExtensionBlend);':''}
    diffuseColor.rgb=mix(diffuseColor.rgb,steppePhotoBase,steppePhoto.z);
    ${satelliteExtension?`float steppeImageCoverage=steppePhoto.z+steppeExtensionContribution;
    vec3 steppeImageContribution=steppePhotoBase*steppePhoto.z+steppeExtensionBase*steppeExtensionContribution;`:''}
    ${surrounding?'vec3 steppeSurfaceBase=diffuseColor.rgb;':''}
    #include <color_fragment>
    #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
     // Replace the old island RGB only where the new soil color contributes.
     // This is an exact blend at the feather, without division or alpha edits.
     diffuseColor.rgb+=${surrounding?'steppeSurfaceBase':satelliteExtension?'steppeImageContribution':'steppePhotoBase*steppePhoto.z'}*(vec3(1.0)-vColor.rgb)*steppeSatelliteEdges.w;
    #endif
    // Both helpers evaluate derivatives in uniform control flow. Coverage
    // removes the broad fallback pattern from the image, not its evaluation.
    vec3 steppeTone=${surrounding?'steppeSatelliteMicroTone(vSteppeWorld.xz)':`mix(steppeSurfaceTone(vSteppeWorld.xz),steppeSatelliteMicroTone(vSteppeWorld.xz),${satelliteExtension?'steppeImageCoverage':'steppePhoto.z'})`};
    diffuseColor.rgb*=steppeTone;
   `);
  }else{
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    diffuseColor.rgb*=steppeSurfaceTone(vSteppeWorld.xz);
   `);
  }
 };
 material.customProgramCacheKey=()=>priorKey()+'|'+STEPPE_VERSION+'|'+STEPPE_SURFACE_VERSION+
  (satelliteTexture?'|satellite':'|procedural')+(surrounding?'|surrounding':'')+(satelliteCorrection?'|uv-correction':'')+(satelliteExtension?'|extension':'');
 // WeakMap tracks the actual installed callback. Three.clone copies userData
 // but drops shader callbacks; a hill clone therefore still gets its hook.
 installed.set(material,{uniforms,ignoreVertexColor});
 material.userData.steppeSurface={version:STEPPE_VERSION,surfaceVersion:STEPPE_SURFACE_VERSION,projection:'world-xz',
  detailMaps:2,mipmapped:true,derivativeFade:true,displacement:false,satellite:Boolean(satelliteTexture),
  ignoreVertexColor:Boolean(satelliteTexture)&&ignoreVertexColor,surrounding:Boolean(surrounding),uvCorrection:Boolean(satelliteCorrection),extension:Boolean(satelliteExtension)};
 material.needsUpdate=true;return material;
}

export async function createSteppeSurface({renderer,satellite=null}={}){
 const satelliteProjection=satellite?createSatelliteProjection(satellite):null;
 if(satellite&&!(typeof satellite.url==='string'&&satellite.url.trim()))throw new Error('Satellite surface requires an image URL');
 const satelliteCorrection=satellite?.uvCorrection?createSatelliteUvCorrection(satellite.uvCorrection):null;
 const extensionConfig=satellite?.extension??null;
 if(extensionConfig&&!(typeof extensionConfig.url==='string'&&extensionConfig.url.trim()))throw new Error('Satellite extension requires an image URL');
 const satelliteExtension=extensionConfig?createSatelliteExtensionProjection(satelliteProjection,extensionConfig):null;
 const loader=new THREE.TextureLoader(),materials=new Set();
 let detailedAtlases=null;const detailedStrength={value:0};
 const loadTexture=url=>{
  let expired=false,timer;
  const pending=loader.loadAsync(url);
  pending.then(texture=>{if(expired)texture.dispose();},()=>{});
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
   expired=true;const error=new Error('Terrain texture request timed out');error.name='TimeoutError';reject(error);
  },20000);});
  return Promise.race([pending,deadline]).finally(()=>clearTimeout(timer));
 };
 const detailUrls=['steppe-micro-v1.png','steppe-meso-v1.png'].map(file=>new URL('../assets/terrain/'+file,import.meta.url).href);
 const progressive=Boolean(satellite?.previewUrl);
 const neutralTexture=name=>{
  const texture=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1,THREE.RGBAFormat);
  texture.name=name;texture.needsUpdate=true;return texture;
 };
 const configureDetail=texture=>{
  texture.colorSpace=THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=Math.min(renderer?.capabilities?.getMaxAnisotropy?.()||4,8);
  texture.needsUpdate=true;return texture;
 };
 const configurePhoto=(texture,name)=>{
  if(!texture)return null;
  texture.name=name;texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.flipY=true;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=Math.min(renderer?.capabilities?.getMaxAnisotropy?.()||4,8);
  texture.needsUpdate=true;return texture;
 };
 // These previews use the original complete image and exactly the same UV
 // registration. The first view therefore has the final terrain layout.
 const [microTexture,mesoTexture,satelliteTexture,extensionTexture]=await Promise.all([
  progressive?neutralTexture('Steppe micro detail pending'):loadTexture(detailUrls[0]),
  progressive?neutralTexture('Steppe meso detail pending'):loadTexture(detailUrls[1]),
  satellite?loadTexture(satellite.previewUrl||satellite.url):null,
  extensionConfig?loadTexture(extensionConfig.previewUrl||extensionConfig.url):null
 ]);
 configureDetail(microTexture);configureDetail(mesoTexture);
 configurePhoto(satelliteTexture,'Shared satellite-style earth');
 configurePhoto(extensionTexture,'Shared satellite-style earth extension');
 // Satellite surroundings replace the procedural biome color everywhere.
 // Its million-pixel field is not sampled by that shader path.
 const biomeFieldGenerated=!satelliteProjection?.surrounding;
 const textures={biomeTexture:biomeFieldGenerated?createSteppeBiomeTexture():neutralTexture('Unused satellite biome field'),
  microTexture,mesoTexture,satelliteTexture,satelliteProjection,satelliteCorrection,extensionTexture,satelliteExtension};
 const loading={progressive,detail:progressive?'queued':'ready',satellite:progressive?'preview':satellite?'ready':'none',
  extension:extensionConfig?.previewUrl?'preview':extensionConfig?'ready':'none',errors:[]};
 const replaceTexture=(key,uniformName,texture)=>{
  const previous=textures[key];textures[key]=texture;
  for(const material of materials){const uniform=installed.get(material)?.uniforms[uniformName];if(uniform)uniform.value=texture;}
  previous?.dispose();
 };
 const defer=(job,options)=>globalThis.__MUSEUM_STARTUP?.defer?globalThis.__MUSEUM_STARTUP.defer(job,options):job();
 const jobs=[];
 if(progressive){
  jobs.push(defer(async()=>{
   loading.detail='loading';
   const results=await Promise.allSettled(detailUrls.map(loadTexture));
   results.forEach((result,index)=>{
    if(result.status==='fulfilled')replaceTexture(index?'mesoTexture':'microTexture',index?'steppeMeso':'steppeMicro',configureDetail(result.value));
    else loading.errors.push({resource:index?'meso':'micro',message:String(result.reason?.message||result.reason)});
   });
   loading.detail=results.every(result=>result.status==='fulfilled')?'ready':'partial';
  },{key:'terrain-detail',priority:10}));
  jobs.push(defer(async()=>{
   const upgrades=[['satelliteTexture','steppeSatellite',satellite,'satellite','Shared satellite-style earth'],
    ['extensionTexture','steppeSatelliteExtension',extensionConfig,'extension','Shared satellite-style earth extension']];
   // Full images are an enhancement. A failure leaves the registered preview
   // in place and cannot turn an already usable museum into an error screen.
   for(const [key,uniform,config,stateKey,name]of upgrades){
    if(!config?.previewUrl)continue;
    loading[stateKey]='loading';
    try{replaceTexture(key,uniform,configurePhoto(await loadTexture(config.url),name));loading[stateKey]='ready';}
    catch(error){loading[stateKey]='preview';loading.errors.push({resource:stateKey,message:String(error.message||error)});}
   }
  },{key:'terrain-hd',priority:8}));
 }
 const ready=Promise.allSettled(jobs);
 const primaryAt=(x,z)=>{
  const affine=satelliteProjection?.sample(x,z);if(!affine||!satelliteCorrection)return affine??null;
  const correction=satelliteCorrection.sample(...affine.uv);
  return {uv:affine.uv.map((value,i)=>value+correction.offset[i]),affineUv:affine.uv,offset:correction.offset,
   confidence:correction.confidence,affineCoverage:affine.coverage,coverage:affine.coverage*correction.confidence};
 };
 const satelliteAt=(x,z)=>{
  const primary=primaryAt(x,z);
  return primary&&satelliteExtension?{...primary,extension:satelliteExtension.sample(x,z,primary)}:primary;
 };
 return {apply(material,options){installSteppeSurface(material,textures,options);materials.add(material);
   // The local terrain samples its own five-family PBR atlas. Avoid applying
   // the global atlas a second time over the same surface.
   if(detailedAtlases&&!material.userData.skipGlobalSoilDetail)
    installGlobalSoilDetail(material,detailedAtlases,detailedStrength);
   return material;},
  enableDetailedMaterials(atlases){
   if(detailedAtlases)return false;
   if(!atlases?.albedo||!atlases?.normal||!atlases?.roughness)throw new Error('Detailed soil atlases not available');
   detailedAtlases=atlases;
   for(const material of materials)if(!material.userData.skipGlobalSoilDetail)
    installGlobalSoilDetail(material,atlases,detailedStrength);
   return true;
  },
  updateDetail(height){
   if(!detailedAtlases||!Number.isFinite(height)){detailedStrength.value=0;return 0;}
   const fraction=Math.min(1,Math.max(0,(280-height)/185));
   detailedStrength.value=fraction*fraction*(3-2*fraction);
   return detailedStrength.value;
  },
  satelliteAt,ready,requestDetail(){
   globalThis.__MUSEUM_STARTUP?.promote?.('terrain-detail',100);
   globalThis.__MUSEUM_STARTUP?.promote?.('terrain-hd',100);return ready;
  },
  stats:()=>({version:STEPPE_VERSION,surfaceVersion:STEPPE_SURFACE_VERSION,projection:'world-xz',materials:materials.size,detailMaps:2,
   globalDetailedVersion:detailedAtlases?GLOBAL_SOIL_DETAIL_VERSION:null,
   detailedMaterials:detailedAtlases?.materials??null,
   detailedAtlasSize:detailedAtlases?[detailedAtlases.width,detailedAtlases.height]:null,
   detailedStrength:detailedStrength.value,
   textureSize:textures.microTexture.image?.width??1,biomeResolution:biomeFieldGenerated?STEPPE_BIOME_RESOLUTION:1,biomeExtent:STEPPE_BIOME_EXTENT,
   biomeFieldGenerated,loading:{...loading,errors:loading.errors.map(error=>({...error}))},
   mipmapped:true,derivativeFade:true,extraGeometry:0,types:['dry-steppe','sand','salt-crust','sparse-scrub'],
   satellite:satelliteTexture?{url:satellite.url,source:satellite.source??'configured image',treatment:satellite.treatment??'shared satellite-style color',
    projection:satelliteCorrection?'world-xz-affine-with-uv-correction':'world-xz-affine',worldToUv:[...satelliteProjection.worldToUv],featherWorld:satelliteProjection.featherWorld,
    worldCorners:satelliteProjection.worldCorners.map(p=>[...p]),bounds:{...satelliteProjection.bounds},
    resolution:[textures.satelliteTexture.image?.naturalWidth??textures.satelliteTexture.image?.width??0,textures.satelliteTexture.image?.naturalHeight??textures.satelliteTexture.image?.height??0],
    previewUrl:satellite.previewUrl??null,
    colorSpace:THREE.SRGBColorSpace,sharedTexture:true,repeat:false,alphaSource:'existing terrain',microContrast:.12,
    surrounding:satelliteProjection.surrounding?{...satelliteProjection.surrounding,color:[...satelliteProjection.surrounding.color],
     darkColor:[...satelliteProjection.surrounding.darkColor],lightColor:[...satelliteProjection.surrounding.lightColor],
     texture:'restrained shared earth variation; no invented source features'}:null,
    uvCorrection:satelliteCorrection?.stats()??null,
    extension:extensionTexture?{url:extensionConfig.url,source:extensionConfig.source??'configured extension image',
     treatment:extensionConfig.treatment??'registered image extension',worldToUv:[...satelliteExtension.projection.worldToUv],
     fromPrimaryUv:[...satelliteExtension.fromPrimaryUv],featherWorld:satelliteExtension.projection.featherWorld,
     worldCorners:satelliteExtension.projection.worldCorners.map(p=>[...p]),bounds:{...satelliteExtension.projection.bounds},
     resolution:[textures.extensionTexture.image?.naturalWidth??textures.extensionTexture.image?.width??0,textures.extensionTexture.image?.naturalHeight??textures.extensionTexture.image?.height??0],
     previewUrl:extensionConfig.previewUrl??null,
     sharedTexture:true,repeat:false,colorSpace:THREE.SRGBColorSpace,primaryCorePreserved:true,
     correctionFadeWorld:satelliteExtension.correctionFadeWorld,
     confidencePolicy:'primary confidence inside its footprint; smooth release outside; low confidence reveals surrounding earth'}:null}:null})};
}
