#!/usr/bin/env node
// Keep the owner's actual structures; remove only the source ground coverings.
// node scripts/prepare-site118-asset.mjs /path/to/sewage_facility.glb
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {Matrix4,Matrix3,Vector3,Quaternion} from 'three';

const VERSION='site118-drive-20261111-v1';
const SOURCE_SHA='ac477f190f9314fd1a1d6c4abf81282dc2c7081ed2b1ed0336349d4acaf39938';
const sourcePath=process.argv[2];assert(sourcePath,'Pass the original sewage_facility.glb path');
const output=resolve(process.argv[3]||'assets/models/site118');
const source=await readFile(sourcePath),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(source),SOURCE_SHA,'This conversion is reviewed for the exact owner-supplied source');
const jsonLength=source.readUInt32LE(12),doc=JSON.parse(source.subarray(20,20+jsonLength));
const binaryOffset=20+jsonLength+8;
assert.equal(doc.nodes.length,13);assert.equal(doc.meshes.length,5);
const offset=[3.5928113821939682,0,8.949184891265213];
const world=new Map();
function visit(index,parent){
 const node=doc.nodes[index],matrix=new Matrix4();
 if(node.matrix)matrix.fromArray(node.matrix);
 else matrix.compose(new Vector3(...(node.translation||[0,0,0])),new Quaternion(...(node.rotation||[0,0,0,1])),new Vector3(...(node.scale||[1,1,1])));
 matrix.premultiply(parent);world.set(index,matrix);
 for(const child of node.children||[])visit(child,matrix);
}
for(const index of doc.scenes[doc.scene||0].nodes)visit(index,new Matrix4());
function attribute(index){
 const a=doc.accessors[index],view=doc.bufferViews[a.bufferView];
 const bytes={5126:4,5125:4,5123:2,5121:1}[a.componentType],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
 assert(bytes&&width&&!a.sparse,'Expected an ordinary embedded source accessor');
 const stride=view.byteStride||width*bytes,start=binaryOffset+(view.byteOffset||0)+(a.byteOffset||0);
 return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>a.componentType===5126?
  source.readFloatLE(start+i*stride+j*bytes):source.readUIntLE(start+i*stride+j*bytes,bytes)));
}
function components(positions,indices){
 const parents=positions.map((_,i)=>i),coordinates=new Map();
 const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parents[b]=a;};
 positions.forEach((p,i)=>{const key=p.map(x=>Math.round(x*1e5)).join(',');if(coordinates.has(key))union(i,coordinates.get(key));else coordinates.set(key,i);});
 for(let i=0;i<indices.length;i+=3){union(indices[i],indices[i+1]);union(indices[i],indices[i+2]);}
 const triangles=new Map();for(let i=0;i<indices.length;i+=3){const root=find(indices[i]);if(!triangles.has(root))triangles.set(root,[]);triangles.get(root).push(i/3);}
 return {find,triangles};
}
const emptyBounds=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
function expand(bounds,p){p.forEach((v,i)=>{bounds.min[i]=Math.min(bounds.min[i],v);bounds.max[i]=Math.max(bounds.max[i],v);});}
function complete(bounds){return {...bounds,size:bounds.max.map((v,i)=>v-bounds.min[i])};}
// Exact source vertex seeds for seven disconnected coverings, checked after
// position-only seam welding. Fence plinths and building foundations stay.
const groundComponents=new Map([[7159,48],[7257,36],[7114,12],[7265,10],[7285,10],[7305,10],[7325,10]]);
const supportSeeds={
 Cube_0:[[2860,'main-front-foundation'],[2884,'main-rear-foundation'],[5044,'main-east-foundation'],[5068,'main-west-foundation'],[7782,'external-pump-base']],
 Siding_1:[[2,'glazed-building-foundation']],
 Gate_2:[[2,'fence-return-base'],[170,'fence-east-base'],[1490,'fence-front-east-base'],[2618,'fence-front-middle-base'],[3746,'fence-front-west-base'],[4783,'gatehouse-foundation'],[5340,'fence-office-return-base'],[5445,'fence-entry-return-base'],[6788,'yard-pump-base']]
};
const kept=[],removed=[],contacts=[],fullBounds=emptyBounds(),visibleBounds=emptyBounds();
let sourceTriangles=0;
for(const [nodeId,node]of doc.nodes.entries()){
 if(node.mesh==null)continue;
 const parent=doc.nodes.find(n=>n.children?.includes(nodeId)),name=parent.name;
 assert.equal(doc.meshes[node.mesh].primitives.length,1);
 const primitive=doc.meshes[node.mesh].primitives[0],indices=attribute(primitive.indices).flat();sourceTriangles+=indices.length/3;
 if(name==='Grass_4'){
  removed.push({sourceNodeId:nodeId,sourcePart:name,kind:'source-lawn-coverings',triangles:indices.length/3,entireMesh:true});continue;
 }
 const matrix=world.get(nodeId),normalMatrix=new Matrix3().getNormalMatrix(matrix);
 const originalPositions=attribute(primitive.attributes.POSITION),positions=originalPositions.map(p=>new Vector3(...p).applyMatrix4(matrix).toArray());
 const topology=components(positions,indices),omitted=new Set();
 if(name==='Gate_2')for(const [seed,count]of groundComponents){
  const triangles=topology.triangles.get(topology.find(seed));assert.equal(triangles.length,count,'Ground component changed');
  const bounds=emptyBounds();for(const t of triangles){omitted.add(t);for(const index of indices.slice(t*3,t*3+3))expand(bounds,positions[index]);}
  assert(bounds.min[1]>-.101&&bounds.max[1]<.123,'Only thin source coverings may be removed');
  removed.push({sourceNodeId:nodeId,sourcePart:name,kind:'source-yard-road-or-walkway-covering',componentSeed:seed,triangles:count,sourceTriangleIndices:triangles,sourceBounds:complete(bounds)});
 }
 const retainedIndices=indices.filter((_,i)=>!omitted.has(Math.floor(i/3))),used=[...new Set(retainedIndices)].sort((a,b)=>a-b),remap=new Map(used.map((index,i)=>[index,i]));
 const normals=attribute(primitive.attributes.NORMAL),uv=attribute(primitive.attributes.TEXCOORD_0),bounds=emptyBounds();
 const attributes={
  POSITION:new Float32Array(used.flatMap(i=>positions[i].map((x,j)=>x+offset[j]))),
  NORMAL:new Float32Array(used.flatMap(i=>new Vector3(...normals[i]).applyMatrix3(normalMatrix).normalize().toArray())),
  TEXCOORD_0:new Float32Array(used.flatMap(i=>uv[i]))
 };
 for(let i=0;i<attributes.POSITION.length;i+=3){const p=Array.from(attributes.POSITION.subarray(i,i+3));expand(bounds,p);expand(fullBounds,p);if(p[1]>=0)expand(visibleBounds,p);}
 for(const [seed,id]of supportSeeds[name]||[]){
  const triangles=topology.triangles.get(topology.find(seed)),vertices=[...new Set(triangles.flatMap(t=>indices.slice(t*3,t*3+3)))];
  vertices.sort((a,b)=>positions[a][1]-positions[b][1]||a-b);const vertex=remap.get(vertices[0]);assert.notEqual(vertex,undefined);
  contacts.push({id,mesh:name,vertex,point:Array.from(attributes.POSITION.subarray(vertex*3,vertex*3+3)),role:id.includes('pump')?'equipment-base':id.includes('fence')?'fence-foundation':'building-foundation',maximumGap:.025,maximumEmbedDepth:1.75});
 }
 const packedIndices=new Uint16Array(retainedIndices.map(i=>remap.get(i)));assert(used.length<65536);
 kept.push({name,nodeId,sourceMeshId:node.mesh,sourceNodeName:node.name,sourceTriangles:indices.length/3,triangles:packedIndices.length/3,attributes,indices:packedIndices,bounds:complete(bounds)});
}
visibleBounds.min[1]=0;
assert.equal(sourceTriangles,10955);assert.equal(kept.reduce((n,p)=>n+p.triangles,0),10669);assert.equal(contacts.length,15);
const buffers=[],bufferViews=[],accessors=[],nodes=[],meshes=[];let bufferLength=0;
function view(bytes,target){
 const pad=(4-bufferLength%4)%4;if(pad){buffers.push(Buffer.alloc(pad));bufferLength+=pad;}
 const index=bufferViews.length;bufferViews.push({buffer:0,byteOffset:bufferLength,byteLength:bytes.length,...(target?{target}:{})});buffers.push(bytes);bufferLength+=bytes.length;return index;
}
function accessor(array,type,componentType,bounds){
 const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),index=accessors.length;
 accessors.push({bufferView:view(bytes,type==='SCALAR'?34963:34962),componentType,count:array.length/({SCALAR:1,VEC2:2,VEC3:3}[type]),type,...(bounds?{min:bounds.min,max:bounds.max}:{})});return index;
}
for(const part of kept){
 const attributes={POSITION:accessor(part.attributes.POSITION,'VEC3',5126,part.bounds),NORMAL:accessor(part.attributes.NORMAL,'VEC3',5126),TEXCOORD_0:accessor(part.attributes.TEXCOORD_0,'VEC2',5126)};
 const index=meshes.length;meshes.push({name:part.name,primitives:[{attributes,indices:accessor(part.indices,'SCALAR',5123),material:0,mode:4}]});
 nodes.push({name:part.name,mesh:index,extras:{sourcePart:part.name,sourceNodeId:part.nodeId,museumComponent:'site118-source-structure'}});
}
const image=doc.images[doc.textures[0].source],imageView=doc.bufferViews[image.bufferView];
const imageBytes=source.subarray(binaryOffset+(imageView.byteOffset||0),binaryOffset+(imageView.byteOffset||0)+imageView.byteLength);
const imageBufferView=view(imageBytes);
const outputDoc={asset:{...doc.asset,generator:'Baikonur 3D / reviewed ground-cover removal',copyright:'novusod · CC BY 4.0 · source ground coverings removed for RocketTrip'},
 scene:0,scenes:[{name:'Пл.118 · промышленная площадка из исходной модели',nodes:nodes.map((_,i)=>i),extras:{museumAsset:VERSION,unit:'metre',sourceGroundRemoved:true}}],
 nodes,meshes,materials:[structuredClone(doc.materials[0])],textures:[{source:0,sampler:0}],samplers:[structuredClone(doc.samplers?.[doc.textures[0].sampler||0]||{})],
 images:[{name:image.name||'Original source structure atlas',mimeType:image.mimeType,bufferView:imageBufferView}],accessors,bufferViews,buffers:[{byteLength:bufferLength}]};
outputDoc.materials[0].pbrMetallicRoughness.baseColorTexture.index=0;
let json=Buffer.from(JSON.stringify(outputDoc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
let bin=Buffer.concat(buffers);bin=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const header=Buffer.alloc(20),chunk=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length+8+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);chunk.writeUInt32LE(bin.length,0);chunk.writeUInt32LE(0x004e4942,4);
const asset=Buffer.concat([header,json,chunk,bin]);
const credit=doc.asset.extras;
const manifest={version:VERSION,sourceFile:'sewage_facility.glb',sourceDriveId:'1ohcMUcDMZRJTHadaqJMcMTbBSVP7-Ozb',sourceBytes:source.length,sourceSha256:SOURCE_SHA,sourceTriangles,
 author:'novusod',sourceUrl:credit.source,license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
 normalization:{unit:'metre',up:'+Y',scale:1,translation:offset,sourceGroundY:0,modelGroundY:0,worldGroundY:-2.755,interpretation:'Original source units retained 1:1 and displayed as metres; this asset is an illustrative industrial exhibit, not a survey of Site 118.'},
 adaptation:{removed,retainedBelowGround:'Cylinder_3 is the original underground pipe network. Its geometry remains below source Y=0; no excavation or vertical relocation is introduced.',geometryDecimated:false,retainedSourceStructuresPreserved:true,originalStructureTexturePreserved:true},
 bounds:complete(fullBounds),aboveGroundBounds:complete(visibleBounds),
 retained:kept.map(p=>({name:p.name,sourceNodeId:p.nodeId,sourceNodeName:p.sourceNodeName,sourceMeshId:p.sourceMeshId,sourceTriangles:p.sourceTriangles,triangles:p.triangles,vertices:p.attributes.POSITION.length/3,bounds:p.bounds,
  geometrySha256:Object.fromEntries([...Object.entries(p.attributes),['indices',p.indices]].map(([key,a])=>[key,sha(Buffer.from(a.buffer,a.byteOffset,a.byteLength))]))})),
 contacts,groundNegativeProbes:[['former-west-lawn',[-41,0,12]],['former-north-lawn',[0,0,-31]],['former-yard',[6,0,-20]],['former-drive',[-16,0,-30]],['former-back-walk',[1.8,0,14]],['former-side-asphalt',[15,0,-12]]].map(([id,p])=>({id,point:p.map((x,i)=>x+offset[i])})),
 asset:{file:'model-v1.glb',bytes:asset.length,sha256:sha(asset),triangles:10669,primitives:4,materials:1,textures:1,textureSha256:sha(imageBytes)}};
assert(asset.length<2200000);
await mkdir(output,{recursive:true});await writeFile(resolve(output,'model-v1.glb'),asset);await writeFile(resolve(output,'manifest-v1.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({version:VERSION,...manifest.asset,bounds:manifest.bounds,aboveGroundBounds:manifest.aboveGroundBounds,contacts:contacts.length,removedTriangles:sourceTriangles-manifest.asset.triangles},null,2));
