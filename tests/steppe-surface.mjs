import assert from 'node:assert/strict';
import * as THREE from 'three';
import {STEPPE_VERSION,sampleSteppeFields,sampleSteppe} from '../src/steppe-field.js';
import {createSteppeSurface,createSatelliteProjection,createSatelliteUvCorrection,createSatelliteExtensionProjection,installSteppeSurface,STEPPE_BIOME_EXTENT,STEPPE_BIOME_RESOLUTION,STEPPE_SURFACE_VERSION} from '../src/steppe-surface.js';
import {maskUkssTerrain} from '../src/ukss-pad.js';
import {createTerrainVoids} from '../src/terrain-voids.js';

assert.equal(STEPPE_VERSION,'baikonur-steppe-v7');
assert.notEqual(STEPPE_SURFACE_VERSION,STEPPE_VERSION,'Material and fallback field revisions remain independent');
const near=(actual,expected,message,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<tolerance,`${message}: ${actual} != ${expected}`);
const northUp=createSatelliteProjection({worldToUv:[.005,0,.5,0,-.01,.5],featherWorld:10});
for(const [x,z,expected]of [[-100,-50,[0,1]],[100,-50,[1,1]],[100,50,[1,0]],[-100,50,[0,0]],[0,0,[.5,.5]]]){
 const {uv}=northUp.sample(x,z);uv.forEach((value,i)=>near(value,expected[i],'North-up image registration'));
}
assert.deepEqual(northUp.worldCorners,[[-100,-50],[100,-50],[100,50],[-100,50]]);
near(northUp.sample(0,0).coverage,1,'The image interior has full coverage');
near(northUp.sample(90,0).coverage,1,'A ten-world-unit feather ends ten units inside the edge');
near(northUp.sample(95,0).coverage,.5,'The edge feather uses world distance');
for(const [x,z]of [[100,0],[101,0],[-101,0],[0,-51],[0,51],[1e6,-1e6]])
 assert.equal(northUp.sample(x,z).coverage,0,'No photograph may extend beyond its actual image edges');
// These four surveyed fixture points define a rotated, sheared image. They
// are independent control points, not values obtained from the helper under test.
const affine=[.003,.004,.4,.002,-.004,.55],affineCorners=[[10,-107.5],[210,-7.5],[10,142.5],[-190,42.5]];
const registered=createSatelliteProjection({worldToUv:affine,featherWorld:10});
for(const [i,uv]of [[0,[0,1]],[1,[1,1]],[2,[1,0]],[3,[0,0]]]){
 const probe=registered.sample(...affineCorners[i]);
 uv.forEach((value,j)=>near(probe.uv[j],value,'Rotated/sheared control point'));
 registered.worldCorners[i].forEach((value,j)=>near(value,affineCorners[i][j],'Inverse registered corner'));
}
near(registered.sample(10,17.5).coverage,1,'A sheared image keeps its centre covered');
// The left-edge midpoint is (-90,-32.5); its inward unit normal is (.6,.8).
near(registered.sample(-87,-28.5).coverage,.5,'Five units along an oblique edge normal give half a ten-unit fade');
assert.equal(registered.sample(180,130).coverage,0,'Being inside the world AABB is insufficient outside a sheared image');
affine[0]=99;assert.equal(registered.worldToUv[0],.003,'Registration cannot be changed by mutating the input array');
for(const worldToUv of [[],[1,2,3,4,5],[1,2,3,4,5,NaN],[1,0,0,2,0,0],[0,0,0,0,0,0]])
 assert.throws(()=>createSatelliteProjection({worldToUv}),/registration|coefficients/);
for(const featherWorld of [0,-1,NaN,Infinity])assert.throws(()=>createSatelliteProjection({worldToUv:[.005,0,.5,0,-.01,.5],featherWorld}),/feather/);
assert.throws(()=>registered.sample(NaN,0),/finite world/);
await assert.rejects(()=>createSteppeSurface({satellite:{worldToUv:[.005,0,.5,0,-.01,.5]}}),/image URL/);

const surrounding={color:[161,136,109],darkColor:[139,118,94],lightColor:[190,166,134],featherWorld:720,edgeIrregularity:.3};
const wideProjection=createSatelliteProjection({worldToUv:[.00025,0,.5,0,-.00025,.5],featherWorld:260,surrounding});
assert.equal(wideProjection.featherWorld,720,'The optional broad transition overrides the original image feather');
assert.equal(wideProjection.sample(0,0).coverage,1,'The original photograph remains unchanged in the core');
assert.equal(wideProjection.sample(900,0).coverage,1,'The core extends beyond the maximum irregular feather width');
assert.equal(wideProjection.sample(2000,0).coverage,0);assert.equal(wideProjection.sample(2100,0).coverage,0);
const edgeA=wideProjection.sample(1500,0).coverage,edgeB=wideProjection.sample(1500,1000).coverage;
assert.ok(edgeA>0&&edgeA<1&&edgeB>0&&edgeB<1);
assert.ok(Math.abs(edgeA-edgeB)>.005,'The transition varies along the image edge instead of tracing a straight inset rectangle');
assert.ok(Math.abs(wideProjection.sample(1500.01,0).coverage-edgeA)<.001,'Irregular edge weights remain continuous');
for(const invalid of [{...surrounding,color:[256,0,0]},{...surrounding,color:[1,2]},
 {...surrounding,edgeIrregularity:.9},{...surrounding,featherWorld:0}])
 assert.throws(()=>createSatelliteProjection({worldToUv:[.005,0,.5,0,-.01,.5],surrounding:invalid}),/surrounding/);

// Four independent encoded control pixels check row orientation, the signed
// 128-centred range, confidence, and WebGL's half-texel linear interpolation.
const correctionBytes=new Uint8Array([128,128,255,255,255,128,255,255,128,255,0,255,1,1,128,255]);
const correctionConfig={width:2,height:2,data:correctionBytes,maxOffset:[.08,.08],provenance:{fixture:'four independent UV controls'}};
const correction=createSatelliteUvCorrection(correctionConfig);
for(const [uv,offset,confidence]of [[[.25,.25],[0,0],1],[[.75,.25],[.08,0],1],[[.25,.75],[0,.08],0],[[.75,.75],[-.08,-.08],128/255]]){
 const sample=correction.sample(...uv);sample.offset.forEach((value,i)=>near(value,offset[i],'Encoded correction control'));
 near(sample.confidence,confidence,'Encoded correction confidence');
}
near(correction.sample(.5,.25).offset[0],.04,'Linear filter between two texel centres');
correction.sample(.5,.5).offset.forEach(value=>near(value,0,'Four-control bilinear centre'));
near(correction.sample(.5,.5).confidence,159.5/255,'Confidence uses the same bilinear filter as offsets');
assert.deepEqual(correction.sample(-10,-10),correction.sample(.25,.25));
assert.deepEqual(correction.sample(10,10),correction.sample(.75,.75));
assert.equal(correction.texture.flipY,false);assert.equal(correction.texture.colorSpace,THREE.NoColorSpace);
assert.equal(correction.texture.minFilter,THREE.LinearFilter);assert.equal(correction.texture.magFilter,THREE.LinearFilter);
assert.equal(correction.texture.generateMipmaps,false);assert.equal(correction.texture.wrapS,THREE.ClampToEdgeWrapping);
assert.equal(correction.texture.wrapT,THREE.ClampToEdgeWrapping);
assert.equal(correction.stats().bytes,16);assert.equal(correction.stats().confidence.reducedPixels,2);
assert.deepEqual(correction.stats().provenance,correctionConfig.provenance);
correctionBytes[0]=0;near(correction.sample(.25,.25).offset[0],0,'Source buffers cannot mutate an installed registration');correctionBytes[0]=128;
for(const invalid of [{...correctionConfig,width:0},{...correctionConfig,data:new Uint8Array(3)},{...correctionConfig,maxOffset:[-1,.1]}])
 assert.throws(()=>createSatelliteUvCorrection(invalid),/correction/);
assert.throws(()=>correction.sample(Infinity,0),/finite UV/);

const expanded=createSatelliteExtensionProjection(northUp,{worldToUv:[.0025,0,.5,0,-.005,.5],featherWorld:10});
expanded.fromPrimaryUv.forEach((value,i)=>near(value,[.5,0,.25,0,.5,.25][i],'Original-to-extension affine relation'));
assert.equal(expanded.correctionFadeWorld,10);
const correctedCore={affineUv:[.5,.5],uv:[.58,.46],confidence:.4,affineCoverage:1,coverage:.4};
const expandedCore=expanded.sample(0,0,correctedCore);
near(expandedCore.uv[0],.54,'Primary U correction transfers to extension scale');
near(expandedCore.uv[1],.48,'Primary V correction transfers to extension scale');
near(expandedCore.confidence,.4,'The underlying extension shares primary confidence');
assert.equal(expandedCore.contributionWeight,0,'The primary core never reveals a lower-resolution duplicate');
const primaryOverlap=northUp.sample(95,0);
const expandedOverlap=expanded.sample(95,0,{...primaryOverlap,affineUv:primaryOverlap.uv,affineCoverage:primaryOverlap.coverage,
 confidence:.5,coverage:primaryOverlap.coverage*.5});
near(primaryOverlap.coverage*.5+expandedOverlap.contributionWeight,.5,'Layering two images must not increase shared confidence');
near(expandedOverlap.underlayCoverage,1/3,'Underlay mix preserves the exact shared-confidence contribution');
const unsupported=expanded.sample(0,0,{...correctedCore,confidence:0,coverage:0});
assert.equal(unsupported.coverage,0);assert.equal(unsupported.contributionWeight,0,'A rejected river cannot return from the extension');
const justOutside=northUp.sample(105,0);
const expandedBoundary=expanded.sample(105,0,{...justOutside,affineUv:justOutside.uv,uv:[justOutside.uv[0]+.08,justOutside.uv[1]-.04],confidence:0,affineCoverage:0});
near(expandedBoundary.correctionInfluence,.5,'Registration releases smoothly over world distance outside the original source');
near(expandedBoundary.confidence,.5,'Source confidence does not end at a hard rectangular boundary');
const farOutside=northUp.sample(130,0),expandedOutside=expanded.sample(130,0,{...farOutside,affineUv:farOutside.uv,
 uv:[farOutside.uv[0]+.08,farOutside.uv[1]-.04],confidence:0,affineCoverage:0});
assert.equal(expandedOutside.correctionInfluence,0);assert.equal(expandedOutside.coverage,1);
near(expandedOutside.uv[0],.825,'Uncorrected extension coordinates remain native outside the original registration');
assert.equal(expanded.sample(210,0).coverage,0);assert.equal(expanded.sample(40000,0).coverage,0,'An extension image never repeats');
const shearedExpansion=createSatelliteExtensionProjection(registered,{worldToUv:[.002,.002,.445,.00095,-.0024,.5325],featherWorld:10});
shearedExpansion.fromPrimaryUv.forEach((value,i)=>near(value,[.6,.1,.15,-.05,.55,.25][i],'Sheared original-to-extension relation'));
const shearedSample=shearedExpansion.sample(10,17.5,{affineUv:[.5,.5],uv:[.58,.46],confidence:1,affineCoverage:1,coverage:1});
near(shearedSample.uv[0],.544,'Transferred correction includes affine shear');near(shearedSample.uv[1],.474,'Transferred correction includes affine rotation');
assert.throws(()=>createSatelliteExtensionProjection(null,{worldToUv:[.0025,0,.5,0,-.005,.5]}),/primary registration/);
await assert.rejects(()=>createSteppeSurface({satellite:{url:'primary.jpg',worldToUv:[.005,0,.5,0,-.01,.5],extension:{worldToUv:[.0025,0,.5,0,-.005,.5]}}}),/extension requires an image URL/);
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
assert.equal(surface.stats().satellite,null,'The optional fallback must not claim to show a satellite image');
assert.equal(surface.satelliteAt(0,0),null);
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

const photoLoads=[],satelliteConfig={url:'https://museum.example/assets/terrain/satellite-fixture.jpg',
 worldToUv:[.003,.004,.4,.002,-.004,.55],featherWorld:10,source:'registered test control points',treatment:'one harmonized frame'};
let photoSurface;
try{
 THREE.TextureLoader.prototype.loadAsync=async function(url){
  const texture=new THREE.DataTexture(new Uint8Array(64*32*4).fill(128),64,32,THREE.RGBAFormat);
  photoLoads.push({url,texture});return texture;
 };
 photoSurface=await createSteppeSurface({renderer:{capabilities:{getMaxAnisotropy:()=>16}},satellite:satelliteConfig});
}finally{THREE.TextureLoader.prototype.loadAsync=originalLoad;}
assert.equal(photoLoads.length,3,'The optional image is loaded once, together with the two detail maps');
const photoTexture=photoLoads.find(item=>item.url===satelliteConfig.url).texture;
assert.equal(photoTexture.colorSpace,THREE.SRGBColorSpace,'Photographic color is not scalar NoColorSpace data');
assert.equal(photoTexture.wrapS,THREE.ClampToEdgeWrapping);assert.equal(photoTexture.wrapT,THREE.ClampToEdgeWrapping);
assert.equal(photoTexture.flipY,true,'Image top is v=1, including when the loader fixture is a DataTexture');
assert.equal(photoTexture.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(photoTexture.magFilter,THREE.LinearFilter);
assert.equal(photoTexture.generateMipmaps,true);assert.equal(photoTexture.anisotropy,8);
const photoMaterial=new THREE.MeshBasicMaterial({...options,map:new THREE.Texture()});
const photoState={color:photoMaterial.color.clone(),opacity:photoMaterial.opacity,transparent:photoMaterial.transparent,
 depthWrite:photoMaterial.depthWrite,alphaTest:photoMaterial.alphaTest,vertexColors:photoMaterial.vertexColors,side:photoMaterial.side,fog:photoMaterial.fog,map:photoMaterial.map};
photoSurface.apply(photoMaterial);const photoShader=compile(photoMaterial),photoHook=photoMaterial.onBeforeCompile;
assert.equal(photoShader.uniforms.steppeSatellite.value,photoTexture);
assert.equal(photoShader.uniforms.steppeSatelliteEdges.value.w,0,'Neutral hill vertex shading remains enabled by default');
const matrix=photoShader.uniforms.steppeSatelliteTransform.value;
for(const [i,uv]of [[0,[0,1]],[1,[1,1]],[2,[1,0]],[3,[0,0]]]){
 const actual=new THREE.Vector3(...affineCorners[i],1).applyMatrix3(matrix);
 near(actual.x,uv[0],'GPU matrix U at an independently specified control point');
 near(actual.y,uv[1],'GPU matrix V at an independently specified control point');near(actual.z,1,'Affine homogeneous coordinate');
}
near(photoShader.uniforms.steppeSatelliteEdges.value.x,.005,'U-edge distance conversion');
near(photoShader.uniforms.steppeSatelliteEdges.value.y,Math.sqrt(.00002),'V-edge distance conversion');
assert.equal(photoShader.uniforms.steppeSatelliteEdges.value.z,10);
assert.ok(photoShader.fragmentShader.indexOf('diffuseColor.rgb=mix(diffuseColor.rgb,steppePhotoBase,steppePhoto.z)')<photoShader.fragmentShader.indexOf('#include <color_fragment>'),
 'The shared image replaces base RGB before existing vertex shading');
assert.ok(photoShader.fragmentShader.includes('steppePhotoBase=diffuse*texture2D(steppeSatellite,steppePhoto.xy).rgb'),
 'The image retains the existing material/evening tint');
assert.ok(!/if\s*\(\s*steppePhoto\.z/.test(photoShader.fragmentShader),
 'Coverage must not put texture samples or derivative helpers in nonuniform control flow');
assert.ok(photoShader.fragmentShader.includes('mix(steppeSurfaceTone(vSteppeWorld.xz),steppeSatelliteMicroTone(vSteppeWorld.xz),steppePhoto.z)'),
 'Full image coverage suppresses the unrelated broad procedural pattern');
assert.ok(!/diffuseColor\.a\s*[+*/-]?=/.test(photoShader.fragmentShader),'Image treatment must not write terrain alpha');
assert.equal(photoMaterial.userData.steppeSurface.satellite,true);assert.equal(plain.userData.steppeSurface.satellite,false);
assert.ok(photoMaterial.customProgramCacheKey().includes(STEPPE_SURFACE_VERSION));
assert.notEqual(photoMaterial.customProgramCacheKey(),plain.customProgramCacheKey(),'Photographic and generated shaders cannot share a program key');
photoSurface.apply(photoMaterial);assert.strictEqual(photoMaterial.onBeforeCompile,photoHook);
const photoClone=photoMaterial.clone();photoSurface.apply(photoClone);const photoCloneShader=compile(photoClone);
assert.strictEqual(photoCloneShader.uniforms.steppeSatellite.value,photoTexture,'A cloned hill reuses the actual image texture');
assert.equal(photoCloneShader.fragmentShader,photoShader.fragmentShader);assert.equal(photoCloneShader.vertexShader,photoShader.vertexShader);
assert.equal(photoClone.customProgramCacheKey(),photoMaterial.customProgramCacheKey());

const island=new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true});photoSurface.apply(island,{ignoreVertexColor:true});
const islandShader=compile(island);
assert.strictEqual(islandShader.uniforms.steppeSatellite.value,photoTexture);
assert.equal(islandShader.uniforms.steppeSatelliteEdges.value.w,1);
assert.ok(islandShader.fragmentShader.includes('steppePhotoBase*steppePhoto.z*(vec3(1.0)-vColor.rgb)*steppeSatelliteEdges.w'),
 'Only photographic RGB cancels the old island color; original terrain RGB still supplies the outer feather');
assert.ok(islandShader.fragmentShader.includes('#include <color_fragment>'),'The standard color chunk still applies any RGBA vertex alpha');
assert.equal(island.vertexColors,true,'Do not lose vertex alpha by changing the Three material flag');
const islandClone=island.clone();photoSurface.apply(islandClone);
assert.equal(compile(islandClone).uniforms.steppeSatelliteEdges.value.w,1,'The island override survives material cloning and hook reinstallation');
const islandHook=island.onBeforeCompile,islandProgram=island.customProgramCacheKey();
photoSurface.apply(island,{ignoreVertexColor:false});assert.strictEqual(island.onBeforeCompile,islandHook);
assert.equal(island.customProgramCacheKey(),islandProgram,'Changing the vertex-color override needs only a uniform update');
assert.equal(islandShader.uniforms.steppeSatelliteEdges.value.w,0);assert.equal(island.userData.steppeSurface.ignoreVertexColor,false);
assert.throws(()=>photoSurface.apply(island,{ignoreVertexColor:'yes'}),/boolean/);

let photoCompositions=0;
for(const order of ['soil-first','soil-last']){
 const material=new THREE.MeshBasicMaterial(options);let priorCalls=0;
 material.customProgramCacheKey=()=> 'existing-photo-terrain-hook';
 material.onBeforeCompile=function(shader){
  priorCalls++;shader.uniforms.originalTerrainStrength={value:.9};
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float originalTerrainStrength;')
   .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=originalTerrainStrength;');
 };
 if(order==='soil-first')photoSurface.apply(material);
 maskUkssTerrain(material,ukssOrigin,.14,cutoutEnabled,ukssPolygon);voids.mask(material);
 if(order==='soil-last')photoSurface.apply(material);
 const shader=compile(material);assert.equal(priorCalls,1);
 assert.equal((shader.fragmentShader.match(/\bdiscard\s*;/g)||[]).length,3,'Image color preserves the UKSS, polygon and silo excavations');
 assert.strictEqual(shader.uniforms.ukssCutoutEnabled,cutoutEnabled);assert.strictEqual(shader.uniforms.steppeSatellite.value,photoTexture);
 assert.ok(shader.fragmentShader.includes('diffuseColor.rgb*=originalTerrainStrength;'),'Earlier color hooks remain composed');
 for(const chunk of ['map_fragment','color_fragment','alphamap_fragment','alphatest_fragment','clipping_planes_fragment','logdepthbuf_fragment','fog_fragment','tonemapping_fragment','colorspace_fragment'])
  assert.equal(shader.fragmentShader.split(`#include <${chunk}>`).length-1,1,`Photographic soil preserves ${chunk} once`);
 assert.ok(!/diffuseColor\.a\s*[+*/-]?=/.test(shader.fragmentShader),'Image/cutout composition does not rewrite opacity');
 const key=material.customProgramCacheKey();
 assert.ok(key.includes('existing-photo-terrain-hook')&&key.includes(STEPPE_SURFACE_VERSION)&&key.includes('ukss-polygon')&&key.includes('museum-voids'));
 photoCompositions++;
}
assert.ok(photoMaterial.color.equals(photoState.color));
for(const key of ['opacity','transparent','depthWrite','alphaTest','vertexColors','side','fog','map'])
 assert.equal(photoMaterial[key],photoState[key],`Photographic soil preserves ${key}`);
photoMaterial.color.multiply(new THREE.Color(0x53647f));const photoEvening=photoMaterial.color.clone();compile(photoMaterial);
assert.ok(photoMaterial.color.equals(photoEvening),'Photographic shader recompilation preserves evening material tint');
assert.deepEqual(scene.children,originalChildren);assert.deepEqual(geometry.index.array,indices);
for(const [name,array]of Object.entries(attributes))assert.deepEqual(geometry.attributes[name].array,array);
assert.equal(photoLoads.length,3,'Clones and additional surfaces do not load another image');
const photoStats=photoSurface.stats();assert.equal(photoStats.extraGeometry,0);assert.equal(photoStats.surfaceVersion,STEPPE_SURFACE_VERSION);
assert.equal(photoStats.satellite.sharedTexture,true);assert.equal(photoStats.satellite.repeat,false);
assert.equal(photoStats.satellite.source,satelliteConfig.source);assert.equal(photoStats.satellite.treatment,satelliteConfig.treatment);
assert.equal(photoStats.satellite.alphaSource,'existing terrain');assert.deepEqual(photoStats.satellite.resolution,[64,32]);
assert.deepEqual(photoStats.satellite.worldToUv,satelliteConfig.worldToUv);
assert.deepEqual(photoSurface.satelliteAt(180,130),registered.sample(180,130));
assert.equal(photoStats.satellite.surrounding,null);assert.equal(photoStats.satellite.uvCorrection,null);

const blendedLoads=[];let blendedSurface;
try{
 THREE.TextureLoader.prototype.loadAsync=async function(url){
  const texture=new THREE.DataTexture(new Uint8Array(4*4*4).fill(128),4,4,THREE.RGBAFormat);blendedLoads.push({url,texture});return texture;
 };
 blendedSurface=await createSteppeSurface({satellite:{...satelliteConfig,worldToUv:[.00025,0,.5,0,-.00025,.5],surrounding,uvCorrection:correctionConfig}});
}finally{THREE.TextureLoader.prototype.loadAsync=originalLoad;}
assert.equal(blendedLoads.length,3,'The numerical UV correction does not trigger another image request');
const blendedMaterial=new THREE.MeshBasicMaterial(options);blendedSurface.apply(blendedMaterial,{ignoreVertexColor:true});
maskUkssTerrain(blendedMaterial,ukssOrigin,.14,cutoutEnabled,ukssPolygon);voids.mask(blendedMaterial);
const blendedShader=compile(blendedMaterial),blendedStats=blendedSurface.stats();
assert.equal((blendedShader.fragmentShader.match(/\bdiscard\s*;/g)||[]).length,3,'Blended surroundings preserve every excavation');
assert.ok(blendedShader.fragmentShader.includes('diffuseColor.rgb=diffuse*steppeSatelliteSurrounding(vSteppeWorld.xz);'),
 'The outer surface replaces the contrasting old ground palette');
assert.ok(blendedShader.fragmentShader.includes('vec3 steppeTone=steppeSatelliteMicroTone(vSteppeWorld.xz);'),
 'The old cream macro mottles do not reappear in the surrounding earth');
assert.ok(blendedShader.fragmentShader.includes('diffuseColor.rgb+=steppeSurfaceBase*(vec3(1.0)-vColor.rgb)*steppeSatelliteEdges.w;'),
 'Island vertex RGB cannot darken either the photograph or its continued earth palette');
assert.ok(blendedShader.fragmentShader.includes('steppePhoto=steppeCorrectSatelliteUv(steppePhoto);'));
assert.ok(blendedShader.fragmentShader.indexOf('steppePhoto=steppeCorrectSatelliteUv(steppePhoto);')<
 blendedShader.fragmentShader.indexOf('steppePhotoBase=diffuse*texture2D(steppeSatellite,steppePhoto.xy).rgb'),
 'UV correction and confidence are applied before the image is sampled');
assert.ok(blendedShader.fragmentShader.includes('projected.z*correction.b'),'Local confidence multiplies image coverage');
assert.ok(!/diffuseColor\.a\s*[+*/-]?=/.test(blendedShader.fragmentShader),'Surrounding and correction color cannot change terrain opacity');
assert.equal(blendedShader.uniforms.steppeSatelliteEdges.value.z,720);
near(blendedShader.uniforms.steppeSatelliteEdgeIrregularity.value,.3,'Configured irregularity reaches the shader');
const expectedSoil=new THREE.Color().setRGB(161/255,136/255,109/255,THREE.SRGBColorSpace);
assert.ok(blendedShader.uniforms.steppeSatelliteSoilColor.value.equals(expectedSoil),'Source-derived sRGB soil is converted to linear shader color once');
assert.ok(blendedShader.uniforms.steppeSatelliteCorrection.value.isDataTexture);
assert.deepEqual(blendedShader.uniforms.steppeSatelliteOffsetRange.value.toArray(),[.08,.08]);
const blendedClone=blendedMaterial.clone();blendedSurface.apply(blendedClone);
assert.strictEqual(compile(blendedClone).uniforms.steppeSatelliteCorrection.value,blendedShader.uniforms.steppeSatelliteCorrection.value,
 'UV registration is shared by material clones');
assert.equal(blendedStats.satellite.projection,'world-xz-affine-with-uv-correction');
assert.deepEqual(blendedStats.satellite.surrounding.color,surrounding.color);
assert.equal(blendedStats.satellite.uvCorrection.bytes,16);
assert.deepEqual(blendedStats.satellite.uvCorrection.provenance,correctionConfig.provenance);
assert.deepEqual(blendedSurface.satelliteAt(-1000,1000),{uv:[.25,.25],affineUv:[.25,.25],offset:[0,0],confidence:1,affineCoverage:1,coverage:1});
const lowConfidence=blendedSurface.satelliteAt(-1000,-1000);
assert.deepEqual(lowConfidence.affineUv,[.25,.75]);near(lowConfidence.uv[1],.83,'Corrected V is exposed for QA');
assert.equal(lowConfidence.affineCoverage,1);assert.equal(lowConfidence.confidence,0);assert.equal(lowConfidence.coverage,0);
assert.equal(blendedSurface.satelliteAt(2500,0).coverage,0,'An offset cannot extend the image beyond the original footprint');
assert.equal(blendedStats.extraGeometry,0);
blendedMaterial.color.set(0x53647f);const blendedNight=blendedMaterial.color.clone();compile(blendedMaterial);
assert.ok(blendedMaterial.color.equals(blendedNight),'Continued earth keeps evening tint');
assert.deepEqual(geometry.index.array,indices);
for(const [name,array]of Object.entries(attributes))assert.deepEqual(geometry.attributes[name].array,array);
assert.equal(blendedStats.satellite.extension,null,'Existing configurations must not claim an extension image');

const extensionConfig={url:'https://museum.example/assets/terrain/extension.jpg',worldToUv:[.000125,0,.5,0,-.000125,.5],
 featherWorld:640,source:'generated outer landscape',treatment:'registered to retained central image'};
const extensionLoads=[];let extendedSurface;
try{
 THREE.TextureLoader.prototype.loadAsync=async function(url){
  const texture=new THREE.DataTexture(new Uint8Array(8*4*4).fill(128),8,4,THREE.RGBAFormat);extensionLoads.push({url,texture});return texture;
 };
 extendedSurface=await createSteppeSurface({renderer:{capabilities:{getMaxAnisotropy:()=>16}},satellite:{...satelliteConfig,
  worldToUv:[.00025,0,.5,0,-.00025,.5],surrounding,uvCorrection:correctionConfig,extension:extensionConfig}});
}finally{THREE.TextureLoader.prototype.loadAsync=originalLoad;}
assert.equal(extensionLoads.length,4,'The extension adds exactly one shared image request');
const extensionTexture=extensionLoads.find(item=>item.url===extensionConfig.url).texture;
assert.equal(extensionTexture.colorSpace,THREE.SRGBColorSpace);assert.equal(extensionTexture.flipY,true);
assert.equal(extensionTexture.wrapS,THREE.ClampToEdgeWrapping);assert.equal(extensionTexture.wrapT,THREE.ClampToEdgeWrapping);
assert.equal(extensionTexture.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(extensionTexture.magFilter,THREE.LinearFilter);
assert.equal(extensionTexture.generateMipmaps,true);assert.equal(extensionTexture.anisotropy,8);
const extendedMaterial=new THREE.MeshBasicMaterial(options);extendedSurface.apply(extendedMaterial,{ignoreVertexColor:true});
maskUkssTerrain(extendedMaterial,ukssOrigin,.14,cutoutEnabled,ukssPolygon);voids.mask(extendedMaterial);
const extendedShader=compile(extendedMaterial);
assert.strictEqual(extendedShader.uniforms.steppeSatelliteExtension.value,extensionTexture);
const primaryToExtension=extendedShader.uniforms.steppeSatelliteExtensionFromPrimary.value;
const transferred=new THREE.Vector3(.58,.46,1).applyMatrix3(primaryToExtension);
near(transferred.x,.54,'Extension shader receives the primary affine transfer');near(transferred.y,.48,'Extension shader preserves V orientation');
assert.equal(extendedShader.uniforms.steppeSatelliteExtensionEdges.value.z,640);
assert.equal(extendedShader.uniforms.steppeSatelliteExtensionCorrectionFade.value,160);
assert.ok(extendedShader.fragmentShader.indexOf('diffuseColor.rgb=mix(diffuseColor.rgb,steppeExtensionBase,steppeExtensionBlend);')<
 extendedShader.fragmentShader.indexOf('diffuseColor.rgb=mix(diffuseColor.rgb,steppePhotoBase,steppePhoto.z);'),
 'The original detailed image stays above the registered outpaint');
assert.ok(extendedShader.fragmentShader.includes('steppeExtendedPhoto.z*(1.0-steppeAffinePhoto.z)'),
 'The extension occupies the original geometric feather, not its rejected river regions');
assert.ok(extendedShader.fragmentShader.includes('float confidence=mix(1.0,correction.z,influence);'),
 'Both image layers share confidence inside the original footprint');
assert.ok(!/if\s*\(\s*steppe(Photo|ExtendedPhoto)\./.test(extendedShader.fragmentShader),'Image derivatives remain outside coverage branches');
assert.ok(!/diffuseColor\.a\s*[+*/-]?=/.test(extendedShader.fragmentShader),'The extra image cannot rewrite existing alpha');
assert.equal((extendedShader.fragmentShader.match(/\bdiscard\s*;/g)||[]).length,3,'The outpaint retains every excavation');
const extendedClone=extendedMaterial.clone();extendedSurface.apply(extendedClone);
assert.strictEqual(compile(extendedClone).uniforms.steppeSatelliteExtension.value,extensionTexture,'The outpaint texture is shared by cloned hills');
assert.equal(extensionLoads.length,4,'Material clones never refetch the outpaint');
assert.ok(extendedMaterial.customProgramCacheKey().includes('|extension'));
const extendedStats=extendedSurface.stats();
assert.deepEqual(extendedStats.satellite.extension.resolution,[8,4]);assert.equal(extendedStats.satellite.extension.source,extensionConfig.source);
assert.equal(extendedStats.satellite.extension.treatment,extensionConfig.treatment);
assert.equal(extendedStats.satellite.extension.primaryCorePreserved,true);assert.equal(extendedStats.satellite.extension.repeat,false);
assert.deepEqual(extendedStats.satellite.extension.worldToUv,extensionConfig.worldToUv);
const oldCore=blendedSurface.satelliteAt(-1000,1000),newCore=extendedSurface.satelliteAt(-1000,1000);
for(const key of Object.keys(oldCore))assert.deepEqual(newCore[key],oldCore[key],`Extension does not change primary sample ${key}`);
assert.equal(newCore.extension.contributionWeight,0,'The high-resolution original core fully replaces the extension');
const rejectedRiver=extendedSurface.satelliteAt(-1000,-1000);
assert.equal(rejectedRiver.coverage,0);assert.equal(rejectedRiver.extension.coverage,0);
assert.equal(rejectedRiver.extension.contributionWeight,0,'Original zero-confidence branches reveal soil in both layers');
const addedLandscape=extendedSurface.satelliteAt(2800,0);
assert.equal(addedLandscape.coverage,0);assert.equal(addedLandscape.extension.coverage,1);
assert.equal(addedLandscape.extension.contributionWeight,1,'New landscape appears beyond the original frame');
assert.equal(extendedSurface.satelliteAt(5000,0).extension.coverage,0,'The outermost image feathers into surrounding earth');
assert.equal(extendedStats.extraGeometry,0);
extendedMaterial.color.set(0x53647f);const extendedNight=extendedMaterial.color.clone();compile(extendedMaterial);
assert.ok(extendedMaterial.color.equals(extendedNight),'The extension retains the shared evening tint');
for(const key of ['opacity','transparent','depthWrite','alphaTest','vertexColors','side','fog'])assert.equal(extendedMaterial[key],options[key]);
assert.deepEqual(geometry.index.array,indices);for(const [name,array]of Object.entries(attributes))assert.deepEqual(geometry.attributes[name].array,array);
console.log('STEPPE_SURFACE_PASS',JSON.stringify({version:STEPPE_VERSION,surfaceVersion:STEPPE_SURFACE_VERSION,fieldSamples:samples.length,fieldRanges:ranges,biomePixels:biomeProbes,cohortSizes:Object.fromEntries(Object.entries(cohorts).map(([name,values])=>[name,values.length])),meanColours,maxBoundaryJump,newUniforms:addedNames.length,sharedTextures:sharedTextures.length,compositions,photoCompositions,photoLoads:photoLoads.length,photoSharedMaterials:photoStats.materials,affineControlPoints:4,correctionControls:4,extensionLoads:extensionLoads.length,surroundingCorePreserved:true,cloneReinstalled:true,extraGeometry:surface.stats().extraGeometry}));
