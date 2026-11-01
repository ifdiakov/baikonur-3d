import assert from 'node:assert/strict';
import * as THREE from 'three';
import {STEPPE_VERSION,sampleSteppeFields,sampleSteppe} from '../src/steppe-field.js';
import {createSteppeSurface,installSteppeSurface,STEPPE_BIOME_EXTENT,STEPPE_BIOME_RESOLUTION} from '../src/steppe-surface.js';
import {maskUkssTerrain} from '../src/ukss-pad.js';
import {createTerrainVoids} from '../src/terrain-voids.js';

assert.equal(STEPPE_VERSION,'baikonur-steppe-v7');
const fieldNames=['salt','sand','scrub','stone','tone'],samples=[],cohorts={soil:[],sand:[],salt:[]};
const ranges=Object.fromEntries(fieldNames.map(key=>[key,[Infinity,-Infinity]]));
function checkSample(x,z){
 const fields=sampleSteppeFields(x,z);
 assert.deepEqual(Object.keys(fields).sort(),[...fieldNames].sort());
 for(const key of fieldNames){
  const value=fields[key];assert.ok(Number.isFinite(value)&&value>=0&&value<=1,`${key} must remain a finite blend weight at ${x},${z}`);
  ranges[key][0]=Math.min(ranges[key][0],value);ranges[key][1]=Math.max(ranges[key][1],value);
 }
 const colours=[0,1,2].map(detail=>sampleSteppe(x,z,detail));
 for(const colour of colours){
  assert.equal(colour.length,3);
  assert.ok(colour.every(value=>Number.isFinite(value)&&value>=0&&value<=255),'Terrain colours use bounded sRGB channels');
 }
 samples.push({x,z,fields,colours});return {fields,colour:colours[2]};
}
// Cover the actual historic-map area, not hand-picked peaks of a noise seed.
// Every visible soil family must occupy a useful area inside the museum.
for(let iz=0;iz<=80;iz++)for(let ix=0;ix<=100;ix++){
 const {fields:f,colour}=checkSample(-2210+4420*ix/100,-1776.5+3553*iz/80);
 if(f.salt>.75)cohorts.salt.push(colour);
 else if(f.sand>.75&&f.salt<.15)cohorts.sand.push(colour);
 else if(f.salt<.15&&f.sand<.15)cohorts.soil.push(colour);
}
// Include negative coordinates and the boundaries of every terrain extent.
for(const x of [-160000,-58000,-9000,-2210,0,2210,9000,58000,160000])
 for(const z of [-160000,-9000,-1776.5,0,1776.5,9000,160000])checkSample(x,z);
for(const sample of [...samples].reverse()){
 assert.deepEqual(sampleSteppeFields(sample.x,sample.z),sample.fields,'Field evaluation must not depend on traversal order or mutable random state');
 for(let detail=0;detail<=2;detail++)assert.deepEqual(sampleSteppe(sample.x,sample.z,detail),sample.colours[detail]);
}
for(const key of fieldNames)assert.ok(ranges[key][1]-ranges[key][0]>.1,`${key} must not collapse into a constant field`);
const mean=values=>values.reduce((sum,colour)=>sum.map((value,i)=>value+colour[i]/values.length),[0,0,0]);
const meanColours={};
for(const [name,colours]of Object.entries(cohorts)){
 assert.ok(colours.length>=64,`The map needs a visible ${name} region, not an isolated sample`);meanColours[name]=mean(colours);
}
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const luminance=colour=>colour[0]*.2126+colour[1]*.7152+colour[2]*.0722;
for(const [a,b]of [['soil','sand'],['soil','salt'],['sand','salt']])
 assert.ok(distance(meanColours[a],meanColours[b])>25,`${a} and ${b} must remain visibly distinct`);
assert.ok(luminance(meanColours.salt)>luminance(meanColours.sand)+12,'Salt crust must read lighter than sand');
assert.ok(luminance(meanColours.sand)>luminance(meanColours.soil)+10,'Sand deposits must stand out from the steppe soil');
// The supplied reference has warm cream salt, so compare saturation relative
// to brightness rather than requiring the former almost-neutral white salt.
const warmChroma=colour=>(colour[0]-colour[2])/luminance(colour);
assert.ok(warmChroma(meanColours.sand)>warmChroma(meanColours.salt)+.15,'Cream salt crust must remain less saturated than ochre sand');
let maxBoundaryJump=0;
for(const {x,z,fields}of samples.filter((_,i)=>i%137===0))for(const [dx,dz]of [[.0001,0],[0,.0001]]){
 const next=sampleSteppeFields(x+dx,z+dz);
 for(const key of fieldNames)maxBoundaryJump=Math.max(maxBoundaryJump,Math.abs(next[key]-fields[key]));
}
assert.ok(maxBoundaryJump<.002,'World-coordinate detail must not jump at cell or terrain-layer boundaries');

// Exercise the real shared-texture factory without requiring a DOM image
// decoder. Authored image pixels are asset QA; filtering, reuse and the actual
// generated biome data are tested here.
const loaded=[],originalLoad=THREE.TextureLoader.prototype.loadAsync;
let surface;
try{
 THREE.TextureLoader.prototype.loadAsync=async function(url){
  const texture=new THREE.DataTexture(new Uint8Array(4*4*4).fill(128),4,4,THREE.RGBAFormat);
  loaded.push({url,texture});return texture;
 };
 surface=await createSteppeSurface({renderer:{capabilities:{getMaxAnisotropy:()=>16}}});
}finally{THREE.TextureLoader.prototype.loadAsync=originalLoad;}
assert.equal(loaded.length,2,'The factory loads one shared micro map and one shared meso map');
assert.equal(new Set(loaded.map(item=>item.url)).size,2);
for(const {texture}of loaded){
 assert.equal(texture.colorSpace,THREE.NoColorSpace);assert.equal(texture.wrapS,THREE.RepeatWrapping);assert.equal(texture.wrapT,THREE.RepeatWrapping);
 assert.equal(texture.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(texture.generateMipmaps,true);assert.ok(texture.anisotropy<=8);
}
const compile=material=>{
 const shader={uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.basic.uniforms),vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};
 material.onBeforeCompile(shader,{});return shader;
};
const options={color:0xc9b58d,vertexColors:true,transparent:true,opacity:.63,depthWrite:false,alphaTest:.001,side:THREE.DoubleSide,fog:true};
const scene=new THREE.Scene(),geometry=new THREE.PlaneGeometry(320000,320000,16,16),plain=new THREE.MeshBasicMaterial(options);
const mesh=new THREE.Mesh(geometry,plain);mesh.rotation.x=-Math.PI/2;scene.add(mesh);
const attributes=Object.fromEntries(Object.entries(geometry.attributes).map(([name,attribute])=>[name,attribute.array.slice()]));
const indices=geometry.index.array.slice(),originalChildren=[...scene.children];
const originalState={color:plain.color.clone(),opacity:plain.opacity,transparent:plain.transparent,depthWrite:plain.depthWrite,alphaTest:plain.alphaTest,vertexColors:plain.vertexColors,side:plain.side,fog:plain.fog};
surface.apply(plain);const firstShader=compile(plain);
const addedNames=Object.keys(firstShader.uniforms).filter(key=>!(key in THREE.ShaderLib.basic.uniforms));
assert.equal(addedNames.length,3,'Soil detail adds only three uniforms; excavation uniforms keep their existing budget');
const sharedTextures=addedNames.map(key=>firstShader.uniforms[key].value);
assert.ok(sharedTextures.every(texture=>texture?.isTexture));assert.equal(new Set(sharedTextures).size,3);
const biomeTexture=sharedTextures.find(texture=>!loaded.some(item=>item.texture===texture));
assert.ok(biomeTexture?.isDataTexture);assert.equal(biomeTexture.image.width,STEPPE_BIOME_RESOLUTION);assert.equal(biomeTexture.image.height,STEPPE_BIOME_RESOLUTION);
assert.equal(biomeTexture.colorSpace,THREE.NoColorSpace);assert.equal(biomeTexture.generateMipmaps,true);
assert.equal(biomeTexture.minFilter,THREE.LinearMipmapLinearFilter);
assert.equal(biomeTexture.wrapS,THREE.ClampToEdgeWrapping);assert.equal(biomeTexture.wrapT,THREE.ClampToEdgeWrapping);
const textures={biomeTexture,microTexture:loaded.find(item=>item.url.includes('micro')).texture,mesoTexture:loaded.find(item=>item.url.includes('meso')).texture};
let biomeProbes=0;
for(const [u,v]of [[0,0],[1,17],[63,171],[128,255],[255,128],[310,7],[510,511],[511,0],[511,511]]){
 const size=STEPPE_BIOME_RESOLUTION,ix=Math.round(u/511*(size-1)),iz=Math.round(v/511*(size-1)),x=((ix+.5)/size-.5)*STEPPE_BIOME_EXTENT,z=((iz+.5)/size-.5)*STEPPE_BIOME_EXTENT;
 const expected=sampleSteppeFields(x,z),pixel=4*(iz*size+ix);
 for(const [channel,key]of ['salt','sand','scrub'].entries())assert.ok(Math.abs(biomeTexture.image.data[pixel+channel]/255-expected[key])<=.5/255+1e-10,`Biome ${key} must address world X/Z without a flipped or transposed axis`);
 assert.equal(biomeTexture.image.data[pixel+3],255);biomeProbes++;
}
const firstHook=plain.onBeforeCompile,firstKey=plain.customProgramCacheKey();
surface.apply(plain);assert.strictEqual(plain.onBeforeCompile,firstHook,'Applying soil twice must not wrap the shader twice');assert.equal(plain.customProgramCacheKey(),firstKey);
const second=new THREE.MeshBasicMaterial(options);surface.apply(second);
const secondShader=compile(second);
for(const name of addedNames)assert.strictEqual(secondShader.uniforms[name].value,firstShader.uniforms[name].value,'Material instances must share the actual GPU texture objects');
const clone=plain.clone();assert.deepEqual(clone.userData,plain.userData,'This fixture must exercise Three.copy carrying userData but dropping callbacks');
assert.notStrictEqual(clone.onBeforeCompile,plain.onBeforeCompile);surface.apply(clone);const cloneShader=compile(clone);
assert.equal(cloneShader.vertexShader,firstShader.vertexShader);assert.equal(cloneShader.fragmentShader,firstShader.fragmentShader,'A cloned hill must retain the same world-space detail after reinstallation');
for(const name of addedNames)assert.strictEqual(cloneShader.uniforms[name].value,firstShader.uniforms[name].value);
assert.equal(clone.customProgramCacheKey(),plain.customProgramCacheKey(),'Equivalent soil instances should share the shader program');
assert.ok(firstShader.vertexShader.includes('modelMatrix')&&firstShader.vertexShader.includes('instanceMatrix'),'The projection must use world coordinates, including instanced transforms');
assert.ok(/dFdx\s*\(/.test(firstShader.fragmentShader)&&/dFdy\s*\(/.test(firstShader.fragmentShader),'Fine detail needs pixel-footprint filtering at distant views');
assert.equal(plain.extensions.derivatives,true);

const polygonRoot=new THREE.Group();polygonRoot.position.set(37,-2.755,-94);polygonRoot.rotation.y=.7;polygonRoot.scale.setScalar(.14);
const siloRoot=new THREE.Group();siloRoot.position.set(-58,-2.72,81);siloRoot.scale.setScalar(.28);
const voids=createTerrainVoids();voids.add(polygonRoot,{polygon:[[-20,-12],[50,-12],[50,12],[-20,12]]});voids.add(siloRoot,{rx:12,rz:12,compactCircle:true});
const cutoutEnabled={value:1},ukssOrigin=new THREE.Vector3(-90,-2.755,45),ukssPolygon=[[-64,-30],[280,-30],[280,30],[-64,30]];
let compositions=0;
for(const order of ['soil-first','soil-last']){
 const material=new THREE.MeshBasicMaterial(options);let priorCalls=0;
 material.customProgramCacheKey=()=> 'existing-terrain-regression-hook';
 material.onBeforeCompile=function(shader){
  assert.strictEqual(this,material);priorCalls++;shader.uniforms.existingTerrainStrength={value:.9};
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float existingTerrainStrength;')
   .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=existingTerrainStrength;');
 };
 if(order==='soil-first')installSteppeSurface(material,textures);
 maskUkssTerrain(material,ukssOrigin,.14,cutoutEnabled,ukssPolygon);voids.mask(material);
 if(order==='soil-last')installSteppeSurface(material,textures);
 const shader=compile(material);assert.equal(priorCalls,1,'Every previously installed hook executes exactly once');
 assert.strictEqual(shader.uniforms.ukssCutoutEnabled,cutoutEnabled);
 assert.ok(shader.fragmentShader.includes('existingTerrainStrength')&&shader.fragmentShader.includes('ukssCutoutEnabled')&&shader.fragmentShader.includes('museumVoid0Contains')&&shader.fragmentShader.includes('museumVoid1Circle'));
 assert.equal((shader.fragmentShader.match(/\bdiscard\s*;/g)||[]).length,3,'UKSS, polygonal gas duct and compact silo discard branches must all survive');
 for(const chunk of ['map_fragment','color_fragment','alphamap_fragment','alphatest_fragment','clipping_planes_fragment','logdepthbuf_fragment','fog_fragment','tonemapping_fragment','colorspace_fragment'])
  assert.equal(shader.fragmentShader.split(`#include <${chunk}>`).length-1,1,`${chunk} must remain in the composed shader`);
 assert.ok(/diffuseColor\.rgb\s*\*=\s*steppeSurfaceTone/.test(shader.fragmentShader),'Soil detail multiplies the lit/tinted base colour, preserving evening colour and vertex shading');
 assert.ok(!/diffuseColor\.a\s*[+*/-]?=/.test(shader.fragmentShader),'The detail hook must preserve terrain and RGBA hill-edge alpha');
 for(const name of addedNames)assert.strictEqual(shader.uniforms[name].value,firstShader.uniforms[name].value);
 const key=material.customProgramCacheKey();assert.ok(key.includes('existing-terrain-regression-hook')&&key.includes(STEPPE_VERSION)&&key.includes('ukss-polygon')&&key.includes('museum-voids'));
 const hook=material.onBeforeCompile;installSteppeSurface(material,textures);assert.strictEqual(material.onBeforeCompile,hook,'Idempotence must also preserve hooks installed after soil');assert.equal(material.customProgramCacheKey(),key);
 polygonRoot.visible=false;siloRoot.visible=false;voids.update();
 assert.equal(shader.uniforms.museumVoid0Enabled.value,0);assert.equal(shader.uniforms.museumVoid1Circle.value.w,0,'Visibility remains linked to the live cutout uniforms');
 polygonRoot.visible=true;siloRoot.visible=true;voids.update();compositions++;
}
assert.ok(plain.color.equals(originalState.color));
for(const key of ['opacity','transparent','depthWrite','alphaTest','vertexColors','side','fog'])assert.equal(plain[key],originalState[key],`Installing detail must preserve ${key}`);
plain.color.multiply(new THREE.Color(0x53647f));const eveningColour=plain.color.clone();compile(plain);assert.ok(plain.color.equals(eveningColour),'Shader recompilation must not reset the evening tint');
assert.deepEqual(scene.children,originalChildren);assert.strictEqual(mesh.geometry,geometry);assert.deepEqual(geometry.index.array,indices);
for(const [name,array]of Object.entries(attributes))assert.deepEqual(geometry.attributes[name].array,array,'Surface detail must not add displacement or rebuild terrain geometry');
assert.equal(surface.stats().extraGeometry,0);assert.equal(surface.stats().materials,3,'Repeated apply must not count another material or texture set');
assert.equal(loaded.length,2,'Applying additional materials and clones must not load more texture images');
console.log('STEPPE_SURFACE_PASS',JSON.stringify({version:STEPPE_VERSION,fieldSamples:samples.length,fieldRanges:ranges,biomePixels:biomeProbes,cohortSizes:Object.fromEntries(Object.entries(cohorts).map(([name,values])=>[name,values.length])),meanColours,maxBoundaryJump,newUniforms:addedNames.length,sharedTextures:sharedTextures.length,compositions,cloneReinstalled:true,extraGeometry:surface.stats().extraGeometry}));
