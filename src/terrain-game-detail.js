import * as THREE from 'three';

// Optional, local terrain detail for the first interactive game-quality pilot.
// Source satellite/DEM and infrastructure geometry are never moved or replaced.
export const GAME_TERRAIN_VERSION = 'game-terrain-pilot-v2';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const worldMaskSize=620;
const MASK_RESOLUTION=512;
const TEXTURE_SIZE=256;
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
function createClearanceMask({bounds,geography,osmRoads,transport,point,pad,site2}){
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
 // Rendered major roads can have smoothed centre lines different from OSM.
 for(const item of transport.roadPaths?.()||[]){
  if(item.points?.length>1)road(item.points.map(p=>[p.x,p.z]),item.width||5);
 }
 const exclude=(p,radius)=>{
  const [x,y]=toXY(p.x,p.z);
  const fade=ctx.createRadialGradient(x,y,radius*unit,x,y,(radius+12)*unit);
  fade.addColorStop(0,'#000000');fade.addColorStop(1,'#ffffff');
  ctx.save();ctx.beginPath();ctx.arc(x,y,(radius+12)*unit,0,Math.PI*2);
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
  const bump=.019*Math.sin(px*.17+pz*.07)+.013*Math.cos(px*.11-pz*.23);
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
function makePebbles({bounds,mask,heightAt,root}){
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
  const height=heightAt(x,z);
  if(!Number.isFinite(height))continue;
  const scale=.042+Math.pow(hash(i,7,97),2)*.19;
  dummy.position.set(x,height+.047+scale*.22,z);
  dummy.rotation.set(hash(i,5,41)*.22,hash(i,9,53)*Math.PI*2,hash(i,13,61)*.24);
  dummy.scale.set(scale*(.75+hash(i,11,43)*.7),scale*(.35+hash(i,17,47)*.5),scale*(.7+hash(i,19,59)*.6));
  dummy.updateMatrix();stones.setMatrixAt(accepted,dummy.matrix);
  const variation=.74+hash(i,23,13)*.37;
  color.setRGB(.78*variation,.69*variation,.55*variation);
  stones.setColorAt(accepted,color);accepted++;
 }
 stones.count=accepted;
 stones.instanceMatrix.needsUpdate=true;
 if(stones.instanceColor)stones.instanceColor.needsUpdate=true;
 stones.renderOrder=5;stones.visible=false;root.add(stones);
 return {stones,accepted};
}
// A small number of low, desaturated steppe shrubs share one draw call.
function makeSparseShrubs({bounds,mask,heightAt,root}){
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
  if(mask.pixelAt(x,z)<.94||hash(i,17,79)<.35)continue;
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
export function createGameTerrainPilot({scene,renderer,camera,siteRecords,geography,osmRoads,transport,point,terrainRelief,steppeSurface,sceneScale=3.4}){
 const g=siteRecords.find(item=>item.id==='pad-1'),s=siteRecords.find(item=>item.id==='pad-2');
 if(!g||!s)throw new Error('Game terrain pilot requires Gagarin and Site 2');
 const pad=point(g.x,g.y,0),site2=point(s.x,s.y,0),mid=pad.clone().add(site2).multiplyScalar(.5);
 const bounds={minX:mid.x-worldMaskSize/2,minZ:mid.z-worldMaskSize/2};
 const mask=createClearanceMask({bounds,geography,osmRoads,transport,point,pad,site2});
 const maps=makeMaterialTextures(renderer);
 const material=new THREE.MeshStandardMaterial({
  color:0xffffff,roughness:.96,metalness:0,normalMap:maps.normal,roughnessMap:maps.roughness,
  normalScale:new THREE.Vector2(.82,.82),transparent:true,opacity:0,depthWrite:false,
  polygonOffset:true,polygonOffsetFactor:-2
 });
 steppeSurface.apply(material);
 const prev=material.onBeforeCompile;
 material.onBeforeCompile=function(shader,webglRenderer){
  prev.call(this,shader,webglRenderer);
  shader.uniforms.gameClearance={value:mask.texture};
  shader.uniforms.gameGrains={value:maps.albedo};
  shader.uniforms.gameRect={value:new THREE.Vector4(bounds.minX,bounds.minZ,worldMaskSize,worldMaskSize)};
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
   '#include <common>\nuniform sampler2D gameClearance,gameGrains;\nuniform vec4 gameRect;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',
   '#include <alphamap_fragment>\nvec2 gameUV=vec2((vSteppeWorld.x-gameRect.x)/gameRect.z,1.0-(vSteppeWorld.z-gameRect.y)/gameRect.w);\ndiffuseColor.a*=texture2D(gameClearance,gameUV).r;');
  shader.fragmentShader=shader.fragmentShader.replace('diffuseColor.rgb*=steppeTone;',
   'diffuseColor.rgb*=steppeTone;\nvec3 gameGrain=texture2D(gameGrains,vSteppeWorld.xz/3.2).rgb;\ndiffuseColor.rgb*=clamp(vec3(1.0)+(gameGrain-vec3(.5))*.68,vec3(.72),vec3(1.26));');
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
 const {stones,accepted}=makePebbles({bounds,mask,heightAt:terrainRelief.heightAt,root});
 const {mesh:shrubs,count:shrubCount}=makeSparseShrubs({bounds,mask,heightAt:terrainRelief.heightAt,root});
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
  textures:['grain','normal','roughness'],satellitePreserved:true,
  clearance:'launch pads, roads and rails are left visible',
  bounds:{...bounds,size:worldMaskSize}})};
}
