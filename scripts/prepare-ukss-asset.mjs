#!/usr/bin/env node
// npm install --prefix /tmp/ukss-tools @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 meshoptimizer@0.25.0
// node scripts/prepare-ukss-asset.mjs --source recovered.glb --output assets/models/ukss --deps /tmp/ukss-tools/node_modules
// Input is the full, unnormalized recovery from scripts/source-models/ukss/.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
assert.ok(args.source&&args.output,'Required: --source recovered.glb --output assets/models/ukss [--deps node_modules]');
const modules=args.deps?resolve(args.deps):null;
const dependency=async(name,file)=>import(modules?pathToFileURL(resolve(modules,name,file)).href:name);
const {NodeIO}=await dependency('@gltf-transform/core','dist/index.js');
const {ALL_EXTENSIONS}=await dependency('@gltf-transform/extensions','dist/index.js');
const {join,weld,prune,meshopt,compactPrimitive,transformMesh,simplifyPrimitive}=await dependency('@gltf-transform/functions','dist/index.js');
const {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier}=await dependency('meshoptimizer','index.module.js');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const detail=args.detail||'macro';assert.ok(['full','macro'].includes(detail),'--detail must be full or macro');
const policy=JSON.parse(await readFile(new URL('./ukss-detail-policy.json',import.meta.url),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceBytes=await readFile(args.source);
const RAW_SHA='c07c0b6fc00691f4d1555296ba7f0389b0139306e56599df46e58c38c402776f';
assert.equal(hash(sourceBytes),RAW_SHA,'Input must be the validated complete UKSS recovery');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const doc=await io.readBinary(sourceBytes),root=doc.getRoot();
const origin=[-0.00013896613381803036,-0.000024069480787147768,-0.0004993951451268686];
const scale=1; // Recovered MAX coordinates are metres: twin track axes are 20 m apart.
const priorDisplayNormalization=0.687885342706393;
const transformed=(v,m)=>[m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
const normalize=v=>v.map((x,i)=>(x-origin[i])*scale);
const rawPolygon=[[-42.53425,90.03967],[-42.53428,-61.64229],[-111.45249,-70.5381],[-111.43124,-75.50345],[-27.60283,-93.79462],[19.08118,-93.79444],[30.96891,-93.56306],[85.22744,-72.46252],[172.61719,-40.22198],[192.6486,-31.19257],[331.4539,-9.58538],[331.4539,11.44739],[192.6486,30.29797],[172.61719,41.50147],[86.59748,67.84168],[30.95284,88.38869],[18.59987,90.03835]];
const sourceIds=root.listNodes().flatMap(n=>Number.isInteger(n.getExtras().sourceSceneIndex)?[n.getExtras().sourceSceneIndex]:[]);
assert.equal(sourceIds.length,7119);assert.equal(new Set(sourceIds).size,7119);
let removed=0,lotokBefore=0;
const lotok=root.listNodes().find(n=>n.getExtras().sourceSceneIndex===522);assert.ok(lotok);
const m=lotok.getWorldMatrix();
for(const primitive of lotok.getMesh().listPrimitives()){
  assert.equal(primitive.getMaterial().getName(),'Lotok');
  const index=primitive.getIndices(),positions=primitive.getAttribute('POSITION'),kept=[],v=[];
  assert.ok(index);lotokBefore+=index.getCount()/3;
  for(let f=0;f<index.getCount();f+=3){
    const triangle=[index.getScalar(f),index.getScalar(f+1),index.getScalar(f+2)];
    const flat=triangle.every(i=>{positions.getElement(i,v);return Math.abs(transformed(v,m)[1]-origin[1])<=.02;});
    if(flat)removed++;else kept.push(...triangle);
  }
  index.setArray(new Uint32Array(kept));compactPrimitive(primitive);
}
assert.equal(lotokBefore,127);assert.equal(removed,37);

// Two recovered source boxes had no material assigned. Give the small elevated
// bar the structural metal and the ground block the existing concrete finish.
const unassignedMaterials={1969:'Ferm_grey',25209:'Concrete_white'};
for(const node of root.listNodes())for(const primitive of node.getMesh()?.listPrimitives()||[]){
 if(primitive.getMaterial())continue;
 const materialName=unassignedMaterials[node.getExtras().sourceSceneIndex];assert.ok(materialName,'Unreviewed source material fallback');
 primitive.setMaterial(root.listMaterials().find(m=>m.getName()===materialName));
}
const optimization={profile:detail,removedFineObjects:0,removedFineTriangles:0,lightCylinders:0,lightTrianglesRemoved:0,simplifiedPrimitives:0,trianglesRemovedBySimplification:0,maximumSurfaceErrorLocal:detail==='macro'?policy.maximumSurfaceErrorLocal:0,protectedStructureSourceIds:policy.keepSourceGeometryNodeIds,protectedLatticeCount:63,protectedFrameCount:2,fullReference:{triangles:265392,bytes:1441156}};
function countMesh(mesh){return mesh.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);}
function simpleLightCylinder(primitive){
 const source=primitive.getAttribute('POSITION'),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],v=[];
 for(let i=0;i<source.getCount();i++){source.getElement(i,v);v.forEach((x,j)=>{lo[j]=Math.min(lo[j],x);hi[j]=Math.max(hi[j],x);});}
 assert.ok(Math.abs((hi[0]-lo[0])-(hi[2]-lo[2]))<1e-5,'Reviewed light must be a circular Y-axis cylinder');
 const sides=policy.lightRadialSides,r=(hi[0]-lo[0])/2,cx=(lo[0]+hi[0])/2,cz=(lo[2]+hi[2])/2;
 const positions=[],normals=[],indices=[];
 const vertex=(x,y,z,nx,ny,nz)=>{const i=positions.length/3;positions.push(x,y,z);normals.push(nx,ny,nz);return i;};
 for(let i=0;i<=sides;i++){
  const a=i*Math.PI*2/sides,c=Math.cos(a),s=Math.sin(a);vertex(cx+r*c,lo[1],cz+r*s,c,0,s);vertex(cx+r*c,hi[1],cz+r*s,c,0,s);
  if(i<sides){const a=i*2,b=a+2;indices.push(a,a+1,b,b,a+1,b+1);}
 }
 for(const [y,ny]of [[lo[1],-1],[hi[1],1]]){
  const center=vertex(cx,y,cz,0,ny,0),start=positions.length/3;
  for(let i=0;i<sides;i++){const a=i*Math.PI*2/sides;vertex(cx+r*Math.cos(a),y,cz+r*Math.sin(a),0,ny,0);}
  for(let i=0;i<sides;i++){const a=start+i,b=start+(i+1)%sides;indices.push(...(ny>0?[center,b,a]:[center,a,b]));}
 }
 const buffer=root.listBuffers()[0];
 primitive.setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer));
 primitive.setAttribute('NORMAL',doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer));
 primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer));
 for(const semantic of primitive.listSemantics())if(!['POSITION','NORMAL'].includes(semantic))primitive.setAttribute(semantic,null);
}
if(detail==='macro'){
 const tiny=new Set(policy.removeFineSourceNodeIds),lights=new Set(policy.lightCylinderSourceNodeIds);
 for(const node of root.listNodes()){
  const mesh=node.getMesh();if(!mesh)continue;const id=node.getExtras().sourceSceneIndex;
  if(tiny.has(id)){optimization.removedFineObjects++;optimization.removedFineTriangles+=countMesh(mesh);node.setMesh(null);continue;}
  if(lights.has(id)){
   assert.equal(mesh.listPrimitives().length,1);const p=mesh.listPrimitives()[0];assert.ok(p.getMaterial().getName().startsWith('Light'));
   const before=countMesh(mesh);simpleLightCylinder(p);optimization.lightCylinders++;optimization.lightTrianglesRemoved+=before-countMesh(mesh);
  }
 }
 assert.equal(optimization.removedFineObjects,360);assert.equal(optimization.removedFineTriangles,6276);assert.equal(optimization.lightCylinders,727);
}

// Preserve material roles, including a separate selectable dimensional mockup.
// Colors are sRGB values chosen against the user's current and historical site photographs.
const palette={
  Lotok:['999483',0,.96],Shield:['705541',.45,.84],BlastWalls:['918b7b',0,.94],LPad:['c1bfb3',0,.95],
  Ferm_green:['536850',.3,.78],Ferm_black:['343b3b',.4,.76],Concrete_white:['c7c4b6',0,.98],
  Building_1:['b6b7aa',0,.93],Building_2:['c4c1b2',0,.93],Ferm_grey:['89918d',.38,.73],
  Telega:['718882',.38,.77],Grey:['969b95',.28,.79],Ferm_lightgrey:['b1b6ae',.3,.72],
  Ryzh:['8a5c36',.38,.9],Ferm_white:['c8cbc2',.24,.72],BlastPad:['96998e',.35,.88],
  KrioTubes:['95694e',.43,.84],Glass:['b3c8be',.05,.2],Yellow_concrete:['c3b797',0,.97],
  Ryzh_light:['aa925d',.32,.87],Light:['d6d6bd',.2,.48],Rails:['5d625f',.62,.61],
  Bordo:['8d4036',.22,.8],Tower_2:['657a70',.35,.82],Wheels:['424945',.62,.7],Ferm_red:['b24736',.25,.76]
};
const srgb=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
for(const material of root.listMaterials()){
  const name=material.getName(),p=palette[name]||palette[name.replace(/ \[source \d+\]$/,'')];assert.ok(p,'Missing material '+name);
  const color=[0,2,4].map(i=>srgb(parseInt(p[0].slice(i,i+2),16)/255));
  material.setBaseColorFactor([...color,name==='Glass'?.5:1]).setMetallicFactor(p[1]).setRoughnessFactor(p[2]);
  for(const ext of material.listExtensions())material.setExtension(ext.extensionName,null);
  material.setExtras({sourceMaterialName:name,museumComponent:name==='Bordo'?'ukss-dimensional-mockup':'ukss-structure'});
}
// The source has no images. Unused UV sets only prevent otherwise identical
// material batches from joining, so remove those attributes before batching.
assert.equal(root.listTextures().length,0);
for(const mesh of root.listMeshes())for(const primitive of mesh.listPrimitives()){
 for(const semantic of primitive.listSemantics())if(semantic.startsWith('TEXCOORD_'))primitive.setAttribute(semantic,null);
}
// Scale-helper hierarchies can contain affine shear. Decomposing their world
// matrices during flattening changes the shapes of thin source components.
// Bake the complete matrix directly before discarding the original hierarchy.
assert.equal(root.listScenes().length,1);
const originalScene=root.listScenes()[0],originalNodes=root.listNodes();
const normalizedMatrix=matrix=>matrix.map((value,i)=>i%4===3?value:(value-(i>=12?origin[i-12]:0))*scale);
const parts=originalNodes.filter(n=>n.getMesh()).map(n=>({name:n.getName(),mesh:n.getMesh().clone(),matrix:n.getWorldMatrix(),extras:n.getExtras()}));
for(const child of originalScene.listChildren())originalScene.removeChild(child);
for(const part of parts){
 transformMesh(part.mesh,normalizedMatrix(part.matrix));
 originalScene.addChild(doc.createNode(part.name).setMesh(part.mesh).setExtras(part.extras));
}
for(const node of originalNodes)node.dispose();
await doc.transform(prune());
if(detail==='macro'){
 const protectedNodes=new Set(policy.keepSourceGeometryNodeIds),protectedMaterials=new Set(['Lotok','LPad','BlastWalls','Shield','Rails','Tower_2','BlastPad','Building_1','Building_2','Yellow_concrete','Concrete_white','Bordo']);
 await doc.transform(weld());
 for(const node of root.listNodes()){
  const mesh=node.getMesh();if(!mesh||protectedNodes.has(node.getExtras().sourceSceneIndex))continue;
  for(const p of mesh.listPrimitives()){
   const name=p.getMaterial().getName();if(protectedMaterials.has(name)||name.startsWith('Light'))continue;
   const before=p.getIndices().getCount()/3;if(before<24)continue;
   const range=MeshoptSimplifier.getScale(p.getAttribute('POSITION').getArray(),3);if(range<=0)continue;
   simplifyPrimitive(p,{simplifier:MeshoptSimplifier,ratio:.45,error:policy.maximumSurfaceErrorLocal/range,lockBorder:false});
   const after=p.getIndices().getCount()/3;
   if(after<before){optimization.simplifiedPrimitives++;optimization.trianglesRemovedBySimplification+=before-after;}
  }
 }
}
await doc.transform(join({keepNamed:false}),weld(),prune());
// Simplification is constrained per source component; the final batch merge
// does not decimate the protected structures, real trench, or connection rails.
await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
for(const node of root.listNodes())node.setExtras({});
for(const mesh of root.listMeshes())mesh.setName('УКСС · конструкции по исходной модели').setExtras({});
const scene=root.getDefaultScene()||root.listScenes()[0];scene.setName('Площадка 250 · УКСС');
scene.setExtras({museumAsset:'ukss-drive-model-v2',sourceFile:'ukss_scaled.max'});
const binary=await io.writeBinary(doc),decoded=await io.readBinary(binary);
const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
let triangles=0,primitives=0,vertices=0,mockupTriangles=0;
for(const node of decoded.getRoot().listNodes()){
 const mesh=node.getMesh();if(!mesh)continue;
 const matrix=node.getWorldMatrix();
 for(const primitive of mesh.listPrimitives()){
   primitives++;const positions=primitive.getAttribute('POSITION'),v=[];vertices+=positions.getCount();
   const count=(primitive.getIndices()?.getCount()||positions.getCount())/3;triangles+=count;
   if(primitive.getMaterial()?.getExtras().museumComponent==='ukss-dimensional-mockup')mockupTriangles+=count;
   for(let i=0;i<positions.getCount();i++){
     positions.getElement(i,v);const point=transformed(v,matrix);assert.ok(point.every(Number.isFinite));
     point.forEach((x,j)=>{bounds.min[j]=Math.min(bounds.min[j],x);bounds.max[j]=Math.max(bounds.max[j],x);});
   }
 }
}
assert.equal(triangles,265429-37-optimization.removedFineTriangles-optimization.lightTrianglesRemoved-optimization.trianglesRemovedBySimplification,'All removals must be accounted for');
assert.ok(mockupTriangles>10000&&mockupTriangles<=30753);assert.ok(primitives<=32,'Material merging must reduce draw calls');
const manifest={
 version:'ukss-drive-model-v2',sourceFile:'ukss_scaled.max',
 sourceUrl:'https://drive.google.com/file/d/1z16hlw1grFyH_MqVk9f4B8Nm48FjX4f7/view',
 sourceSha256:'2e51706e5267564fba9fd6d90262a2fb67f3d84ccfd7c3a002b23895fc704ebb',
 recoverySha256:RAW_SHA,assetSha256:hash(binary),bounds,
 sourceStats:{originalNodeCount:7119,recoveredNodeCount:7119,sourceTriangles:265429,sourceMaterials:28,removedFlatGroundTriangles:37,retainedTriangles:triangles,mockupTriangles:30753,textures:0},
 assetStats:{bytes:binary.byteLength,triangles,primitives,vertices,materials:decoded.getRoot().listMaterials().length,textures:0,mockupTriangles},optimization,
 normalization:{origin,scale,rotationY:0,unit:'metre',basis:'Source metric coordinates; 19.997 m between twin rail axes; launch center from BlastPad and grade from Lotok; no independent height fitting',outerMuseumScale:.14,outerMuseumYaw:-.56},
 terrainCutout:{polygon:rawPolygon.map(([x,z])=>[(x-origin[0])*scale,(z-origin[2])*scale]),floorY:normalize([0,-35.30587525355713,0])[1],sourceSceneIndex:522,basis:'17-vertex inner boundary of the removed connected flat Lotok background; not its outer footprint'},
 components:{dimensionalMockup:{sourceGroup:28436,material:'Bordo',triangleCount:mockupTriangles,defaultVisible:false},tower:{configuration:'at-launch-position',bounds:{min:normalize([-19.3568453,.0095183,-31.1792496]),max:normalize([19.356747,76.1051678,10.5861497])}}},
 connections:{railSourceEndpoints:[normalize([-10.002198033582918,.07107536324432928,274.4870634270286]),normalize([9.99507731889511,.07107536324432928,274.4870634270286])],railSourceGauge:1.650303*scale,museumRailSockets:[[-18,1.55,227],[18,1.55,227]].map(p=>p.map(v=>v/priorDisplayNormalization)),museumRoadSocket:[-40,.2,225].map(v=>v/priorDisplayNormalization)},
 camera:{
   overview:{target:[25,35,-8],eye:[310,245,345]},
   tower:{target:[0,28,-5],eye:[-62,70,100]},
   trench:{target:[65,-5,0],eye:[260,160,175]},
   top:{target:[-67,0,-58],eye:[-67,680,-57.95]}
 },
 conversion:{blender:'4.2.23 LTS',importer:'nrgsille76/io_scene_max@37db107126f956f7219152671443080360565691',gltfTransform:'4.5.1',meshoptimizer:'0.25.0',compression:'EXT_meshopt_compression',positionBits:16,normalBits:12,decimation:detail==='macro',externalResources:false},
 materialAdaptation:{unassignedSourceBoxes:unassignedMaterials,palette:'Muted material-role palette matched to supplied site photographs; no external textures'},
 notes:['Museum detail profile preserves the composition, silhouettes and major assemblies while removing reviewed tiny objects and unnecessary curved-surface subdivisions.','37 flat background triangles replaced by museum terrain; all 90 real Lotok triangles retained.','Source dimensional mockup is a separate optional display component, hidden initially.','Source static hidden/renderable flags remain undecoded; they are not used to remove geometry.','Original source axes and all component proportions preserved under one uniform normalization.']
};
for(const view of Object.values(manifest.camera)){view.target=view.target.map(v=>v/priorDisplayNormalization);view.eye=view.eye.map(v=>v/priorDisplayNormalization);}
manifest.rocketMount={position:[0,6.055,0],rotation:[0,Math.PI,0],units:'metres',basis:'Source BlastPad upper support plane; payload faces away from service tower'};
await mkdir(args.output,{recursive:true});
await writeFile(resolve(args.output,'model-v2.glb'),binary);
await writeFile(resolve(args.output,'manifest-v2.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({assetStats:manifest.assetStats,bounds,assetSha256:manifest.assetSha256,removedFlatGroundTriangles:removed},null,2));
