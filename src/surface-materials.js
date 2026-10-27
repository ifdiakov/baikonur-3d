import * as THREE from 'three';

// Photo-guided surface study: weathered painted steel (IMG_1004 / IMG_7999)
// and pale, stained concrete (IMG_1002 / IMG_2906). These are synthesized
// seamless material maps, not photographs or a measured condition survey.
// RGBA packs tone, corrosion/dirt, height and roughness in one GPU texture.
const SIZE=512, textures=new Map();
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
function hash(x,y,seed){
  let h=Math.imul(x+seed,374761393)^Math.imul(y+seed,668265263);
  h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
}
function field(nx,ny,seed){
  const data=new Float32Array(SIZE*SIZE);
  for(let y=0;y<SIZE;y++){
    const fy=y/SIZE*ny,iy=Math.floor(fy),ty=smooth(0,1,fy-iy);
    for(let x=0;x<SIZE;x++){
      const fx=x/SIZE*nx,ix=Math.floor(fx),tx=smooth(0,1,fx-ix);
      const a=hash(ix,iy,seed),b=hash((ix+1)%nx,iy,seed);
      const c=hash(ix,(iy+1)%ny,seed),d=hash((ix+1)%nx,(iy+1)%ny,seed);
      data[y*SIZE+x]=(a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
    }
  }
  return data;
}
function surfaceMap(family){
  if(textures.has(family))return textures.get(family);
  const seed=family==='concrete'?31:83;
  const cloud=field(8,8,seed),patch=field(24,24,seed+1),grain=field(128,128,seed+2);
  const pores=field(256,256,seed+3),streak=field(80,4,seed+4);
  const data=new Uint8Array(SIZE*SIZE*4);
  for(let i=0;i<SIZE*SIZE;i++){
    let tone,wear,height,roughness;
    if(family==='concrete'){
      const pits=smooth(.73,.91,pores[i]);
      wear=smooth(.55,.84,cloud[i]*.6+streak[i]*.4)*.6;
      tone=.90+(cloud[i]-.5)*.24+(patch[i]-.5)*.14+(grain[i]-.5)*.12-pits*.14;
      height=.45+grain[i]*.28+patch[i]*.12-pits*.25;
      roughness=.89+grain[i]*.10;
    }else{
      wear=smooth(.58,.76,patch[i]*.62+cloud[i]*.22+streak[i]*.16);
      tone=.94+(cloud[i]-.5)*.10+(grain[i]-.5)*.055-smooth(.58,.85,streak[i])*.13;
      height=.52+(grain[i]-.5)*.10-wear*.28+(pores[i]-.5)*wear*.18;
      roughness=.64+streak[i]*.16+wear*.18;
    }
    data[i*4]=Math.round(clamp(tone)*255);data[i*4+1]=Math.round(clamp(wear)*255);
    data[i*4+2]=Math.round(clamp(height)*255);data[i*4+3]=Math.round(clamp(roughness)*255);
  }
  const texture=new THREE.DataTexture(data,SIZE,SIZE,THREE.RGBAFormat);
  texture.name='museum-'+family+'-surface-v1';texture.colorSpace=THREE.NoColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=8;texture.needsUpdate=true;
  textures.set(family,texture);return texture;
}

const profiles={
  concrete:{family:'concrete',period:24,relief:.13,roughness:.97,metalness:0,wear:.40,tint:0x686052},
  paint:{family:'metal',period:13,relief:.035,roughness:.86,metalness:.12,wear:.65,tint:0x80503a},
  sheet:{family:'metal',period:18,relief:.04,roughness:.82,metalness:.24,wear:1,tint:0x815038},
  metal:{family:'metal',period:10,relief:.025,roughness:.73,metalness:.58,wear:.55,tint:0x71503b},
  rust:{family:'metal',period:10,relief:.065,roughness:.98,metalness:.10,wear:.6,tint:0x503b2d}
};

// Model-space triplanar mapping keeps a consistent grain size on long beams,
// instanced boxes, curved decks and unwrapped trench faces. No per-face UVs,
// extra decals or coplanar surfaces are needed.
export function createSurfacePalette(root,colors,assignments,fallback={}){
  const localFromWorld={value:new THREE.Matrix4()},worldScale={value:1};
  const previous=new THREE.Matrix4().makeScale(0,0,0);
  const materials={};let texturedCount=0;
  function updateTransform(){
    if(previous.equals(root.matrixWorld))return;
    previous.copy(root.matrixWorld);localFromWorld.value.copy(root.matrixWorld).invert();
    worldScale.value=new THREE.Vector3().setFromMatrixColumn(root.matrixWorld,0).length();
  }
  for(const [name,color] of Object.entries(colors)){
    const kind=assignments[name],profile=profiles[kind];
    const material=new THREE.MeshStandardMaterial({color,roughness:profile?.roughness??.85,
      metalness:profile?.metalness??.02,side:THREE.DoubleSide,...fallback[name]});
    material.name='museum / '+name;
    materials[name]=material;
    if(!profile)continue;
    texturedCount++;
    material.userData.surface={version:'1.0',kind,projection:'model-triplanar',size:SIZE};
    material.extensions={...material.extensions,derivatives:true};
    material.onBeforeRender=updateTransform;
    material.onBeforeCompile=shader=>{
      updateTransform();
      Object.assign(shader.uniforms,{
        museumSurface:{value:surfaceMap(profile.family)},museumLocalFromWorld:localFromWorld,
        museumWorldScale:worldScale,museumPeriod:{value:profile.period},
        museumRelief:{value:profile.relief},museumWear:{value:profile.wear},
        museumStain:{value:new THREE.Color(profile.tint)}
      });
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
        uniform mat4 museumLocalFromWorld;
        varying vec3 vMuseumPosition;
        varying vec3 vMuseumNormal;`).replace('#include <defaultnormal_vertex>',`#include <defaultnormal_vertex>
        vMuseumNormal=mat3(museumLocalFromWorld)*inverseTransformDirection(transformedNormal,viewMatrix);
      `).replace('#include <project_vertex>',`#include <project_vertex>
        vec4 museumPosition=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          museumPosition=instanceMatrix*museumPosition;
        #endif
        vMuseumPosition=(museumLocalFromWorld*modelMatrix*museumPosition).xyz;
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        uniform sampler2D museumSurface;
        uniform float museumPeriod,museumRelief,museumWorldScale,museumWear;
        uniform vec3 museumStain;
        varying vec3 vMuseumPosition;
        varying vec3 vMuseumNormal;
        vec4 museumSample(vec3 p,vec3 n){
          vec3 w=pow(abs(normalize(n)),vec3(6.0));w/=max(w.x+w.y+w.z,0.0001);
          // Vertical projections use Y as texture height, so streaks run down.
          return texture2D(museumSurface,p.zy)*w.x+
            texture2D(museumSurface,p.xz)*w.y+texture2D(museumSurface,p.xy)*w.z;
        }
        vec3 museumBump(vec3 position,vec3 normal,float height,float side){
          vec3 dx=dFdx(position),dy=dFdy(position);
          vec3 rx=cross(dy,normal),ry=cross(normal,dx);
          float determinant=dot(dx,rx)*side;
          vec3 gradient=sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry);
          return normalize(abs(determinant)*normal-gradient);
        }
      `).replace('#include <map_fragment>',`#include <map_fragment>
        vec4 museumTexel=museumSample(vMuseumPosition/museumPeriod,vMuseumNormal);
        diffuseColor.rgb*=museumTexel.r;
        diffuseColor.rgb=mix(diffuseColor.rgb,museumStain,museumTexel.g*museumWear);
      `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=clamp(roughnessFactor*(0.82+museumTexel.a*0.25),0.35,1.0);
      `).replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
        metalnessFactor*=1.0-museumTexel.g*0.85;
      `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        normal=museumBump(-vViewPosition,normal,museumTexel.b*museumRelief*museumWorldScale,faceDirection);
      `);
    };
    material.customProgramCacheKey=()=> 'museum-surface-v1';
  }
  root.userData.surfaceMaterials={version:'1.0',texturedCount,textureSize:SIZE,
    kinds:[...new Set(Object.values(assignments))],projection:'model-triplanar',mipmapped:true};
  return materials;
}
