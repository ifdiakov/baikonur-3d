import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MeshoptDecoder} from '../src/vendor/meshopt_decoder-v1.mjs';

// Usage: node tests/rocket-assets.mjs [--deps /path/to/node_modules]
// The ordinary package resolver is preferred; the conversion workspace is the
// fallback in this checkout. No downloads or source-model recovery run in tests.
const arg=process.argv.indexOf('--deps');
const dependencies=arg>=0?process.argv[arg+1]:process.env.BAIKONUR_GLTF_DEPS;
async function dependency(name){
 if(dependencies)return import(pathToFileURL(resolve(dependencies,name,'dist/index.js')).href);
 try{return await import(name);}catch(error){
  if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
  return import(pathToFileURL(resolve('/tmp/ukss-assets/node_modules',name,'dist/index.js')).href);
 }
}
const [{NodeIO},{ALL_EXTENSIONS}]=await Promise.all([
 dependency('@gltf-transform/core'),dependency('@gltf-transform/extensions')
]);
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const assetRoot=new URL('../assets/models/rockets/',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const near=(a,b,tolerance,message)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
const vectorNear=(a,b,tolerance,message)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>near(v,b[i],tolerance,`${message}[${i}]`));};
const configurations={
 soyuz:{sourceFile:'Soyuz_TMA_b.bdf',sourceSha256:'9928bc1c5bbd21e3be6309c9b3c865010658dd43dde2f92e8e7d595e3ba5c042',sourceUnit:1,sourceUp:'+Y',
  authors:['Владимир Некрасов'],height:[49,50],width:[9.8,10.5],depth:[9.8,10.5],required:['default']},
 'energia-polyus':{sourceFile:'Pole_Energia.bdf',sourceSha256:'0b2145cefe253268a359da6c2ea69c37a6321db11d0506f7196a3da2d1505e7c',sourceUnit:.001,sourceUp:'+Z',
  authors:['Николай Назаренко'],height:[58.5,59.1],width:[17.4,18],depth:[13.5,14.7],required:['Энергия (1 ступень)','Энергия (2 ступень)','Полюс'],exactLayers:true},
 energia:{sourceFile:'Pole_Energia.bdf',sourceSha256:'0b2145cefe253268a359da6c2ea69c37a6321db11d0506f7196a3da2d1505e7c',sourceUnit:.001,sourceUp:'+Z',
  authors:['Николай Назаренко'],height:[58.5,59.1],width:[17.4,18],depth:[10.5,11.3],required:['Энергия (1 ступень)','Энергия (2 ступень)'],exactLayers:true},
 'energia-buran':{sourceFile:'Buran_Enrg_Full.bdf',sourceSha256:'7e73a58ccbd6ec7b66a806f5492305df01c5148293777ea9d351f0ac139bca94',sourceUnit:.001,sourceUp:'+Z',
  authors:['Николай Назаренко','Владимир Малюх'],height:[58.5,59.1],width:[23.5,24.3],depth:[23.5,24.7],
  required:['Энергия (1 ступень)','Энергия (2 ступень)','Крыло','Киль','НЧФ','ОДУ','Ф-2','Руль направления','Элевоны','Балансировочный щиток 0','Створки ОПГ (закрыты)','Створка НСШ (закрыта)','Створки ОСШ (закрыты)']},
 'energia-m':{sourceFile:'Energia_M.bdf',sourceSha256:'300dfd64ef1e36826fa38c7a17e7a54b1fa9a9b317f8b2c2db29f9c2560cfba7',sourceUnit:.001,sourceUp:'+Y',
  authors:['Михаил Павлов'],height:[49.8,50.7],width:[16,16.7],depth:[7.8,8.4],required:['1_Ступень','2_Ступень','Разъемы']}
};
const manifests=new Map(),results=[];
let totalBytes=0;
function assertEmbedded(value,path='gltf'){
 if(!value||typeof value!=='object')return;
 for(const [key,item] of Object.entries(value)){
  if(key==='uri')assert.ok(typeof item==='string'&&item.startsWith('data:'),`${path}.${key} must not request an external resource`);
  if(item&&typeof item==='object')assertEmbedded(item,`${path}.${key}`);
 }
}
function parseGlb(bytes,id){
 assert.equal(bytes.readUInt32LE(0),0x46546c67,`${id}: GLB magic`);
 assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
 const chunks=[];let offset=12;
 while(offset<bytes.length){
  assert.ok(offset+8<=bytes.length);const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);
  assert.equal(length%4,0);assert.ok(offset+8+length<=bytes.length);
  chunks.push({type,bytes:bytes.subarray(offset+8,offset+8+length)});offset+=8+length;
 }
 assert.equal(offset,bytes.length);assert.equal(chunks[0].type,0x4e4f534a);
 assert.equal(chunks.filter(c=>c.type===0x004e4942).length,1,'One embedded binary chunk');
 const gltf=JSON.parse(chunks[0].bytes.toString('utf8').replace(/\0+$/,''));
 assert.equal(gltf.asset.version,'2.0');assertEmbedded(gltf);
 assert.ok(gltf.extensionsUsed?.includes('EXT_meshopt_compression'));
 assert.ok(gltf.extensionsRequired?.includes('EXT_meshopt_compression'),'The shipped decoder must be required, not a silent large fallback');
 assert.ok(gltf.bufferViews.some(view=>view.extensions?.EXT_meshopt_compression));
 assert.equal(gltf.animations?.length??0,0,'Alternative poses are not shipped as accidental duplicate animations');
 assert.equal(gltf.cameras?.length??0,0,'Source cameras are not exhibit geometry');
 for(const image of gltf.images||[]){assert.ok(image.bufferView!=null||image.uri?.startsWith('data:'));assert.ok(image.mimeType?.startsWith('image/')||image.uri?.startsWith('data:image/'));}
 const scene=gltf.scenes[gltf.scene||0];assert.equal(scene.extras.museumAsset,id);assert.equal(scene.extras.unit,'metre');
 return gltf;
}
for(const [id,expected] of Object.entries(configurations)){
 const [manifest,bytes]=await Promise.all([
  readFile(new URL(id+'.json',assetRoot),'utf8').then(JSON.parse),readFile(new URL(id+'.glb',assetRoot))
 ]);
 manifests.set(id,manifest);totalBytes+=bytes.length;
 const source=manifest.source,opt=manifest.optimization;
 assert.equal(manifest.version,'rocket-exhibits-v1');assert.equal(manifest.id,id);
 assert.equal(source.sourceFile,expected.sourceFile);assert.equal(source.sourceSha256,expected.sourceSha256,`${id}: verified owner-provided source identity`);
 assert.equal(manifest.assetSha256,sha(bytes));assert.match(manifest.recoverySha256,/^[a-f0-9]{64}$/);
 assert.equal(manifest.assetStats.bytes,bytes.length);assert.ok(source.sourceBytes>bytes.length);
 assert.ok(source.sourceMeshCount>=source.selectedMeshCount&&source.selectedMeshCount>0);
 assert.equal(source.sourceUnitMetres,expected.sourceUnit);assert.equal(source.sourceUp,expected.sourceUp);
 assert.deepEqual(manifest.normalization,{unit:'metre',up:'+Y',baseY:0,uniformSourceUnitMetres:expected.sourceUnit,originMetres:source.originMetres});
 assert.ok(source.originMetres.length===3&&source.originMetres.every(Number.isFinite));
 assert.equal(source.discardedInvalidTriangles,0);assert.ok(Number.isInteger(source.discardedDegenerateTriangles)&&source.discardedDegenerateTriangles>=0);
 assert.ok(source.sourceTriangles>=source.selectedTriangles+source.discardedDegenerateTriangles);
 assert.equal(source.selectedTriangles,Object.values(source.layers).reduce((s,n)=>s+n,0));
 assert.equal(new Set(source.selectedLayers).size,source.selectedLayers.length);
 assert.ok(source.selectedLayers.every(layer=>!source.omittedLayers.includes(layer)));
 assert.deepEqual(Object.keys(manifest.layerStats).sort(),Object.keys(source.layers).sort(),'No selected assembly layer disappears');
 for(const layer of expected.required){assert.ok(source.selectedLayers.includes(layer),`${id}: expected source layer ${layer}`);assert.ok(manifest.layerStats[layer]>0,`${id}: retained assembly ${layer}`);}
 if(expected.exactLayers)assert.deepEqual([...source.selectedLayers].sort(),[...expected.required].sort());
 for(const [layer,triangles] of Object.entries(manifest.layerStats))assert.ok(triangles>0&&triangles<=source.layers[layer]);
 if(id==='energia-buran'){
  for(const layer of ['Створки ОПГ (открыты)','Створка НСШ (открыта)','Створки ОСШ (открыты)','Стойка шасси носовая','Стойка шасси основная','Балансировочный щиток +20','Балансировочный щиток -10','Руль направления (аэр.торм)']){
   assert.ok(source.omittedLayers.includes(layer),`Alternative Buran pose excluded: ${layer}`);assert.ok(!source.selectedLayers.includes(layer));
  }
  assert.ok(source.selectedLayers.every(layer=>!/(?:camera|cameras|light_|открыт|рабочее|транспортное|произвольн)/i.test(layer)));
 }
 if(id==='energia'||id==='energia-polyus')assert.ok(source.omittedLayers.includes('Блок Я')&&source.omittedLayers.includes('Блок Я старый'),'Ground attachment blocks are not included in the rocket bounds');
 if(id==='energia')assert.ok(source.omittedLayers.includes('Полюс'));
 near(opt.maximumSurfaceErrorMetres,.02,1e-12,'Simplification tolerance in physical metres');
 near(opt.tinyComponentMaximumDimensionMetres,.08,1e-12,'Only genuinely small source components may be dropped');
 assert.ok(opt.targetRatio>0&&opt.targetRatio<1);
 for(const key of ['removedTinyComponents','removedTinyTriangles','simplifiedPrimitives','trianglesRemovedBySimplification'])assert.ok(Number.isInteger(opt[key])&&opt[key]>0);
 assert.equal(source.selectedTriangles-opt.removedTinyTriangles-opt.trianglesRemovedBySimplification,manifest.assetStats.triangles,'Every reduced triangle has an accounting category');
 assert.equal(Object.values(manifest.layerStats).reduce((a,b)=>a+b,0),manifest.assetStats.triangles);
 assert.ok(manifest.assetStats.triangles<source.selectedTriangles*.4,'Simplification reduces actual geometry, not only the compressed file');
 assert.ok(bytes.length<4*1024*1024&&bytes.length<source.rawBytes*.2,'Each exhibit stays within the browser download budget');
 assert.deepEqual([...manifest.attribution.authors].sort(),[...expected.authors].sort());
 assert.ok(/buran\.ru\/htm\/3d-model\.htm/.test(manifest.attribution.sourceUrl||manifest.attribution.archive));
 assert.ok(manifest.attribution.providedBy,'Owner-provided provenance is kept separate from authorship');
 const gltf=parseGlb(bytes,id);
 assert.equal(gltf.scenes[gltf.scene||0].extras.sourceSha256,expected.sourceSha256);
 assert.equal(gltf.scenes[gltf.scene||0].extras.sourceFile,expected.sourceFile);
 // Decode the actual meshopt stream with the same decoder shipped by the app.
 const doc=await io.readBinary(bytes),root=doc.getRoot();
 const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 let triangles=0,vertices=0,primitives=0;
 for(const node of root.listNodes()){
  const matrix=node.getWorldMatrix();assert.ok(matrix.every(Number.isFinite));
  for(const primitive of node.getMesh()?.listPrimitives()||[]){
   primitives++;assert.equal(primitive.getMode(),4);
   const positions=primitive.getAttribute('POSITION'),normals=primitive.getAttribute('NORMAL'),indices=primitive.getIndices();
   assert.ok(positions&&positions.getElementSize()===3&&normals,'A complete shaded triangle surface');
   assert.ok(indices);assert.equal(indices.getCount()%3,0);triangles+=indices.getCount()/3;vertices+=positions.getCount();
   assert.ok(primitive.getMaterial(),'Authored materials survive batching');
   for(const attribute of primitive.listAttributes())for(const value of attribute.getArray())assert.ok(Number.isFinite(value));
   for(const value of indices.getArray())assert.ok(Number.isInteger(value)&&value>=0&&value<positions.getCount());
   const v=[];
   for(let i=0;i<positions.getCount();i++){
    positions.getElement(i,v);
    const point=[0,1,2].map(j=>matrix[j]*v[0]+matrix[4+j]*v[1]+matrix[8+j]*v[2]+matrix[12+j]);
    point.forEach((n,j)=>{assert.ok(Number.isFinite(n));bounds.min[j]=Math.min(bounds.min[j],n);bounds.max[j]=Math.max(bounds.max[j],n);});
   }
  }
 }
 bounds.size=bounds.max.map((n,j)=>n-bounds.min[j]);
 assert.equal(triangles,manifest.assetStats.triangles);assert.equal(vertices,manifest.assetStats.vertices);assert.equal(primitives,manifest.assetStats.primitives);
 assert.equal(root.listMaterials().length,manifest.assetStats.materials);assert.equal(root.listTextures().length,manifest.assetStats.textures);
 assert.ok(primitives<=60,'Source objects are batched into a small set of material draws');
 for(const texture of root.listTextures()){assert.ok(texture.getImage()?.byteLength>0,'All images have embedded bytes');assert.ok(texture.getMimeType().startsWith('image/'));}
 for(const key of ['min','max','size'])vectorNear(bounds[key],manifest.bounds[key],1e-5,`${id}: decoded ${key}`);
 for(let axis=0;axis<3;axis++){
  near(bounds.min[axis],source.bounds.min[axis],.12,`${id}: preserved lower silhouette`);
  near(bounds.max[axis],source.bounds.max[axis],.12,`${id}: preserved upper silhouette`);
 }
 near(bounds.min[1],0,.03,`${id}: the rocket base is at y=0 within simplification/quantization tolerance`);
 near((bounds.min[0]+bounds.max[0])/2,0,.03,`${id}: launcher centreline is x=0`);
 for(const [axis,range] of [[0,expected.width],[1,expected.height],[2,expected.depth]])assert.ok(bounds.size[axis]>=range[0]&&bounds.size[axis]<=range[1],`${id}: physical envelope axis ${axis} ${bounds.size[axis]} outside ${range}`);
 assert.ok(bounds.size[1]>bounds.size[0]*2&&bounds.size[1]>bounds.size[2]*2,'The long vehicle axis is +Y');
 results.push({id,bytes:bytes.length,triangles,primitives,metreBounds:bounds.size,authors:manifest.attribution.authors});
}
const bare=manifests.get('energia'),polyus=manifests.get('energia-polyus'),buran=manifests.get('energia-buran');
assert.equal(bare.source.sourceSha256,polyus.source.sourceSha256,'Bare Energia and Polyus share the exact authored launcher source');
near(bare.bounds.size[0],polyus.bounds.size[0],.03,'Same launcher width after payload removal');
near(bare.bounds.size[1],polyus.bounds.size[1],.03,'Same launcher height after payload removal');
assert.ok(polyus.bounds.size[2]>bare.bounds.size[2]+2,'The side-mounted Polyus is present in the decoded envelope');
assert.ok(buran.bounds.size[0]>bare.bounds.size[0]+5&&buran.bounds.size[2]>bare.bounds.size[2]+10,'The orbiter wings and side-mounted fuselage remain in the envelope');
assert.ok(totalBytes<8*1024*1024,'Five reusable exhibits stay within the combined download budget');
console.log(JSON.stringify({ok:true,totalBytes,exhibits:results},null,2));
