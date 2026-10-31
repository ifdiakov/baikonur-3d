#!/usr/bin/env node
// Recover with source-models/rockets/bdf_to_glb.py first. This stage operates
// in physical metres and bounds simplification error per authored component.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {BufferGeometry,BufferAttribute} from 'three';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
assert.ok(args.source&&args.output&&args.id,'Required: --source recovered.glb --output directory --id model-id --deps node_modules');
const dep=(name,file)=>import(args.deps?pathToFileURL(resolve(args.deps,name,file)).href:name);
const {NodeIO,Logger}=await dep('@gltf-transform/core','dist/index.js');
const {ALL_EXTENSIONS}=await dep('@gltf-transform/extensions','dist/index.js');
const {join,weld,prune,dedup,palette,meshopt,simplifyPrimitive}=await dep('@gltf-transform/functions','dist/index.js');
const {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier}=await dep('meshoptimizer','index.module.js');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const input=await readFile(args.source),source=JSON.parse(await readFile(args.source+'.json','utf8'));
const doc=await io.readBinary(input);doc.setLogger(new Logger(Logger.Verbosity.ERROR));
const root=doc.getRoot();
const policy={maximumSurfaceErrorMetres:Number(args.error||.02),tinyComponentMaximumDimensionMetres:.08,targetRatio:.08};
const count=p=>(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
const rebuildNormals=args.id!=='soyuz';
const optimization={...policy,normalCreaseAngleDegrees:rebuildNormals?45:null,removedTinyComponents:0,removedTinyTriangles:0,simplifiedPrimitives:0,trianglesRemovedBySimplification:0};
// The legacy STL-derived Energia objects mark every small triangle as a hard
// face. These artificial seams prevent decimation. Rebuild physical creases
// after geometric simplification; keep all texture seams throughout.
if(rebuildNormals)for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives())p.setAttribute('NORMAL',null);
await doc.transform(weld());
for(const node of root.listNodes()){
 const mesh=node.getMesh();if(!mesh)continue;
 for(const primitive of mesh.listPrimitives()){
  const positions=primitive.getAttribute('POSITION'),array=positions.getArray(),range=MeshoptSimplifier.getScale(array,3),before=count(primitive);
  if(range<policy.tinyComponentMaximumDimensionMetres){
   optimization.removedTinyComponents++;optimization.removedTinyTriangles+=before;mesh.removePrimitive(primitive);continue;
  }
  if(before<32)continue;
  simplifyPrimitive(primitive,{simplifier:MeshoptSimplifier,ratio:policy.targetRatio,error:policy.maximumSurfaceErrorMetres/range,lockBorder:false});
  const after=count(primitive);assert.ok(after>0,'A visible assembly cannot disappear');
  if(after<before){optimization.simplifiedPrimitives++;optimization.trianglesRemovedBySimplification+=before-after;}
 }
}
if(rebuildNormals)for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives()){
 const geometry=new BufferGeometry();
 for(const [semantic,name,width]of [['POSITION','position',3],['TEXCOORD_0','uv',2]]){
  const attr=p.getAttribute(semantic);if(attr)geometry.setAttribute(name,new BufferAttribute(attr.getArray(),width));
 }
 geometry.setIndex(new BufferAttribute(p.getIndices().getArray(),1));
 const smoothed=toCreasedNormals(geometry,Math.PI/4),buffer=root.listBuffers()[0];
 for(const [semantic,name,type]of [['POSITION','position','VEC3'],['NORMAL','normal','VEC3'],['TEXCOORD_0','uv','VEC2']]){
  const attr=smoothed.getAttribute(name);if(attr)p.setAttribute(semantic,doc.createAccessor().setType(type).setArray(attr.array).setBuffer(buffer));
 }
 const index=new Uint32Array(smoothed.getAttribute('position').count);for(let i=0;i<index.length;i++)index[i]=i;
 p.setIndices(doc.createAccessor().setType('SCALAR').setArray(index).setBuffer(buffer));
 geometry.dispose();if(smoothed!==geometry)smoothed.dispose();
}
const layerStats={};
for(const node of root.listNodes()){
 const n=node.getMesh()?.listPrimitives().reduce((n,p)=>n+count(p),0)||0;if(!n)continue;
 const layer=node.getExtras().sourceLayer;layerStats[layer]=(layerStats[layer]||0)+n;
}
for(const [layer,n]of Object.entries(source.layers))assert.ok(layerStats[layer]>0,'No source assembly layer may vanish: '+layer);
await doc.transform(prune(),palette({min:3}),dedup(),join({keepNamed:false}),weld(),prune());
for(const node of root.listNodes())node.setExtras({});
for(const mesh of root.listMeshes())mesh.setName(args.id+' · source geometry').setExtras({});
const scene=root.getDefaultScene()||root.listScenes()[0];
scene.setExtras({museumAsset:args.id,unit:'metre',sourceFile:source.sourceFile,sourceSha256:source.sourceSha256});
await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
const bytes=await io.writeBinary(doc),decoded=await io.readBinary(bytes),outRoot=decoded.getRoot();
let triangles=0,vertices=0,primitives=0;const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
for(const node of outRoot.listNodes()){
 const matrix=node.getWorldMatrix();
 for(const p of node.getMesh()?.listPrimitives()||[]){
  primitives++;triangles+=count(p);const pos=p.getAttribute('POSITION'),v=[];vertices+=pos.getCount();
  for(let i=0;i<pos.getCount();i++){
   pos.getElement(i,v);const point=[0,1,2].map(j=>matrix[j]*v[0]+matrix[4+j]*v[1]+matrix[8+j]*v[2]+matrix[12+j]);
   assert.ok(point.every(Number.isFinite));point.forEach((v,j)=>{bounds.min[j]=Math.min(bounds.min[j],v);bounds.max[j]=Math.max(bounds.max[j],v);});
  }
 }
}
bounds.size=bounds.max.map((v,i)=>v-bounds.min[i]);
for(let i=0;i<3;i++)assert.ok(Math.abs(bounds.size[i]-source.bounds.size[i])<.12,'Optimization changed silhouette bounds');
assert.equal(triangles,source.selectedTriangles-optimization.removedTinyTriangles-optimization.trianglesRemovedBySimplification);
const sha=b=>createHash('sha256').update(b).digest('hex');
const credits={
 'soyuz':{authors:['Владимир Некрасов'],driveId:'187i3huuRDscAv_EV_qPPju1lCV76IPsB'},
 'energia-polyus':{authors:['Николай Назаренко'],driveId:'1L-N4yRUww2eLj1UF29TAQUMyRY_cqEC8'},
 'energia':{authors:['Николай Назаренко'],driveId:'1L-N4yRUww2eLj1UF29TAQUMyRY_cqEC8'},
 'energia-buran':{authors:['Николай Назаренко','Владимир Малюх'],driveId:'1MUcaqTuvInvk5kJQ0kubEb7RSUY41Zrt'},
 'energia-m':{authors:['Михаил Павлов'],driveId:'1zsiqcOST0YZOPX5cmNPq6E6ILWccBwAx'},
}[args.id];
assert(credits,'A recovered model needs an explicit source attribution');
const manifest={version:'rocket-exhibits-v1',id:args.id,source,assetSha256:sha(bytes),recoverySha256:sha(input),
 assetStats:{bytes:bytes.byteLength,triangles,vertices,primitives,materials:outRoot.listMaterials().length,textures:outRoot.listTextures().length},
 optimization,layerStats,bounds,normalization:{unit:'metre',up:'+Y',baseY:0,uniformSourceUnitMetres:source.sourceUnitMetres,originMetres:source.originMetres},
 attribution:{authors:credits.authors,sourceUrl:'http://buran.ru/htm/3d-model.htm',archive:'http://www.buran.ru/htm/3d-model.htm',
  driveUrl:'https://drive.google.com/file/d/'+credits.driveId+'/view',providedBy:'Project owner / Google Drive',
  licenseNote:'Авторская модель из архива buran.ru; файл предоставлен владельцем проекта. Открытая лицензия не заявляется.'}};
await mkdir(args.output,{recursive:true});
await writeFile(resolve(args.output,args.id+'.glb'),bytes);
await writeFile(resolve(args.output,args.id+'.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({id:args.id,...manifest.assetStats,optimization,bounds}));
