// node scripts/source-models/soyuz5/optimize.mjs raw.glb original.blend
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const raw=await readFile(process.argv[2]),source=await readFile(process.argv[3]),doc=await io.readBinary(raw);
const triangleCount=d=>d.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0);
const before=triangleCount(doc);await doc.transform(dedup(),weld(),prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
const bytes=await io.writeBinary(doc),decoded=await io.readBinary(bytes),r=decoded.getRoot();
const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let primitives=0,vertices=0;
for(const n of r.listNodes())for(const p of n.getMesh()?.listPrimitives()||[]){
 const m=n.getWorldMatrix(),pos=p.getAttribute('POSITION'),v=[];primitives++;vertices+=pos.getCount();
 for(let i=0;i<pos.getCount();i++){pos.getElement(i,v);for(let j=0;j<3;j++){const x=m[j]*v[0]+m[j+4]*v[1]+m[j+8]*v[2]+m[j+12];bounds.min[j]=Math.min(bounds.min[j],x);bounds.max[j]=Math.max(bounds.max[j],x);}}
}
bounds.size=bounds.max.map((n,i)=>n-bounds.min[i]);const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest={version:'rocket-exhibits-v1',id:'soyuz5',assetRevision:'soyuz5-20261108-v1',source:{name:'Soyuz 5.blend',driveFileId:'1J9pJXNADD8BL-z5Lz7CBoLoEoS5AIVtj',url:'https://drive.google.com/file/d/1J9pJXNADD8BL-z5Lz7CBoLoEoS5AIVtj/view',bytes:source.length,sha256:sha(source)},asset:{path:'soyuz5.glb',bytes:bytes.length,sha256:sha(bytes)},normalization:{unit:'metre',up:'Y',scale:1,origin:'Centreline at lowest nozzle point; source proportions preserved'},bounds,statistics:{triangles:triangleCount(decoded),sourceTriangles:before,vertices,primitives,meshes:r.listMeshes().length,materials:r.listMaterials().length,textures:r.listTextures().map(t=>({name:t.getName(),mimeType:t.getMimeType(),size:t.getSize(),bytes:t.getImage().length}))},optimization:{geometryDecimated:false,positionBits:16,normalBits:12,uvBits:14,removed:'Cameras, lights, empty helper and packed environment maps',logos:'Original shader colours baked at 512 × 2048; original rocket UVs preserved'},notes:['Concept-era source geometry is preserved; it is not identified as the as-flown April 2026 configuration.','Source mesh bounding height is not a specification for every Soyuz-5 configuration.']};
await writeFile('assets/models/rockets/soyuz5.glb',bytes);await writeFile('assets/models/rockets/soyuz5.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
