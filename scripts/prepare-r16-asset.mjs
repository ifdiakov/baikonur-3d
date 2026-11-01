#!/usr/bin/env node
// Assemble the owner's printing meshes by their measured sockets, retaining
// the authored exterior. Inputs stay on Drive; identity and transforms are
// recorded alongside this script's deterministic, self-contained GLB output.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {BufferGeometry,BufferAttribute,Color} from 'three';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {NodeIO,Document,Logger} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,weld,prune,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';

const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
assert.ok(args.source,'Usage: node scripts/prepare-r16-asset.mjs --source /path/to/owner-STLs [--preview /tmp/r16-uncompressed.glb]');
const rootPath=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(args.output||resolve(rootPath,'assets/models/rockets'));
const contract=JSON.parse(await readFile(resolve(rootPath,'scripts/source-models/rockets/r16-assembly.json'),'utf8'));
const sources=JSON.parse(await readFile(resolve(rootPath,'scripts/source-models/rockets/r16-source.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const toMetres=.1,baseShift=5;
const doc=new Document(),buffer=doc.createBuffer();doc.setLogger(new Logger(Logger.Verbosity.ERROR));
const scene=doc.createScene('Р-16 · 8К64');doc.getRoot().setDefaultScene(scene);
scene.setExtras({museumAsset:'r16',unit:'metre',sourceFolder:sources.folder,configuration:'light'});
const rgba=hex=>[...new Color(hex).toArray(),1];
const material=(name,color,metal,rough)=>doc.createMaterial(name).setBaseColorFactor(rgba(color)).setMetallicFactor(metal).setRoughnessFactor(rough);
const materials={
 paint:material('Оливковая эмаль','#5c6446',.08,.76),
 fairing:material('Обтекатели и наружные каналы','#535d3e',.08,.8),
 metal:material('Металл сопел','#838579',.72,.48),
 inner:material('Внутренняя поверхность сопел','#30352d',.48,.78)
};
const inputs=new Map();
for(const source of sources.files){
 const bytes=await readFile(resolve(args.source,source.name));
 assert.equal(bytes.length,source.bytes,source.name+' size');assert.equal(sha(bytes),source.sha256,source.name+' source identity');
 assert.equal(bytes.readUInt32LE(80),source.triangles);assert.equal(bytes.length,84+source.triangles*50);
 inputs.set(source.name,bytes);
}

const assembly=[],geometryBySource=new Map();let removedPinTriangles=0,sourceInstanceTriangles=0;
function geometry(file,{axisXZ,yMin=0,engine=false,pinY=null}={}){
 if(geometryBySource.has(file))return geometryBySource.get(file);
 const bytes=inputs.get(file),count=bytes.readUInt32LE(80),groups=new Map();let removed=0;
 for(let f=0;f<count;f++){
  const vertex=[];for(let k=0;k<3;k++)vertex.push([0,1,2].map(a=>bytes.readFloatLE(84+50*f+12+12*k+4*a)));
  assert.ok(vertex.flat().every(Number.isFinite));
  // The straight pins above the bell neck belong to printing assembly, not
  // the displayed engine surface. All clip planes coincide with STL rings.
  if(pinY!==null&&vertex.some(v=>v[1]>pinY+1e-5)){removed++;continue;}
  const v=vertex.map(p=>[(p[0]-axisXZ[0])*toMetres,(p[1]-yMin)*toMetres,(p[2]-axisXZ[1])*toMetres]);
  const a=v[1].map((x,j)=>x-v[0][j]),b=v[2].map((x,j)=>x-v[0][j]);
  const normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  assert.ok(Math.hypot(...normal)>1e-13,file+' degenerate triangle');
  const centre=[0,1,2].map(j=>v.reduce((s,p)=>s+p[j],0)/3),r=Math.hypot(centre[0],centre[2]);
  const radial=normal[0]*centre[0]+normal[2]*centre[2];
  let key='paint';
  if(engine)key=radial<0?'inner':'metal';
  else if(file.includes('stage 1 pr1')&&r>1.51)key='fairing';
  else if(file.includes('stage 2 pr1')&&r>1.26)key='fairing';
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(...v.flat());
 }
 const mesh=doc.createMesh(file.replace(/\.STL$/i,''));
 for(const [key,positions]of groups){
  const source=new BufferGeometry().setAttribute('position',new BufferAttribute(new Float32Array(positions),3));
  const smoothed=toCreasedNormals(source,Math.PI/5);
  const primitive=doc.createPrimitive().setMaterial(materials[key]);
  for(const [semantic,name]of [['POSITION','position'],['NORMAL','normal']]){
   primitive.setAttribute(semantic,doc.createAccessor(file+' '+semantic).setBuffer(buffer).setType('VEC3').setArray(smoothed.getAttribute(name).array));
  }
  mesh.addPrimitive(primitive);source.dispose();if(smoothed!==source)smoothed.dispose();
 }
 const result={mesh,triangles:count-removed,removed};geometryBySource.set(file,result);return result;
}
function addPart(file,axisXZ,yMin,translation,yawDegrees,options={}){
 const g=geometry(file,{axisXZ,yMin,...options}),a=yawDegrees*Math.PI/180;
 const node=doc.createNode(options.name||file.replace(/\.STL$/i,'')).setMesh(g.mesh)
  .setTranslation(translation.map(x=>x*toMetres)).setRotation([0,Math.sin(a/2),0,Math.cos(a/2)]);
 node.setExtras({sourceFile:file,stage:options.stage,component:options.engine?'engine-bell':'shell'});scene.addChild(node);
 assembly.push({name:node.getName(),file,sourceAxisXZ:axisXZ,sourceYMin:yMin,translationMetres:node.getTranslation(),yawDegrees,triangles:g.triangles,removedPinTriangles:g.removed});
 removedPinTriangles+=g.removed;sourceInstanceTriangles+=g.triangles+g.removed;
}
for(const [i,part]of contract.shells.entries()){
 const angle=part.yawDegrees*Math.PI/180,offset=part.optionalLocalOffset||[0,0,0];
 const rotated=[Math.cos(angle)*offset[0]+Math.sin(angle)*offset[2],offset[1],-Math.sin(angle)*offset[0]+Math.cos(angle)*offset[2]];
 addPart(part.file,part.axisXZ,part.yMin,[rotated[0],baseShift+part.yBase+rotated[1],rotated[2]],part.yawDegrees,{stage:i<5?1:2});
}
for(const [stage,engine]of contract.engines.entries()){
 const angle=engine.parentYawDegrees*Math.PI/180;
 engine.mountAxesXZ.forEach(([x,z],i)=>addPart(engine.file,engine.sourceAxisXZ,0,
  [Math.cos(angle)*x+Math.sin(angle)*z,baseShift+engine.yBase,-Math.sin(angle)*x+Math.cos(angle)*z],engine.parentYawDegrees,
  {engine:true,pinY:engine.pinSourceY[0],stage:stage+1,name:`Ступень ${stage+1} · сопло ${i+1}`}));
}
await doc.transform(weld(),dedup(),prune());
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
if(args.preview){await mkdir(dirname(resolve(args.preview)),{recursive:true});await writeFile(args.preview,await io.writeBinary(doc));}
await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
const bytes=await io.writeBinary(doc),decoded=await io.readBinary(bytes);
const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let triangles=0,vertices=0,primitives=0;
for(const node of decoded.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()||[]){
 const pos=p.getAttribute('POSITION'),m=node.getWorldMatrix(),v=[];vertices+=pos.getCount();primitives++;triangles+=(p.getIndices()?.getCount()||pos.getCount())/3;
 for(let i=0;i<pos.getCount();i++){
  pos.getElement(i,v);for(let j=0;j<3;j++){const x=m[j]*v[0]+m[4+j]*v[1]+m[8+j]*v[2]+m[12+j];assert.ok(Number.isFinite(x));bounds.min[j]=Math.min(bounds.min[j],x);bounds.max[j]=Math.max(bounds.max[j],x);}
 }
}
bounds.size=bounds.max.map((x,i)=>x-bounds.min[i]);
assert.ok(Math.abs(bounds.min[1])<.001,'Bell exits must meet ground');
assert.ok(Math.abs(bounds.size[1]-contract.heightMetres)<.002,'Do not stretch the source to a different historical variant');
assert.equal(triangles,sourceInstanceTriangles-removedPinTriangles,'Exterior source triangles retained');
assert.ok(bytes.length<750000,'Museum download budget');
const manifest={
 version:'rocket-exhibits-v1',id:'r16',configuration:'light',assetSha256:sha(bytes),
 assetStats:{bytes:bytes.length,triangles,vertices,primitives,uniqueMeshes:decoded.getRoot().listMeshes().length,materials:decoded.getRoot().listMaterials().length,textures:0},
 bounds,normalization:{unit:'metre',up:'+Y',baseY:0,uniformSourceUnitMetres:toMetres,sourceBaseShift:baseShift,bodyDiameterMetres:3,sourceBodyDiameter:30},
 source:{format:'binary STL',sourceFolder:sources.folder,sourceFileCount:sources.files.length,sourceBytes:sources.files.reduce((s,f)=>s+f.bytes,0),
  sourceTriangles:sources.files.reduce((s,f)=>s+f.triangles,0),sourceInstanceTriangles,selectedTriangles:triangles,files:sources.files,
  selectedFiles:[...geometryBySource.keys()],omitted:contract.omitted},
 assembly,
 optimization:{geometryDecimation:false,normalCreaseAngleDegrees:36,removedPinTriangles,omittedInternalSleeves:3,omittedUnconfirmedFrame:true,sharedEngineMeshes:true,compression:'EXT_meshopt_compression',positionBits:16,normalBits:12},
 references:[
  {url:'https://rvsn.ruzhany.info/umz_2000_01_01.html',basis:'Издание ГКБ «Южное», 2000: основной диаметр 3 м; разные верхние части не приводятся к одной высоте.'},
  {url:'https://www.testpilot.ru/espace/bibl/kb-ujn/63.jpg',basis:'Силуэт из издания ГКБ «Южное», 2004: выбор вытянутого конуса light.'},
  {url:'https://commons.wikimedia.org/wiki/File:RVSN_gallery11.jpg',basis:'Фотография экспозиции музея РВСН, Mil.ru, 2014: оливковая окраска. Фотография не включена в ассет.'},
  {url:'https://museumgagarin.ru/news/khronika_chernogo_dnya/',basis:'Связь Р-16 с площадками 41 и 42 Байконура.'}
 ],
 attribution:{authors:[],providedBy:'Владелец проекта / Google Drive',driveUrl:sources.folder,licenseNote:'Автор и лицензия исходного STL-набора в предоставленных файлах не указаны. Открытая лицензия не заявляется.'},
 museumChoices:contract.museumChoices,
 interpretation:'Музейный экспонат по предоставленному STL. Геометрия и пропорции источника сохранены; окраска по музейному ориентиру. Не заявляется точной реконструкцией конкретного борта 1960 года.'
};
await mkdir(output,{recursive:true});await writeFile(resolve(output,'r16.glb'),bytes);await writeFile(resolve(output,'r16.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({id:'r16',...manifest.assetStats,bounds,removedPinTriangles},null,2));
