import * as THREE from 'three';
import {createDetailedSoilAtlases,DETAILED_SOIL_VERSION} from './terrain-material-atlas.js?v=20261105-five-soil-v1';

// Optional, local terrain detail for the first interactive game-quality pilot.
// Source satellite/DEM and infrastructure geometry are never moved or replaced.
export const GAME_TERRAIN_VERSION = 'game-terrain-v6-five-materials';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const worldMaskSize=620;
const MASK_RESOLUTION=512;
const TEXTURE_SIZE=256;
const FIELD_RESOLUTION=512;
const hash=(x,y,seed=1)=>{
 let n=Math.imul((x|0)+seed*137,374761393)^Math.imul((y|0)-seed*29,668265263);
 n=Math.imul(n^(n>>>13),1274126177);
 return ((n^(n>>>16))>>>0)/4294967295;
};
function repeatNoise(x,y,frequency,seed){
 const u=x*frequency,v=y*frequency,ix=Math.floor(u),iy=Math.floor(v);
 const fx=(u-ix)**2*(3-2*(u-ix)),fy=(v-iy)**2*(3-2*(v-iy));
 const h=(a,b)=>hash(((a%frequency)+frequency)%frequency,((b%frequency)+frequency)%frequency,seed);
 return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(ix,iy),h(ix+1,iy),fx),
  THREE.MathUtils.lerp(h(ix,iy+1),h(ix+1,iy+1),fx),fy);
}
function makeMaterialTextures(renderer){
 const n=TEXTURE_SIZE,values=new Float32Array(n*n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const u=x/n,v=y/n;
  values[y*n+x]=.36*repeatNoise(u,v,4,11)+.28*repeatNoise(u,v,13,29)+
   .24*repeatNoise(u,v,37,47)+.12*repeatNoise(u,v,91,67);
 }
 const albedo=new Uint8Array(n*n*4),normal=new Uint8Array(n*n*4),roughness=new Uint8Array(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const p=y*n+x,i=p*4,h=values[p];
  const dx=values[y*n+(x+1)%n]-values[y*n+(x+n-1)%n];
  const dy=values[((y+1)%n)*n+x]-values[((y+n-1)%n)*n+x];
  const nx=-dx*3.9,ny=-dy*3.9,nz=1,inv=1/Math.hypot(nx,ny,nz);
  normal.set([Math.round((nx*inv*.5+.5)*255),Math.round((ny*inv*.5+.5)*255),
   Math.round((nz*inv*.5+.5)*255),255],i);
  const variation=clamp(.49+(h-.5)*1.85);
  const grain=hash(x,y,107)-.5;
  const tone=Math.round(clamp(variation+grain*.10)*255);
  albedo.set([clamp(tone+7,0,255),clamp(tone+3,0,255),tone,255],i);
  const r=Math.round(clamp(.84+(h-.5)*.15+grain*.055,.68,.97)*255);
  roughness.set([r,r,r,255],i);
 }
 const make=(bytes,name)=>{
  const texture=new THREE.DataTexture(bytes,n,n,THREE.RGBAFormat);
  texture.name=name;texture.colorSpace=THREE.NoColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
  texture.needsUpdate=true;return texture;
 };
 return {albedo:make(albedo,'Game terrain · granular albedo'),
  normal:make(normal,'Game terrain · ground normal'),
  roughness:make(roughness,'Game terrain · dry roughness')};
}

// One non-tiling, world-registered soil field across both sites. Larger masks
// are sampled at roughly 2.4 world units/texel; only the small PBR grain tiles.
// The DEM changes where deposits gather, not the shape of the underlying mesh.
function naturalNoise(x,z,cell,seed){
 const u=x/cell,v=z/cell,ix=Math.floor(u),iz=Math.floor(v);
 const fx=smooth(0,1,u-ix),fz=smooth(0,1,v-iz);
 return THREE.MathUtils.lerp(
  THREE.MathUtils.lerp(hash(ix,iz,seed),hash(ix+1,iz,seed),fx),
  THREE.MathUtils.lerp(hash(ix,iz+1,seed),hash(ix+1,iz+1,seed),fx),fz);
}
function makeLandcoverField(bounds,heightAt,renderer){
 const n=FIELD_RESOLUTION,bytes=new Uint8Array(n*n*4);
 for(let row=0;row<n;row++)for(let col=0;col<n;col++){
  const x=bounds.minX+(col+.5)/n*worldMaskSize;
  const z=bounds.minZ+(row+.5)/n*worldMaskSize;
  // Broad irregular warps prevent parallel striations and regular blobs.
  const wx=x+(naturalNoise(x,z,158,131)-.5)*37+(naturalNoise(x,z,44,137)-.5)*11;
  const wz=z+(naturalNoise(x+71,z-89,143,139)-.5)*33+(naturalNoise(x,z,51,149)-.5)*9;
  const sediment=.57*naturalNoise(wx,wz,112,17)+.29*naturalNoise(wx,wz,43,19)+
   .14*naturalNoise(wx,wz,13,23);
  const rock=.51*naturalNoise(wx+91,wz-43,74,31)+.34*naturalNoise(wx,wz,26,37)+
   .15*naturalNoise(wx,wz,9,41);
  const dryWash=.63*naturalNoise(wx-113,wz+67,96,53)+
   .27*naturalNoise(wx,wz,34,59)+.10*naturalNoise(wx,wz,11,61);
  const scrubField=.67*naturalNoise(wx+163,wz+41,48,71)+
   .33*naturalNoise(wx,wz,16,73);
  const h=heightAt(x,z);
  const dx=(heightAt(x+7,z)-heightAt(x-7,z))/14;
  const dz=(heightAt(x,z+7)-heightAt(x,z-7))/14;
  const slope=clamp(Math.hypot(dx,dz)/.085);
  const rise=smooth(.15,2.5,Math.max(0,h+2.755));
  const sand=smooth(.40,.70,sediment-.055*slope);
  const gravel=smooth(.44,.72,rock+.095*slope+.06*rise)*(1-.38*sand);
  const salt=smooth(.61,.81,dryWash+.025*(1-slope))*(1-.76*slope)*(1-.48*rise);
  const scrub=smooth(.51,.79,scrubField)*(1-.72*salt)*(1-.30*gravel);
  const i=(row*n+col)*4;
  bytes[i]=Math.round(sand*255);
  bytes[i+1]=Math.round(gravel*255);
  bytes[i+2]=Math.round(salt*255);
  bytes[i+3]=Math.round(scrub*255);
 }
 const texture=new THREE.DataTexture(bytes,n,n,THREE.RGBAFormat);
 texture.name='Game terrain · non-repeating sand/clay/gravel/salt field';
 texture.colorSpace=THREE.NoColorSpace;
 texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
 texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;
 texture.magFilter=THREE.LinearFilter;
 texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
 texture.needsUpdate=true;
 const sample=(x,z)=>{
  const col=clamp(Math.floor((x-bounds.minX)/worldMaskSize*n),0,n-1);
  const row=clamp(Math.floor((z-bounds.minZ)/worldMaskSize*n),0,n-1);
  const i=(row*n+col)*4;
  return {sand:bytes[i]/255,gravel:bytes[i+1]/255,
   salt:bytes[i+2]/255,scrub:bytes[i+3]/255};
 };
 return {texture,sample,resolution:n};
}

const GAME_SOIL_GLSL=/* glsl */`
uniform sampler2D gameClearance,gameGrains,gameLandcover;
uniform sampler2D gameMaterialAlbedo,gameMaterialNormal,gameMaterialRoughness;
uniform vec4 gameRect;

vec2 gameAtlasUV(float id,vec2 worldPos){
 // Four material columns, two rows, power-of-two atlas. A half texel inset
 // prevents GPU bilinear filtering from bleeding into a neighbour's tile.
 vec2 tile=vec2(mod(id,4.0),floor(id/4.0));
 vec2 uv=fract(worldPos/3.2);
 uv=mix(vec2(0.0015),vec2(0.9985),uv);
 return (tile+uv)/vec2(4.0,2.0);
}
void gameTopMaterials(vec4 field,out float bestId,out float nextId,out float blend){
 // ids: 0 clay, 1 sand, 2 gravel, 3 salt, 4 dry scrub
 float weights[5];
 weights[1]=field.r*.93;
 weights[2]=field.g*.92;
 weights[3]=field.b*.85;
 weights[4]=field.a*.52;
 weights[0]=max(.22,1.0-max(max(weights[1],weights[2]),max(weights[3],weights[4]))*.75);
 float best=-1.0,runner=-1.0;bestId=0.0;nextId=0.0;
 for(int i=0;i<5;i++){
  if(weights[i]>best){runner=best;nextId=bestId;best=weights[i];bestId=float(i);}
  else if(weights[i]>runner){runner=weights[i];nextId=float(i);}
 }
 blend=clamp(runner/max(best+runner,.0001),0.0,.5);
}

// Decorrelate every 11-unit patch. Smooth four-way crossfades avoid seams and
// the repeating texture grid while the texture itself keeps its PBR mipmaps.
vec2 gameHash2(vec2 cell){
 return fract(sin(vec2(dot(cell,vec2(127.1,311.7)),dot(cell,vec2(269.5,183.3))))*43758.5453);
}
vec3 gameStochasticGrain(vec2 p){
 vec2 tile=p/11.0,cell=floor(tile),fade=fract(tile);
 fade=fade*fade*(3.0-2.0*fade);
 vec2 uv=mat2(.866,-.5,.5,.866)*p/3.2;
 vec3 a=texture2D(gameGrains,uv+gameHash2(cell)*17.0).rgb;
 vec3 b=texture2D(gameGrains,uv+gameHash2(cell+vec2(1.0,0.0))*17.0).rgb;
 vec3 c=texture2D(gameGrains,uv+gameHash2(cell+vec2(0.0,1.0))*17.0).rgb;
 vec3 d=texture2D(gameGrains,uv+gameHash2(cell+vec2(1.0,1.0))*17.0).rgb;
 return mix(mix(a,b,fade.x),mix(c,d,fade.x),fade.y);
}
`;
const GAME_SOIL_SHADE=/* glsl */`
// Unique patches follow DEM slope and the photo's existing light/dark cues.
// All source landmarks stay in the satellite: color is only gently modulated.
vec2 gameLandUv=(vSteppeWorld.xz-gameRect.xy)/gameRect.zw;
vec4 gameSoil=texture2D(gameLandcover,gameLandUv);
float gameMaterialA,gameMaterialB,gameMaterialMix;
gameTopMaterials(gameSoil,gameMaterialA,gameMaterialB,gameMaterialMix);
vec2 gameMaterialUvA=gameAtlasUV(gameMaterialA,vSteppeWorld.xz);
vec2 gameMaterialUvB=gameAtlasUV(gameMaterialB,vSteppeWorld.xz);
float gamePhotoLight=smoothstep(.055,.45,dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));
vec3 gameWeather=mix(vec3(.970,.965,.958),vec3(1.058,1.031,.985),gameSoil.r*.77);
gameWeather=mix(gameWeather,vec3(.91,.91,.89),gameSoil.g*.23);
gameWeather=mix(gameWeather,vec3(1.085,1.09,1.065),gameSoil.b*(.13+.18*gamePhotoLight));
gameWeather*=1.0+(gameSoil.a-.5)*.025;
float gamePixelSize=max(length(dFdx(vSteppeWorld.xz)),length(dFdy(vSteppeWorld.xz)));
float gamePatchFade=1.0-smoothstep(3.0,15.0,gamePixelSize);
diffuseColor.rgb*=mix(vec3(1.0),gameWeather,gamePatchFade);
vec3 gameRealSoil=mix(texture2D(gameMaterialAlbedo,gameMaterialUvA).rgb,
 texture2D(gameMaterialAlbedo,gameMaterialUvB).rgb,gameMaterialMix);
// Preserve 65% of the georeferenced satellite photo colour, even in a
// close-up. Soil atlas gives surface material identity, never new landmarks.
diffuseColor.rgb=mix(diffuseColor.rgb,gameRealSoil,gamePatchFade*.35);
float gameMicroFade=1.0-smoothstep(.22,1.65,gamePixelSize);
vec3 gameMicro=gameStochasticGrain(vSteppeWorld.xz);
diffuseColor.rgb*=mix(vec3(1.0),
 clamp(vec3(1.0)+(gameMicro-vec3(.5))*.35,vec3(.83),vec3(1.17)),gameMicroFade);
`;

function createClearanceMask({bounds,geography,osmRoads,osmRails,transport,point,pad,site2}){
 const canvas=document.createElement('canvas');
 canvas.width=canvas.height=MASK_RESOLUTION;
 const ctx=canvas.getContext('2d');
 const size=worldMaskSize,unit=MASK_RESOLUTION/size;
 const toXY=(x,z)=>[(x-bounds.minX)*unit,(z-bounds.minZ)*unit];
 const center=toXY((pad.x+site2.x)/2,(pad.z+site2.z)/2);
 const edge=ctx.createRadialGradient(center[0],center[1],230*unit,
  center[0],center[1],306*unit);
 edge.addColorStop(0,'rgb(255,255,255)');edge.addColorStop(1,'rgb(0,0,0)');
 ctx.fillStyle=edge;ctx.fillRect(0,0,MASK_RESOLUTION,MASK_RESOLUTION);
 ctx.lineCap='round';ctx.lineJoin='round';
 const road=(points,width)=>{
  if(points.length<2)return;
  if(!points.some(p=>p[0]>=bounds.minX-40&&p[0]<=bounds.maxX+40&&
   p[1]>=bounds.minZ-40&&p[1]<=bounds.maxZ+40))return;
  ctx.beginPath();
  points.forEach(([x,z],i)=>{const [px,py]=toXY(x,z);i?ctx.lineTo(px,py):ctx.moveTo(px,py);});
  ctx.strokeStyle='#8d8d8d';ctx.lineWidth=(width+17)*unit;ctx.stroke();
  ctx.strokeStyle='#090909';ctx.lineWidth=(width+7)*unit;ctx.stroke();
 };
 for(const feature of osmRoads.features||[]){
  const geometry=feature.geometry,tags=feature.properties?.tags||{},kind=tags.highway;
  if(!kind||!['LineString','MultiLineString'].includes(geometry?.type))continue;
  const width=['primary','secondary','trunk'].includes(kind)?9:['tertiary','unclassified'].includes(kind)?6:4;
  const lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.coordinates;
  for(const line of lines){
   if(!line?.length)continue;
   const samples=line.map(coord=>{const [x,y]=geography.project(...coord),p=point(x,y,0);return [p.x,p.z];});
   road(samples,width);
  }
 }
 // Keep railway ballast, sleepers and rails clean; this is a soil-only overlay.
 for(const feature of osmRails.features||[]){
  const geometry=feature.geometry;
  if(!['LineString','MultiLineString'].includes(geometry?.type))continue;
  const lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.coordinates;
  for(const line of lines){
   if(!line?.length)continue;
   const samples=line.map(coord=>{const [x,y]=geography.project(...coord),p=point(x,y,0);return [p.x,p.z];});
   road(samples,5);
  }
 }
 // Rendered major roads can have smoothed centre lines different from OSM.
 for(const item of transport.roadPaths?.()||[]){
  if(item.points?.length>1)road(item.points.map(p=>[p.x,p.z]),item.width||5);
 }
 const exclude=(p,radius)=>{
  const [x,y]=toXY(p.x,p.z);
  const fade=ctx.createRadialGradient(x,y,radius*unit,x,y,(radius+12)*unit);
  fade.addColorStop(0,'#000000');fade.addColorStop(1,'#ffffff');
  ctx.save();ctx.globalCompositeOperation='darken';ctx.beginPath();ctx.arc(x,y,(radius+12)*unit,0,Math.PI*2);
  ctx.clip();ctx.fillStyle=fade;ctx.fillRect(x-radius*unit-15,y-radius*unit-15,
   2*(radius*unit+15),2*(radius*unit+15));ctx.restore();
 };
 exclude(pad,37);exclude(site2,31);
 const data=ctx.getImageData(0,0,MASK_RESOLUTION,MASK_RESOLUTION).data;
 const pixelAt=(x,z)=>{
  const u=Math.floor((x-bounds.minX)*unit),v=Math.floor((z-bounds.minZ)*unit);
  return u>=0&&v>=0&&u<MASK_RESOLUTION&&v<MASK_RESOLUTION
   ?data[(v*MASK_RESOLUTION+u)*4]/255:0;
 };
 const texture=new THREE.CanvasTexture(canvas);
 texture.name='Game terrain · site and road clearance';
 texture.colorSpace=THREE.NoColorSpace;
 texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
 texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
 texture.generateMipmaps=true;texture.needsUpdate=true;
 return {texture,pixelAt};
}
function makeGroundGeometry(bounds,heightAt){
 const segments=104,size=worldMaskSize;
 const positions=[],uv=[],indices=[];
 for(let z=0;z<=segments;z++)for(let x=0;x<=segments;x++){
  const px=bounds.minX+x/segments*size,pz=bounds.minZ+z/segments*size;
  const base=heightAt(px,pz);
  // Keep the DEM shape; tiny sub-metre irregularities are visible only in close-ups.
  const bump=.040*(naturalNoise(px,pz,23,211)-.5)+.018*(naturalNoise(px,pz,11,213)-.5);
  positions.push(px,(Number.isFinite(base)?base:-2.755)+.048+bump,pz);
  uv.push(px/3.2,pz/3.2);
 }
 for(let z=0;z<segments;z++)for(let x=0;x<segments;x++){
  const a=z*(segments+1)+x,b=a+1,c=a+segments+1,d=c+1;
  indices.push(a,c,b,b,c,d);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 geometry.setIndex(indices);geometry.computeVertexNormals();
 geometry.computeBoundingSphere();
 return geometry;
}
function makePebbles({bounds,mask,heightAt,landcover,root}){
 const geometry=new THREE.IcosahedronGeometry(1,0);
 const material=new THREE.MeshStandardMaterial({
  color:0xb6a083,roughness:.97,metalness:0,transparent:true,depthWrite:false,opacity:0
 });
 const max=3300,stones=new THREE.InstancedMesh(geometry,material,max);
 stones.name='Пилот грунта · камни и щебень';
 stones.userData.pickable=false;stones.castShadow=false;stones.receiveShadow=false;
 stones.frustumCulled=false;
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 let accepted=0;
 for(let i=0;i<max*5&&accepted<max;i++){
  const x=bounds.minX+hash(i,83,19)*worldMaskSize;
  const z=bounds.minZ+hash(i,39,31)*worldMaskSize;
  if(mask.pixelAt(x,z)<.78)continue;
  const soil=landcover.sample(x,z);
  if(hash(i,97,19)>.36+soil.gravel*.48-soil.salt*.16)continue;
  const height=heightAt(x,z);
  if(!Number.isFinite(height))continue;
  const scale=.042+Math.pow(hash(i,7,97),2)*.19;
  dummy.position.set(x,height+.047+scale*.22,z);
  dummy.rotation.set(hash(i,5,41)*.22,hash(i,9,53)*Math.PI*2,hash(i,13,61)*.24);
  dummy.scale.set(scale*(.75+hash(i,11,43)*.7),scale*(.35+hash(i,17,47)*.5),scale*(.7+hash(i,19,59)*.6));
  dummy.updateMatrix();stones.setMatrixAt(accepted,dummy.matrix);
  const variation=.74+hash(i,23,13)*.37;
  color.setRGB((.75+.10*soil.sand)*variation,(.67+.08*soil.sand)*variation,
   (.54+.06*soil.sand+.03*soil.salt)*variation);
  stones.setColorAt(accepted,color);accepted++;
 }
 stones.count=accepted;
 stones.instanceMatrix.needsUpdate=true;
 if(stones.instanceColor)stones.instanceColor.needsUpdate=true;
 stones.renderOrder=5;stones.visible=false;root.add(stones);
 return {stones,accepted};
}
// A small number of low, desaturated steppe shrubs share one draw call.
function makeSparseShrubs({bounds,mask,heightAt,landcover,root}){
 const geometry=new THREE.IcosahedronGeometry(1,0);
 const material=new THREE.MeshStandardMaterial({
  color:0x938b68,roughness:1,transparent:true,depthWrite:false,opacity:0
 });
 const max=260,mesh=new THREE.InstancedMesh(geometry,material,max);
 mesh.name='Пилот грунта · редкий степной кустарник';
 mesh.userData.pickable=false;mesh.castShadow=false;mesh.frustumCulled=false;
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 let count=0;
 for(let i=0;i<max*9&&count<max;i++){
  const x=bounds.minX+hash(i,113,73)*worldMaskSize;
  const z=bounds.minZ+hash(i,131,71)*worldMaskSize;
  if(mask.pixelAt(x,z)<.94)continue;
  const soil=landcover.sample(x,z);
  if(hash(i,17,79)>.14+soil.scrub*.54||soil.salt>.72)continue;
  const y=heightAt(x,z);
  if(!Number.isFinite(y))continue;
  const width=.18+hash(i,23,83)*.25,height=.08+hash(i,31,89)*.20;
  dummy.position.set(x,y+.05+height*.4,z);
  dummy.rotation.set(0,hash(i,37,97)*Math.PI*2,0);
  dummy.scale.set(width,height,width*(.7+hash(i,41,101)*.5));
  dummy.updateMatrix();mesh.setMatrixAt(count,dummy.matrix);
  color.setRGB(.55+hash(i,53,107)*.13,.52+hash(i,59,109)*.13,.37+hash(i,61,113)*.11);
  mesh.setColorAt(count,color);count++;
 }
 mesh.count=count;mesh.instanceMatrix.needsUpdate=true;
 if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 mesh.renderOrder=5;mesh.visible=false;root.add(mesh);
 return {mesh,count};
}
export async function createGameTerrainPilot({scene,renderer,camera,siteRecords,geography,osmRoads,osmRails,transport,point,terrainRelief,steppeSurface,sceneScale=3.4}){
 const g=siteRecords.find(item=>item.id==='pad-1'),s=siteRecords.find(item=>item.id==='pad-2');
 if(!g||!s)throw new Error('Game terrain pilot requires Gagarin and Site 2');
 const pad=point(g.x,g.y,0),site2=point(s.x,s.y,0),mid=pad.clone().add(site2).multiplyScalar(.5);
 const bounds={minX:mid.x-worldMaskSize/2,minZ:mid.z-worldMaskSize/2};
 const mask=createClearanceMask({bounds,geography,osmRoads,osmRails,transport,point,pad,site2});
 const maps=makeMaterialTextures(renderer);
 const atlas=await createDetailedSoilAtlases({renderer,tileSize:512});
 const landcover=makeLandcoverField(bounds,terrainRelief.heightAt,renderer);
 const material=new THREE.MeshStandardMaterial({
  color:0xffffff,roughness:.96,metalness:0,normalMap:maps.normal,roughnessMap:maps.roughness,
  normalScale:new THREE.Vector2(.38,.38),transparent:true,opacity:0,depthWrite:false,
  polygonOffset:true,polygonOffsetFactor:-2
 });
 steppeSurface.apply(material);
 const prev=material.onBeforeCompile;
 material.onBeforeCompile=function(shader,webglRenderer){
  prev.call(this,shader,webglRenderer);
  shader.uniforms.gameClearance={value:mask.texture};
  shader.uniforms.gameGrains={value:maps.albedo};
  shader.uniforms.gameLandcover={value:landcover.texture};
  shader.uniforms.gameMaterialAlbedo={value:atlas.albedo};
  shader.uniforms.gameMaterialNormal={value:atlas.normal};
  shader.uniforms.gameMaterialRoughness={value:atlas.roughness};
  shader.uniforms.gameRect={value:new THREE.Vector4(bounds.minX,bounds.minZ,worldMaskSize,worldMaskSize)};
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
   '#include <common>\n'+GAME_SOIL_GLSL);
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',
   '#include <alphamap_fragment>\nvec2 gameUV=vec2((vSteppeWorld.x-gameRect.x)/gameRect.z,1.0-(vSteppeWorld.z-gameRect.y)/gameRect.w);\ndiffuseColor.a*=texture2D(gameClearance,gameUV).r;');
  const satelliteHook='diffuseColor.rgb*=steppeTone;';
  const fallbackHook='diffuseColor.rgb*=steppeSurfaceTone(vSteppeWorld.xz);';
  const soilHook=shader.fragmentShader.includes(satelliteHook)?satelliteHook:fallbackHook;
  if(!shader.fragmentShader.includes(soilHook))
   throw new Error('Game terrain requires shared steppe surface shader');
  shader.fragmentShader=shader.fragmentShader.replace(soilHook,soilHook+'\n'+GAME_SOIL_SHADE);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec3 gameAtlasN=mix(texture2D(gameMaterialNormal,gameMaterialUvA).xyz,
    texture2D(gameMaterialNormal,gameMaterialUvB).xyz,gameMaterialMix)*2.0-1.0;
   vec3 gameSide=normalize(vec3(1.0,0.0,0.0)-normal*normal.x+vec3(0.00001));
   vec3 gameFront=normalize(cross(normal,gameSide));
   normal=normalize(normal+(gameSide*gameAtlasN.x+gameFront*gameAtlasN.y)*.24*gameMicroFade);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
   float gameAtlasR=mix(texture2D(gameMaterialRoughness,gameMaterialUvA).r,
    texture2D(gameMaterialRoughness,gameMaterialUvB).r,gameMaterialMix);
   roughnessFactor=mix(roughnessFactor,gameAtlasR,gamePatchFade*.66);`);
 };
 const beforeCache=material.customProgramCacheKey.bind(material);
 material.customProgramCacheKey=()=>beforeCache()+'|'+GAME_TERRAIN_VERSION;
 material.needsUpdate=true;
 const root=new THREE.Group();root.name='Игровая земля · пилот пл. 1 и пл. 2';
 root.userData.pickable=false;
 const terrain=new THREE.Mesh(makeGroundGeometry(bounds,terrainRelief.heightAt),material);
 terrain.name='Песок, гравий, сухая глина · PBR';
 terrain.renderOrder=4;terrain.receiveShadow=true;
 terrain.visible=false;terrain.userData.pickable=false;root.add(terrain);
 const {stones,accepted}=makePebbles({bounds,mask,heightAt:terrainRelief.heightAt,landcover,root});
 const {mesh:shrubs,count:shrubCount}=makeSparseShrubs({bounds,mask,heightAt:terrainRelief.heightAt,landcover,root});
 scene.add(root);
 let altitude=-1,strength=0,stonesStrength=0;
 function update(){
  const height=camera.position.y/sceneScale;
  const proximity=Math.min(Math.hypot(camera.position.x-pad.x,camera.position.z-pad.z),
   Math.hypot(camera.position.x-site2.x,camera.position.z-site2.z));
  const near=1-smooth(235,440,proximity);
  const blend=.94*(1-smooth(110,270,height))*near;
  strength=blend;
  material.opacity=blend;
  terrain.visible=blend>.003;
  const tiny=(1-smooth(18,43,height))*near;
  stonesStrength=tiny;
  stones.visible=tiny>.015;
  stones.material.opacity=tiny;
  shrubs.visible=tiny>.03;shrubs.material.opacity=tiny*.86;
  altitude=height;
 }
 update();
 return {update,stats:()=>({version:GAME_TERRAIN_VERSION,active:terrain.visible,
  height:altitude,blend:strength,stonesBlend:stonesStrength,
  stones:accepted,shrubs:shrubCount,triangles:terrain.geometry.index.count/3,
  geometry:'DEM-aligned mesh',material:'PBR MeshStandardMaterial',
  textures:['stochastic-grain','normal','roughness','non-repeating-landcover',
   'five-material-albedo','five-material-normal','five-material-roughness'],
  detailedMaterialVersion:DETAILED_SOIL_VERSION,materialFamilies:atlas.materials,
  atlasResolution:[atlas.width,atlas.height],atlasTile:atlas.tileSize,
  atlasGpuBytes:atlas.gpuBytes,
  satellitePreserved:true,soilFieldResolution:landcover.resolution,soilFieldPeriod:'unique-620-unit-area',
  clearance:'launch pads, roads and rails are left visible',
  bounds:{...bounds,size:worldMaskSize}})};
}
