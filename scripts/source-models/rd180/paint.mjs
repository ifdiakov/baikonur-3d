// Usage: node scripts/source-models/rd180/paint.mjs /path/to/source.glb
// Keeps all 26,398 source triangles, UVs, labels and normal-map detail.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,weld,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const source=await readFile(process.argv[2]),doc=await io.readBinary(source),root=doc.getRoot(),mesh=root.listMeshes()[0],p=mesh.listPrimitives()[0],pos=p.getAttribute('POSITION'),indices=p.getIndices().getArray();
const parent=Array.from({length:pos.getCount()},(_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(a,b)=>{parent[find(a)]=find(b);};
const same=new Map(),v=[];
for(let i=0;i<parent.length;i++){pos.getElement(i,v);const key=v.map(n=>Math.round(n*1e5)).join(',');if(same.has(key))join(i,same.get(key));else same.set(key,i);}
for(let i=0;i<indices.length;i+=3){join(indices[i],indices[i+1]);join(indices[i],indices[i+2]);}
const parts=new Map();for(let i=0;i<indices.length;i+=3){const k=find(indices[i]);if(!parts.has(k))parts.set(k,[]);parts.get(k).push(...indices.slice(i,i+3));}
const components=[...parts.values()].sort((a,b)=>b.length-a.length);
if(components.length!==9||indices.length!==79194)throw Error('Unexpected source topology; review component material assignments.');
const original=p.getMaterial(),materials=[
 ['Satin aluminium and stainless pipes',[.83,.87,.89,1],.62,.37],
 ['Light nozzle shells and red source markings',[.93,.94,.93,1],.38,.43],
 ['Olive painted actuator',[.20,.29,.13,1],.12,.58],
 ['Warm steel feed lines',[.75,.75,.69,1],.65,.44],
 ['Dark steel fittings',[.39,.43,.44,1],.65,.42]
].map(([name,color,metal,rough])=>original.clone().setName(name).setBaseColorFactor(color).setMetallicRoughnessTexture(null).setMetallicFactor(metal).setRoughnessFactor(rough).setEmissiveFactor([0,0,0]).setNormalScale(.45));
const componentMaterial=[0,1,1,2,3,3,0,4,4],buckets=materials.map(()=>[]);
components.forEach((ix,i)=>buckets[componentMaterial[i]].push(...ix));
mesh.removePrimitive(p);
for(let i=0;i<buckets.length;i++){const part=p.clone().setMaterial(materials[i]);part.setIndices(doc.createAccessor('material indices',root.listBuffers()[0]).setType('SCALAR').setArray(new Uint32Array(buckets[i])));mesh.addPrimitive(part);}
// Original local vertices are already Y-up. Remove Sketchfab presentation yaw.
for(const n of root.listNodes())n.setMatrix([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
root.listNodes()[0].setScale([3.556/3.467984676361084,3.556/3.467984676361084,3.556/3.467984676361084]);
root.getAsset().copyright='viktor_durov · CC BY 4.0 · source: https://sketchfab.com/3d-models/180-acf0e1b46a2e48158e64015335f9fb5e · materials and optimization: RocketTrip';
await doc.transform(dedup(),prune(),weld(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
const bytes=await io.writeBinary(doc),sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir('assets/models/rd180',{recursive:true});await writeFile('assets/models/rd180/model-v1.glb',bytes);
await writeFile('assets/models/rd180/manifest.json',JSON.stringify({assetRevision:'rd180-20261108-v1',source:{driveId:'1OmRVGpSsFwNekwvrXWLBy9JOQdFUhM4A',name:'-180.glb',bytes:source.length,sha256:sha(source),author:'viktor_durov',license:'CC-BY-4.0',url:'https://sketchfab.com/3d-models/180-acf0e1b46a2e48158e64015335f9fb5e'},asset:{bytes:bytes.length,sha256:sha(bytes),triangles:indices.length/3,materials:materials.length,heightMetres:3.556},palette:materials.map(m=>m.getName()),note:'Interpretive museum finish from photographs; original geometry and baked markings retained. Uniform height normalization, no engineering dimensions inferred.'},null,2)+'\n');
console.log('RD180_PAINTED',bytes.length,'bytes',indices.length/3,'triangles');
