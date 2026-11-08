import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,join,weld,meshopt,getBounds} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
const [rawPath,croppedPath]=process.argv.slice(2);
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const raw=await readFile(rawPath),doc=await io.read(croppedPath);
doc.getRoot().getAsset().copyright='Metazeon · CC BY 4.0 · cropped, flattened and simplified for Baikonur 3D';
await doc.transform(prune(),dedup(),join(),weld(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:8,quantizeTexcoord:12}));
const binary=await io.writeBinary(doc),decoded=await io.readBinary(binary),root=decoded.getRoot(),bounds=getBounds(root.listScenes()[0]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest={version:'kosmotrans-depot-20261108-v1',sourceDriveId:'1RskdMA0OTrYb4-bAqjwLQ3TD0FnK0Pn9',sourceFile:'railway_maintenance_depot_and_diesel_locomotive.glb',sourceBytes:raw.length,sourceSha256:sha(raw),sourceTriangles:951239,author:'Metazeon',license:'CC-BY-4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',sourceUrl:'https://sketchfab.com/3d-models/railway-maintenance-depot-and-diesel-locomotive-0eaba418418447169f4d6a2f4926d4e9',
 adaptation:{unit:'metre',up:'+Y',illustrative:true,cropSourceXY:[[-92,65],[-10,283]],removed:'Outer main line, northern approaches and ragged scan perimeter',ground:'Flattened scanned apron; no terrain mound',texture:[1024,1024],placementMap:[566.5,550],placementBasis:'Owner: west/left of main AD, at Kosmotrans latitude; not an OSM surveyed depot footprint'},
 bounds:{min:bounds.min,max:bounds.max,size:bounds.max.map((n,i)=>n-bounds.min[i])},
 asset:{bytes:binary.length,sha256:sha(binary),triangles:root.listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+p.getIndices().getCount()/3,0),0),primitives:root.listMeshes().reduce((n,m)=>n+m.listPrimitives().length,0),textures:root.listTextures().length}};
if(binary.length>1500000||manifest.asset.triangles>55000)throw Error('Depot exceeds budget');
await mkdir('assets/models/kosmotrans-depot',{recursive:true});await writeFile('assets/models/kosmotrans-depot/model.glb',binary);await writeFile('assets/models/kosmotrans-depot/manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
