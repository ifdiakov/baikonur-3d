#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {transformMesh,join,weld,prune,dedup,simplify,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier} from 'meshoptimizer';
import {Color} from 'three';
const input=process.argv[2];assert(input,'Pass the station GLB from Drive');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const source=await readFile(input),doc=await io.readBinary(source),root=doc.getRoot(),scene=root.listScenes()[0],nodes=[...root.listNodes()];
assert.match(root.getAsset().copyright,/CC0 1.0/);
const removed=[],kept=[],sourceTriangles=root.listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((a,p)=>a+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0);
const palette={
 'Architectural concrete':'#97988d','Concrete paving slabs':'#b0afa0','White precast concrete panels':'#d0cdbd',
 'Yellow tactile warning paving':'#cda632','Dark grey painted steel':'#465456','Dark grey profiled steel cladding':'#58686a',
 'Timber':'#816747','Green paint':'#45615a','Stainless steel':'#8b9898','Galvanised steel':'#8b9898',
 'White lamp':'#e4dac0','Window glass':'#506c75'
};
const material=doc.createMaterial('Texture-free station colours').setRoughnessFactor(.82).setMetallicFactor(.05);
const mesh=doc.createMesh('Platforms, canopies and footbridge'),buffer=root.listBuffers()[0];
for(const n of nodes){
 const original=n.getMesh();if(!original)continue;
 if(/^(Station |Ticket hall |Track |Ballast$|Totems$|Benches$|Canopy lights$|Lighting$|Platform railings$|Stair railings$)/.test(n.getName())){removed.push(n.getName());continue;}
 kept.push(n.getName());const copy=original.clone();transformMesh(copy,n.getWorldMatrix());
 for(const p of [...copy.listPrimitives()]){
  const name=p.getMaterial()?.getName(),color=new Color(palette[name]||'#999b90');const a=new Uint8Array(p.getAttribute('POSITION').getCount()*3);
  for(let i=0;i<a.length;i+=3){a[i]=Math.round(color.r*255);a[i+1]=Math.round(color.g*255);a[i+2]=Math.round(color.b*255);}
  p.setAttribute('COLOR_0',doc.createAccessor().setType('VEC3').setArray(a).setNormalized(true).setBuffer(buffer));
  for(const semantic of p.listSemantics())if(!['POSITION','NORMAL','COLOR_0'].includes(semantic))p.setAttribute(semantic,null);
  p.setMaterial(material);copy.removePrimitive(p);mesh.addPrimitive(p);
 }
 copy.dispose();
}
for(const n of [...scene.listChildren()])scene.removeChild(n);
for(const n of nodes)n.dispose();
scene.addChild(doc.createNode('Station without building').setMesh(mesh));scene.setName('Lightweight railway platforms');
await doc.transform(prune(),dedup(),join(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.3,error:.006}),prune());
await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:14,quantizeNormal:8,quantizeColor:8}));
const binary=await io.writeBinary(doc),decoded=await io.readBinary(binary);
const triangles=decoded.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((a,p)=>a+p.getIndices().getCount()/3,0),0);
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest={version:'rail-station-lite-v1',sourceDriveId:'1n3FXzb_cVsOT4NaceLr1ilxv89HnYd9T',sourceFile:'train-station-with-canopy.glb',sourceBytes:source.length,sourceSha256:sha(source),sourceTriangles,
 author:'Innerscene Corp',license:'CC0 1.0',copyright:root.getAsset().copyright,removed,kept,
 adaptation:{texturesRemoved:true,vertexColours:true,stationBuildingRemoved:true,sourceTracksRemoved:true,axis:'+X',unit:'metre',length:110,sourceInnerPlatformEdge:5,sourceOuterPlatformEdge:9.95},
 asset:{bytes:binary.length,sha256:sha(binary),triangles,primitives:decoded.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().length,0),textures:decoded.getRoot().listTextures().length}};
assert(manifest.asset.bytes<150000);assert.equal(manifest.asset.textures,0);assert.equal(manifest.asset.primitives,1);
await mkdir('assets/models/rail-station',{recursive:true});await writeFile('assets/models/rail-station/model-v1.glb',binary);await writeFile('assets/models/rail-station/manifest-v1.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
