#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {transformMesh,join,weld,prune,dedup,simplify,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier} from 'meshoptimizer';
import {Matrix4,Vector3,Box3} from 'three';
const source=process.argv[2];assert(source,'Pass the Drive Sprinter GLB');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const bytes=await readFile(source),doc=await io.readBinary(bytes),root=doc.getRoot(),scene=root.listScenes()[0],nodes=root.listNodes();
const sourceCredit={...root.getAsset().extras};assert.equal(sourceCredit.author,'Res1n (https://sketchfab.com/Res1n)');
assert.equal(nodes.length,88);
const sha=b=>createHash('sha256').update(b).digest('hex');
// Source coordinates are centimetres, Y-up, front +X. Museum vehicles face +Z.
const normalizer=new Matrix4().makeRotationY(-Math.PI/2).multiply(new Matrix4().makeScale(.01,.01,.01));
const wheels=[
 {name:'wheel-rear-right',ids:[64,76,81,82,83],sourceCenter:[-163.6365,35.039,-84.4]},
 {name:'wheel-rear-left',ids:[65,77,78,79,80],sourceCenter:[-163.6365,35.039,83.45]},
 {name:'wheel-front-right',ids:[66,68,73,74,75],sourceCenter:[240.8915,35.039,-84.4]},
 {name:'wheel-front-left',ids:[67,69,70,71,72],sourceCenter:[240.8915,35.039,83.45]}
].map(w=>({...w,center:new Vector3(...w.sourceCenter).applyMatrix4(normalizer).toArray(),radius:.35039}));
const groups=[{name:'body',center:[0,0,0]},...wheels];
for(const g of groups){g.mesh=doc.createMesh(g.name);g.node=doc.createNode(g.name).setTranslation(g.center).setMesh(g.mesh);}
let sourceTriangles=0;
for(const n of nodes){
 const sourceMesh=n.getMesh();if(!sourceMesh)continue;
 const id=Number(n.getName().replace('Object_','')),group=wheels.find(w=>w.ids.includes(id))||groups[0];
 const mesh=sourceMesh.clone(),matrix=new Matrix4().makeTranslation(...group.center.map(v=>-v)).multiply(normalizer).multiply(new Matrix4().fromArray(n.getWorldMatrix()));
 transformMesh(mesh,matrix.toArray());
 for(const p of [...mesh.listPrimitives()]){sourceTriangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;mesh.removePrimitive(p);group.mesh.addPrimitive(p);}
 mesh.dispose();
}
for(const n of [...scene.listChildren()])scene.removeChild(n);
for(const n of nodes)n.dispose();
for(const g of groups)scene.addChild(g.node);
for(const m of root.listMaterials()){
 if(m.getName()==='carpaint'){m.setBaseColorFactor([.82,.83,.81,1]);m.setRoughnessFactor(.4);}
 if(m.getName()==='chrome'||m.getName()==='material'){m.setMetallicFactor(.72);m.setRoughnessFactor(.32);}
 if(m.getName()==='windowglass'){m.setBaseColorFactor([.025,.045,.06,.88]);m.setRoughnessFactor(.24);}
}
await doc.transform(prune(),dedup(),join({keepNamed:true}),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.14,error:.001}),prune());
scene.setName('Mercedes-Benz Sprinter · RocketTrip');
root.getAsset().copyright='Res1n · CC BY 4.0 · geometry optimized, wheel rig and paint adapted for RocketTrip';
const output='assets/models/sprinter';await mkdir(output,{recursive:true});await mkdir('qa-sprinter',{recursive:true});
await writeFile('qa-sprinter/normalized.glb',await io.writeBinary(doc));
await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
const binary=await io.writeBinary(doc);await writeFile(output+'/model-v1.glb',binary);
const decoded=await io.readBinary(binary),bounds=new Box3();let triangles=0,primitives=0;
for(const n of decoded.getRoot().listNodes())if(n.getMesh())for(const p of n.getMesh().listPrimitives()){
 primitives++;const pos=p.getAttribute('POSITION'),v=[],matrix=new Matrix4().fromArray(n.getWorldMatrix());triangles+=(p.getIndices()?.getCount()||pos.getCount())/3;
 for(let i=0;i<pos.getCount();i++){pos.getElement(i,v);bounds.expandByPoint(new Vector3(...v).applyMatrix4(matrix));}
}
const manifest={version:'sprinter-drive-v1',sourceFile:'mercedes-benz_sprinter.glb',sourceDriveId:'1F1kj8AVOg6CuLBLaOr1UXfm1OX4PfUud',sourceSha256:sha(bytes),sourceBytes:bytes.length,sourceTriangles,
 author:'Res1n',authorUrl:'https://sketchfab.com/Res1n',sourceUrl:sourceCredit.source,license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
 model:'Mercedes-Benz Sprinter Mk1 facelift · 903 · L3H2 · 2000',normalization:{unit:'metre',sourceUnit:'centimetre',scale:.01,forward:'+Z',up:'+Y'},
 adaptation:{paint:'white RocketTrip',geometrySimplified:true,wheelsSeparated:true,photoNote:'The supplied photos show newer Sprinters; this asset preserves the uploaded older-generation model.'},
 wheels:wheels.map(({name,center,radius,ids})=>({name,center,radius,sourceObjectIds:ids})),
 bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.getSize(new Vector3()).toArray()},asset:{bytes:binary.length,sha256:sha(binary),triangles,primitives}};
await writeFile(output+'/manifest-v1.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
