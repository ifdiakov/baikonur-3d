#!/usr/bin/env node
// npm install --prefix /tmp/tua-tools @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 meshoptimizer@0.25.0
// node scripts/prepare-tua-asset.mjs --source tua_recovered_raw.glb --output assets/models/tua --deps /tmp/tua-tools/node_modules
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
assert.ok(args.source&&args.output,'Required: --source recovered.glb --output assets/models/tua [--deps node_modules] [--detail macro|full]');
const modules=args.deps?resolve(args.deps):null;
const dependency=(name,file)=>import(modules?pathToFileURL(resolve(modules,name,file)).href:name);
const {NodeIO}=await dependency('@gltf-transform/core','dist/index.js');
const {ALL_EXTENSIONS}=await dependency('@gltf-transform/extensions','dist/index.js');
const {join,weld,prune,meshopt,transformMesh}=await dependency('@gltf-transform/functions','dist/index.js');
const {MeshoptEncoder,MeshoptDecoder}=await dependency('meshoptimizer','index.module.js');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const detail=args.detail||'full';assert.ok(['full','macro'].includes(detail));
const policy=JSON.parse(await readFile(new URL('./tua-detail-policy.json',import.meta.url),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=await readFile(args.source);
const RAW_SHA='1105ff79202b2b42e86cc3150e41e2d4d01667d0b6ae25a72283aabea43c065a';
assert.equal(hash(bytes),RAW_SHA,'Use the validated complete recovery from scripts/source-models/tua');
assert.equal(policy.recoverySha256,RAW_SHA);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const doc=await io.readBinary(bytes),root=doc.getRoot();
const countMesh=mesh=>mesh.listPrimitives().reduce((sum,p)=>sum+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0);
const sourceIds=root.listNodes().flatMap(n=>Number.isInteger(n.getExtras().sourceSceneIndex)?[n.getExtras().sourceSceneIndex]:[]);
assert.equal(sourceIds.length,2786);assert.equal(new Set(sourceIds).size,2786);
const selected=new Set(policy.selection.vehicleSourceIDs),fine=new Set(policy.removeFineSplineSourceIDs),protectedIds=new Set(policy.runningGear.protectedSourceIDs);
assert.equal(selected.size,2364);assert.equal(fine.size,920);assert.equal(protectedIds.size,320);
for(const id of protectedIds){assert.ok(selected.has(id));assert.ok(!fine.has(id));}
let sourceTriangles=0,selectedTriangles=0,selectedMeshes=0,removedFineTriangles=0,removedFineObjects=0,protectedTriangles=0;
const retainedIds=[],retainedProtectedIds=[];
for(const node of root.listNodes()){
 const mesh=node.getMesh();if(!mesh)continue;
 const id=node.getExtras().sourceSceneIndex,count=countMesh(mesh);sourceTriangles+=count;
 if(!selected.has(id)){node.setMesh(null);continue;}
 selectedTriangles+=count;selectedMeshes++;
 if(detail==='macro'&&fine.has(id)){removedFineObjects++;removedFineTriangles+=count;node.setMesh(null);continue;}
 retainedIds.push(id);
 if(protectedIds.has(id)){retainedProtectedIds.push(id);protectedTriangles+=count;}
}
assert.equal(sourceTriangles,137269);assert.equal(selectedTriangles,93800);assert.equal(selectedMeshes,2351);
assert.equal(protectedTriangles,10432);assert.equal(retainedProtectedIds.length,320);
if(detail==='macro'){assert.equal(removedFineObjects,920);assert.equal(removedFineTriangles,45856);}
// Two unassigned Line objects remain in the vehicle selection; they receive an
// intentional metal material only if a detail profile retains their geometry.
const unassigned={21383:'Tube',23463:'Tube'},assigned=[];
for(const node of root.listNodes())for(const primitive of node.getMesh()?.listPrimitives()||[]){
 if(primitive.getMaterial())continue;
 const id=node.getExtras().sourceSceneIndex,name=unassigned[id];assert.ok(name,'Unreviewed TUA material fallback '+id);
 primitive.setMaterial(root.listMaterials().find(m=>m.getName()===name));assigned.push(id);
}
// MAX scale helpers produce affine world matrices which can contain shear.
// Bake each complete world matrix directly, before flattening or decomposing
// any hierarchy, so wheel radii and source component proportions stay exact.
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{
 const row=i%4,col=Math.floor(i/4);let sum=0;
 for(let k=0;k<4;k++)sum+=a[k*4+row]*b[col*4+k];return sum;
});
assert.equal(root.listScenes().length,1);
const originalScene=root.listScenes()[0];
const originalNodes=root.listNodes();
const parts=originalNodes.filter(n=>n.getMesh()).map(n=>({name:n.getName(),mesh:n.getMesh().clone(),matrix:n.getWorldMatrix(),extras:n.getExtras()}));
for(const child of originalScene.listChildren())originalScene.removeChild(child);
for(const part of parts){
 transformMesh(part.mesh,multiply(policy.normalization.rawGlbToLocalMatrixColumnMajor,part.matrix));
 originalScene.addChild(doc.createNode(part.name).setMesh(part.mesh).setExtras(part.extras));
}
for(const node of originalNodes)node.dispose();
await doc.transform(prune());
assert.equal(root.listTextures().length,0);
// Material roles are preserved; shades follow the current Drive photographs.
// No scene-wide "Loco" name filter: the vehicle shares some source materials.
const palette={
 TowerMain:['969e97',.35,.82],Main:['adb3ab',.32,.82],MainPolish:['9ca79f',.44,.73],
 Tube:['8c9990',.4,.79],Yellow:['bea45b',.28,.83],YellowGrey:['a48d54',.3,.84],
 BlackMetal:['37433d',.5,.8],LightBlackMetal:['69756c',.55,.77],Black:['232e28',.3,.91],
 TowerDeck:['727f76',.4,.84],PL_fit:['758278',.43,.78],glass:['668078',.1,.3],
 Light:['d0d8c7',.16,.5],LocoGrey:['9a9f96',.4,.83],LocoRoof:['777e75',.4,.85],
 BordoLight:['9c6e58',.32,.85]
};
const srgb=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
for(const material of root.listMaterials()){
 const name=material.getName(),p=palette[name];assert.ok(p,'Missing TUA palette role '+name);
 const color=[0,2,4].map(i=>srgb(parseInt(p[0].slice(i,i+2),16)/255));
 material.setBaseColorFactor([...color,1]).setMetallicFactor(p[1]).setRoughnessFactor(p[2]);
 material.setAlphaMode('OPAQUE');
 for(const ext of material.listExtensions())material.setExtension(ext.extensionName,null);
 material.setExtras({sourceMaterialName:name,museumComponent:'tua-transporter'});
}
for(const mesh of root.listMeshes())for(const primitive of mesh.listPrimitives()){
 for(const semantic of primitive.listSemantics())if(semantic.startsWith('TEXCOORD_'))primitive.setAttribute(semantic,null);
}
// Only reviewed fine objects are removed. The retained geometry is not
// decimated: perforations, fork silhouettes, cylinders and running gear survive.
await doc.transform(join({keepNamed:false}),weld(),prune());
await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
for(const node of root.listNodes())node.setExtras({});
for(const mesh of root.listMeshes())mesh.setName('ТУА · конструкции по исходной модели').setExtras({});
const scene=root.getDefaultScene()||root.listScenes()[0];scene.setName('ТУА «Кузнечик»');
scene.setExtras({museumAsset:'tua-drive-model-v2',sourceFile:'Transporter_railroad_assambly.MAX'});
const binary=await io.writeBinary(doc),decoded=await io.readBinary(binary);
const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
let triangles=0,primitives=0,vertices=0;const materialTriangles={};
const transform=(v,m)=>[m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
for(const node of decoded.getRoot().listNodes()){
 const mesh=node.getMesh();if(!mesh)continue;const matrix=node.getWorldMatrix();
 for(const p of mesh.listPrimitives()){
  primitives++;const pos=p.getAttribute('POSITION'),v=[],count=(p.getIndices()?.getCount()??pos.getCount())/3;
  triangles+=count;vertices+=pos.getCount();
  const name=p.getMaterial().getExtras().sourceMaterialName;materialTriangles[name]=(materialTriangles[name]||0)+count;
  for(let i=0;i<pos.getCount();i++){
   pos.getElement(i,v);const point=transform(v,matrix);assert.ok(point.every(Number.isFinite));
   point.forEach((x,j)=>{bounds.min[j]=Math.min(bounds.min[j],x);bounds.max[j]=Math.max(bounds.max[j],x);});
  }
 }
}
assert.equal(triangles,93800-removedFineTriangles);assert.ok(primitives<=20);
for(const edge of ['min','max'])for(let i=0;i<3;i++)assert.ok(Math.abs(bounds[edge][i]-policy.normalization.actualLocalBounds[edge][i])<.02,`Source composition bounds changed: ${edge}[${i}] ${bounds[edge][i]} versus ${policy.normalization.actualLocalBounds[edge][i]}`);
const normalization={uniformScale:policy.normalization.uniformScale,physicalOrigin:policy.normalization.physicalOrigin,
 sourcePhysicalAxes:policy.normalization.sourcePhysicalAxes,rawGlbToPhysicalRotationX:Math.PI/2,
 rawGlbToLocalMatrixColumnMajor:policy.normalization.rawGlbToLocalMatrixColumnMajor,localRailHeadY:0,outerMuseumScale:.14,outerMuseumYaw:-Math.PI/4,
 physicalUnits:policy.normalization.physicalUnits,sourceReferenceDimensionsM:policy.normalization.sourceReferenceDimensionsM,
 rocketMount:policy.normalization.rocketMount,
 configuration:'Authored transport pose in metres, no articulation or nonuniform resizing'};
const runningGear={...policy.runningGear,retainedSourceIDs:retainedProtectedIds.sort((a,b)=>a-b),retainedPartCount:retainedProtectedIds.length,retainedTriangleCount:protectedTriangles};
const manifest={
 version:'tua-drive-model-v2',sourceFile:'Transporter_railroad_assambly.MAX',
 sourceUrl:'https://drive.google.com/file/d/1wL_XlKyqexMrNoVIp90y0CNcVMkVC5In/view',
 sourceSha256:policy.sourceSha256,recoverySha256:RAW_SHA,assetSha256:hash(binary),bounds,
 sourceStats:{originalNodeCount:2786,recoveredNodeCount:2786,sourceTriangles:137269,sourceMaterials:20,
  selectedNodeCount:2364,selectedMeshCount:selectedMeshes,selectedTriangles,excludedAssemblyTriangles:137269-selectedTriangles,
  retainedSourceMeshCount:retainedIds.length,retainedTriangles:triangles,textures:0},
 assetStats:{bytes:binary.byteLength,triangles,primitives,vertices,materials:decoded.getRoot().listMaterials().length,textures:0,materialTriangles},
 optimization:{profile:detail,removedFineObjects,removedFineTriangles,retainedFineObjects:fine.size-removedFineObjects,
  retainedFineTriangles:45856-removedFineTriangles,fineSplineSourceDiameter:.03,fineSplineLocalDiameter:.03*policy.normalization.uniformScale,
  protectedRunningGearCount:320,protectedRunningGearTriangles:10432,retainedLargerSplines:46,retainedSourceMeshCount:retainedIds.length,
  decimatedTriangles:0,maximumSurfaceErrorLocal:0,fullReference:{triangles:93800,bytes:542380},
  excludedAssemblies:policy.selection.excludedSubtrees,
  rule:policy.rule},
 normalization,runningGear,placements:policy.normalization.placements,camera:policy.normalization.cameraMikLocal,
 railAdaptation:policy.railAdaptation,
 conversion:{blender:'4.2.23 LTS',importer:'nrgsille76/io_scene_max@37db107126f956f7219152671443080360565691',gltfTransform:'4.5.1',meshoptimizer:'0.25.0',
  compression:'EXT_meshopt_compression',positionBits:16,normalBits:12,decimation:false,externalResources:false},
 materialAdaptation:{unassignedSourceParts:assigned,palette:'Muted grey-green steel and weathered yellow forks, based on current Drive photographs; original material roles preserved'},
 notes:['One shared asset supplies the two independent museum placements.','Source payload, locomotives and source rails are excluded by reviewed source hierarchy; the complete recovery is preserved separately.',
  'All 320 running-gear parts and all major assemblies retain their source geometry.',
  detail==='full'?'All 920 reviewed thin spline objects are retained: the railings, ladders and walkway edges remain visible in the detailed model.':'Only 920 reviewed thin renderable splines are removed in the optional macro profile.',
  'Source rail-head height establishes grade; wheel flanges remain below the head as authored.','No textures or external resource dependencies.']
};
await mkdir(args.output,{recursive:true});
await writeFile(resolve(args.output,'model-v2.glb'),binary);
await writeFile(resolve(args.output,'manifest-v2.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({assetStats:manifest.assetStats,bounds,assetSha256:manifest.assetSha256,removedFineObjects,removedFineTriangles},null,2));
