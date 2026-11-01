// node scripts/prepare-imported-exhibits.mjs /absolute/path/to/source-folder
// Source files: mig25.glb and n1.glb, supplied by the owner through Drive.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds,dedup,flatten,join,weld,prune,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const source=process.argv[2];assert(source,'Supply the source folder');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
for(const id of ['mig25','n1']){
 const original=await readFile(`${source}/${id}.glb`),doc=await io.readBinary(original),scene=doc.getRoot().listScenes()[0],root=scene.listChildren()[0];
 const length=original.readUInt32LE(12),asset=JSON.parse(original.subarray(20,20+length).toString()).asset;
 // Remove the Sketchfab presentation pose; both authoring files use Z up.
 root.setTranslation([0,0,0]).setScale([1,1,1]).setRotation(id==='mig25'?[0,Math.SQRT1_2,Math.SQRT1_2,0]:[-Math.SQRT1_2,0,0,Math.SQRT1_2]);
 let b=getBounds(scene);const scale=id==='mig25'?14.01/(b.max[0]-b.min[0]):105/(b.max[1]-b.min[1]);root.setScale([scale,scale,scale]);b=getBounds(scene);root.setTranslation([-(b.min[0]+b.max[0])/2,-b.min[1],-(b.min[2]+b.max[2])/2]);
 const targets={};for(const [key,name]of [['cockpit','kabina_vn'],['exhaust','soplo_left']]){const n=doc.getRoot().listNodes().find(n=>n.getName()===name);if(n){const q=getBounds(n);targets[key]=[0,(q.min[1]+q.max[1])/2,(q.min[2]+q.max[2])/2];}}
 await doc.transform(flatten(),dedup(),join(),weld(),prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
 scene.setName(id==='mig25'?'МиГ-25 · manilov.ap':'Н-1 · Scilence');Object.assign(doc.getRoot().getAsset(),{extras:asset.extras,copyright:`${asset.extras.author}; CC BY 4.0; ${asset.extras.source}`});
 const bytes=await io.writeBinary(doc),decoded=await io.readBinary(bytes);b=getBounds(decoded.getRoot().listScenes()[0]);
 const primitives=decoded.getRoot().listMeshes().flatMap(m=>m.listPrimitives()),triangles=primitives.reduce((n,p)=>n+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),dir=id==='n1'?'assets/models/rockets':'assets/models/mig25';await mkdir(dir,{recursive:true});
 const target=`${dir}/${id==='n1'?'n1':'model-v1'}.glb`;await writeFile(target,bytes);
 const manifest={id,version:'rocket-exhibits-v1',source:{...asset.extras,driveFileId:id==='mig25'?'1kj28-o1I69LNMPkpJnYxgPbXot8C5CZ6':'1ygFx7bshgupWeXT_9R4B28vfYlJ6DltX',bytes:original.length,sha256:createHash('sha256').update(original).digest('hex')},normalization:{unit:'metre',upAxis:'+Y',forwardAxis:'+Z',calibration:id==='mig25'?'14.01 m span; source proportions preserved':'105 m overall height; source proportions preserved'},bounds:{min:b.min,max:b.max,size:b.max.map((v,i)=>v-b.min[i])},assetStats:{triangles,primitives:primitives.length,textures:decoded.getRoot().listTextures().length,bytes:bytes.length},sha256:createHash('sha256').update(bytes).digest('hex'),inspectionTargets:targets,changes:'Presentation transforms removed, grounded and uniformly scaled; duplicate resources removed, draw calls merged and meshopt-compressed. Original geometry, normals, colors, texture pixels and static pose preserved.'};
 await writeFile(`${dir}/${id==='n1'?'n1':'manifest-v1'}.json`,JSON.stringify(manifest,null,2)+'\n');console.log(id,JSON.stringify(manifest));
}
