/** Complete export.py output with embedded compressed textures, Meshopt and manifest.
 * ROAD_FLEET_NODE_ROOT=/path/with/package.json node optimize.mjs INPUT_DIR REPO_DIR SOURCE_DIR
 * Dependencies: @gltf-transform/{core,extensions,functions} 4.5.1,
 * meshoptimizer 0.25, sharp. No network requests and no source downloads.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(process.env.ROAD_FLEET_NODE_ROOT?path.join(process.env.ROAD_FLEET_NODE_ROOT,'package.json'):import.meta.url);
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {dedup,prune,weld,meshopt,textureCompress,getBounds,palette,join}=require('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder}=require('meshoptimizer');
const sharp=require('sharp');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const [inputDir,repoDir,sourceDir]=process.argv.slice(2);
if(!inputDir||!repoDir||!sourceDir) throw new Error('INPUT_DIR REPO_DIR SOURCE_DIR are required');
const ids=process.argv[5]?.split(',')||['land-cruiser','uaz-patriot','uaz-bukhanka'];
const sources={
 'land-cruiser':{file:'land-cruiser.glb',originalFilename:'2024_toyota_land_cruiser_lc300_vxr_409_tt.glb',driveId:'1EuCQNJy_yFCbHGYr2oWcst_PHeFtxic3',label:'Toyota Land Cruiser LC300'},
 'uaz-patriot':{file:'vehicle-extra.glb',originalFilename:'baa2ffb6f97348ce9712a4edd4e41093.glb',driveId:'11dFkeOzSII6GM29STYQ4Q8IHkhrbnZlD',label:'УАЗ Патриот'},
 'uaz-bukhanka':{file:'bukhanka.glb',originalFilename:'452_not_ready.glb',driveId:'1ov8vdZAgSO_H7LNZoJ4_TjizI5hI67wc',label:'УАЗ-452 «Буханка»'},
};
const lightAnchors={
 'land-cruiser':{head:[.69,.95,2.40],tail:[.78,1.13,-2.37]},
 'uaz-patriot':{head:[.66,1.09,2.18],tail:[.88,1.28,-2.12]},
 'uaz-bukhanka':{head:[.65,.97,2.15],tail:[.85,.94,-2.13]},
};
const sha=b=>createHash('sha256').update(b).digest('hex');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
for(const id of ids){
 const src=sources[id], sourceBytes=await fs.readFile(path.join(sourceDir,src.file));
 const sourceJson=JSON.parse(sourceBytes.subarray(20,20+sourceBytes.readUInt32LE(12)).toString());
 const source={...src,...sourceJson.asset.extras,bytes:sourceBytes.length,sha256:sha(sourceBytes),driveUrl:`https://drive.google.com/file/d/${src.driveId}/view`};
 const conversion=JSON.parse(await fs.readFile(path.join(inputDir,id+'.conversion.json'),'utf8'));
 const doc=await io.read(path.join(inputDir,id+'.raw.glb'));
 doc.getRoot().getAsset().copyright=`${source.title} — ${source.author}. ${source.license}. Modified for road traffic: simplification, material adaptation, metric normalization, four separate wheel assemblies.`;
 doc.getRoot().setExtras({source,adaptation:{id,paint:conversion.paint,unit:'metre',forward:'+Z',version:'road-fleet-20261108-v1'}});
 await doc.transform(dedup(),weld(),prune(),palette({min:2}),join({keepMeshes:true}),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],quality:82}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
 const out=path.join(repoDir,'assets/models/road-fleet',id);await fs.mkdir(out,{recursive:true});
 await io.write(path.join(out,'model.glb'),doc);
 const data=await fs.readFile(path.join(out,'model.glb'));
 const check=await io.readBinary(data),root=check.getRoot();
 const bounds=getBounds(root.listScenes()[0]);
 const size=bounds.max.map((v,i)=>v-bounds.min[i]);
 let triangles=0,primitives=0;for(const m of root.listMeshes())for(const p of m.listPrimitives()){triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;primitives++;}
 const lights=[];for(const kind of ['head','tail'])for(const sign of [-1,1]){const [x,y,z]=lightAnchors[id][kind];lights.push({kind,position:[sign*x,y,z]});}
 const wheels=conversion.wheels.map(w=>({...w,center:w.center.map(v=>+v.toFixed(6)),radius:+w.radius.toFixed(6)}));
 for(const w of wheels){if(!root.listNodes().find(n=>n.getName()===w.name))throw new Error(`${id}: missing ${w.name}`);}
 const manifest={version:'road-fleet-20261108-v1',id,label:src.label,unit:'metre',forward:'+Z',paint:conversion.paint,halfWidth:Math.max(Math.abs(bounds.min[0]),Math.abs(bounds.max[0])),bounds:{min:bounds.min,max:bounds.max,size},asset:{file:'model.glb',bytes:data.length,triangles,primitives,textures:root.listTextures().length,sha256:sha(data)},wheels,lights,source,modifications:['Removed high-poly hidden interior where applicable; exterior identity preserved.','Original tyre/rim geometry separated into four rotating assemblies.','Simplified topology, embedded textures resized to <=512 px and encoded as WebP.','Metric normalization, +Y up, +Z forward, wheel contact at y=0.',id==='land-cruiser'?'Body paint changed to black; original NC-SA licence retained.':id==='uaz-bukhanka'?'Olive paint polygons assigned grey PBR materials; glass, lamps and rubber retain their atlases.':'Original body paint retained.']};
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({id,bytes:data.length,triangles,primitives,textures:root.listTextures().length,bounds:manifest.bounds}));
}
