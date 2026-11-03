#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {transformMesh,join,weld,prune,dedup,palette,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
const source=process.argv[2];assert(source,'Pass the original Drive GLB path');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const bytes=await readFile(source),doc=await io.readBinary(bytes),root=doc.getRoot(),nodes=root.listNodes(),scene=root.listScenes()[0];
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(nodes.length,300);assert.equal(root.listMeshes().length,149);
const omit=new Set([255,257,259,261,263,265,267]);
// Remote terrain/building blocks belong to the source diorama, not the museum
// survey. Retain the complete 31/6 platform and machinery without decimation.
const towerGroups=[{ids:[269,273],lift:9.919475},{ids:[271,275],lift:11.04136},{ids:[277,279,281,295],lift:15.44269},{ids:[283,285,287,297],lift:17.8044},{ids:[289,291,293,299],lift:11.44837}];
root.getAsset().copyright='Soviet Model Magic · CC BY 4.0 · adapted for RocketTrip';
const parts=[];let allTriangles=0,keptTriangles=0;
function triangles(mesh){return mesh.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);}
for(let i=0;i<nodes.length;i++){
 const n=nodes[i],m=n.getMesh();if(!m)continue;allTriangles+=triangles(m);if(omit.has(i))continue;
 const matrix=n.getWorldMatrix(),lift=towerGroups.find(g=>g.ids.includes(i))?.lift||0;matrix[13]+=lift;
 const mesh=m.clone();transformMesh(mesh,matrix);keptTriangles+=triangles(mesh);
 parts.push({id:i,name:n.getName(),mesh});
}
for(const n of scene.listChildren())scene.removeChild(n);
for(const p of parts)scene.addChild(doc.createNode('Site31 source '+p.id).setMesh(p.mesh));
for(const n of nodes)n.dispose();
for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives())if(!p.getMaterial()?.getBaseColorTexture())for(const key of p.listSemantics())if(key.startsWith('TEXCOORD_'))p.setAttribute(key,null);
await doc.transform(prune(),dedup({keepUniqueNames:false}),palette({min:2}),join({keepNamed:false}),weld(),prune());
// Material names/texture and the creator's license remain with the asset.
scene.setName('Площадка 31/6 · исходный стартовый комплекс');
scene.setExtras({museumAsset:'site31-drive-v1',unit:'metre',source:'baikonur_cosmodrome_site_31_pad_6.glb'});
const output='assets/models/site31';await mkdir(output,{recursive:true});
await writeFile('qa-site31/normalized.glb',await io.writeBinary(doc));
await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
const binary=await io.writeBinary(doc);await writeFile(output+'/model-v1.glb',binary);
const decoded=await io.readBinary(binary),bound={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},v=[];
let resultTriangles=0,primitives=0;
for(const n of decoded.getRoot().listNodes())if(n.getMesh()){
 const matrix=n.getWorldMatrix();for(const p of n.getMesh().listPrimitives()){
  resultTriangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;primitives++;
  const pos=p.getAttribute('POSITION');for(let i=0;i<pos.getCount();i++){pos.getElement(i,v);const q=[0,1,2].map(k=>matrix[k]*v[0]+matrix[k+4]*v[1]+matrix[k+8]*v[2]+matrix[k+12]);q.forEach((x,k)=>{bound.min[k]=Math.min(bound.min[k],x);bound.max[k]=Math.max(bound.max[k],x);});}
 }
}
bound.size=bound.max.map((n,i)=>n-bound.min[i]);assert.equal(resultTriangles,keptTriangles);
const manifest={version:'site31-drive-v1',sourceFile:'baikonur_cosmodrome_site_31_pad_6.glb',sourceDriveId:'1yGX-pSrVWfFp9XvA8XoLRommtOYt0dKN',sourceSha256:sha(bytes),sourceBytes:bytes.length,sourceTriangles:allTriangles,
 author:'Soviet Model Magic',sourceUrl:'https://sketchfab.com/3d-models/baikonur-cosmodrome-site-31-pad-6-1b505f3a9cfd4df7a4746d1c66b53671',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
 normalization:{unit:'metre',scale:1,launchAxis:[0,0,0],incomingRail:'+Z',flameDuct:'-Z',towerBaseLifts:towerGroups},
 adaptation:{omittedSourceNodeIds:[...omit],reason:'Source ground, remote buildings and ramps replaced by the existing satellite-traced trench and connected museum roads/railway',sourceStructurePreserved:true,geometryDecimated:false},
 bounds:bound,asset:{bytes:binary.length,sha256:sha(binary),triangles:resultTriangles,primitives,materials:decoded.getRoot().listMaterials().length},
 views:{all:{target:[0,15,-10],eye:[-160,135,180]},structure:{target:[0,17,0],eye:[-48,37,62]},duct:{target:[-3,-6,-54],eye:[-150,125,-230]},connections:{target:[0,2,66],eye:[170,150,235]},top:{target:[0,0,-35],eye:[0,260,-34.99]}}};
await writeFile(output+'/manifest-v1.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({sourceBytes:bytes.length,...manifest.asset,bounds:bound}));
