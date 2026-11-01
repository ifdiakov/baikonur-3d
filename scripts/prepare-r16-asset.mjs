#!/usr/bin/env node
// Assemble the owner's printing meshes by their measured sockets, retaining
// the authored exterior. Inputs stay on Drive; identity and transforms are
// recorded alongside this script's deterministic, self-contained GLB output.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {BufferGeometry,BufferAttribute,Color,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3} from 'three';
import {r16VisualDetails} from './r16-visual-details.mjs';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {NodeIO,Document,Logger} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,weld,prune,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';

const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
assert.ok(args.source,'Usage: node scripts/prepare-r16-asset.mjs --source /path/to/owner-STLs [--preview /tmp/r16-uncompressed.glb]');
const rootPath=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(args.output||resolve(rootPath,'assets/models/rockets'));
const contract=JSON.parse(await readFile(resolve(rootPath,'scripts/source-models/rockets/r16-assembly.json'),'utf8'));
const sources=JSON.parse(await readFile(resolve(rootPath,'scripts/source-models/rockets/r16-source.json'),'utf8'));
const appearanceSource=JSON.parse(await readFile(resolve(rootPath,'scripts/source-models/rockets/r16-appearance.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const toMetres=.1,baseShift=5;
const doc=new Document(),buffer=doc.createBuffer();doc.setLogger(new Logger(Logger.Verbosity.ERROR));
const scene=doc.createScene('Р-16 · 8К64');doc.getRoot().setDefaultScene(scene);
scene.setExtras({museumAsset:'r16',unit:'metre',sourceFolder:sources.folder,configuration:'light'});
const rgba=hex=>[...new Color(hex).toArray(),1];
const material=(name,color,metal,rough)=>doc.createMaterial(name).setBaseColorFactor(rgba(color)).setMetallicFactor(metal).setRoughnessFactor(rough);
const materials={
 paint:material('Оливковая эмаль · швы и маркировка','#ffffff',1,1),
 fairing:material('Обтекатели · оливковая эмаль','#ffffff',1,1),
 metal:material('Сатинированный металл сопел','#919596',.52,.50),
 inner:material('Внутренняя поверхность сопел','#535657',.35,.71),
 edge:material('Светлые кромки и крепёж','#bfc3bf',.65,.32),
 detailPaint:material('Наружные накладки','#414332',.12,.69),
 mutedRed:material('Малые красные заглушки','#81483d',.16,.64),
 nose:material('Светлая головная часть','#c1b99e',.10,.68),
 undercoat:material('Торцы оболочек · тёмная эмаль','#282818',.06,.84)
};
const texturePath=resolve(args.textures||resolve(tmpdir(),'baikonur-r16-textures'));
execFileSync('python3',[resolve(rootPath,'scripts/build-r16-textures.py'),'--output',texturePath],{stdio:'inherit'});
const albedo=doc.createTexture('Р-16 · окраска и маркировка').setMimeType('image/jpeg').setImage(await readFile(resolve(texturePath,'r16-albedo.jpg')));
const roughness=doc.createTexture('Р-16 · матовость эмали').setMimeType('image/jpeg').setImage(await readFile(resolve(texturePath,'r16-roughness.jpg')));
for(const key of ['paint','fairing']){
 materials[key].setBaseColorTexture(albedo).setMetallicRoughnessTexture(roughness);
 for(const info of [materials[key].getBaseColorTextureInfo(),materials[key].getMetallicRoughnessTextureInfo()])info.setWrapS(10497).setWrapT(33071);
}
const inputs=new Map();
for(const source of sources.files){
 const bytes=await readFile(resolve(args.source,source.name));
 assert.equal(bytes.length,source.bytes,source.name+' size');assert.equal(sha(bytes),source.sha256,source.name+' source identity');
 assert.equal(bytes.readUInt32LE(80),source.triangles);assert.equal(bytes.length,84+source.triangles*50);
 inputs.set(source.name,bytes);
}

const assembly=[],geometryBySource=new Map(),shellSurfaces=[];let removedPinTriangles=0,sourceInstanceTriangles=0;
function geometry(file,{axisXZ,yMin=0,engine=false,pinY=null,yawDegrees=0,translation=[0,0,0]}={}){
 if(geometryBySource.has(file))return geometryBySource.get(file);
 const bytes=inputs.get(file),count=bytes.readUInt32LE(80),groups=new Map();let removed=0;
 for(let f=0;f<count;f++){
  const vertex=[];for(let k=0;k<3;k++)vertex.push([0,1,2].map(a=>bytes.readFloatLE(84+50*f+12+12*k+4*a)));
  assert.ok(vertex.flat().every(Number.isFinite));
  // The straight pins above the bell neck belong to printing assembly, not
  // the displayed engine surface. All clip planes coincide with STL rings.
  if(pinY!==null&&vertex.some(v=>v[1]>pinY+1e-5)){removed++;continue;}
  const v=vertex.map(p=>[(p[0]-axisXZ[0])*toMetres,(p[1]-yMin)*toMetres*(file==='RD marsh stage1.STL'?.55:1),(p[2]-axisXZ[1])*toMetres]);
  const a=v[1].map((x,j)=>x-v[0][j]),b=v[2].map((x,j)=>x-v[0][j]);
  const normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  assert.ok(Math.hypot(...normal)>1e-13,file+' degenerate triangle');
  const centre=[0,1,2].map(j=>v.reduce((s,p)=>s+p[j],0)/3),r=Math.hypot(centre[0],centre[2]);
  const radial=normal[0]*centre[0]+normal[2]*centre[2];
  let key='paint';
  if(engine)key=radial<0?'inner':'metal';
  else if(file.includes('stage 1 pr1')&&r>1.51)key='fairing';
  else if(file.includes('stage 2 pr1')&&r>1.26)key='fairing';
  if(file==='R16 stage 1 pr1.STL'&&centre[1]<.04&&normal[1]<-.7*Math.hypot(...normal))key='undercoat';
  if(!groups.has(key))groups.set(key,{positions:[],uv:[]});const group=groups.get(key);group.positions.push(...v.flat());
  const us=v.map(p=>((Math.atan2(p[2],p[0])/(2*Math.PI)-yawDegrees/360+.5)%1+1)%1);
  if(Math.max(...us)-Math.min(...us)>.5)for(let i=0;i<3;i++)if(us[i]<.5)us[i]+=1;
  for(let i=0;i<3;i++)group.uv.push(us[i],1-(v[i][1]+translation[1]*toMetres)/contract.heightMetres);
 }
 const mesh=doc.createMesh(file.replace(/\.STL$/i,''));
 for(const [key,{positions,uv}]of groups){
  const source=new BufferGeometry().setAttribute('position',new BufferAttribute(new Float32Array(positions),3));
  const smoothed=toCreasedNormals(source,Math.PI/5);
  // The print cone has duplicated seam vertices. Reconstruct only its
  // outward radial normals so the ivory paint does not expose flat wedges.
  if(file.includes('pr3 light')){
   const p=smoothed.attributes.position,n=smoothed.attributes.normal;
   for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),radius=Math.hypot(x,z),ny=n.getY(i);
    if(radius>1e-5&&Math.abs(ny)<.8&&(n.getX(i)*x+n.getZ(i)*z)>0){const nr=Math.sqrt(1-ny*ny);n.setXYZ(i,x/radius*nr,ny,z/radius*nr);}
   }
  }
  const primitive=doc.createPrimitive().setMaterial(materials[key]);
  for(const [semantic,name]of [['POSITION','position'],['NORMAL','normal']]){
   primitive.setAttribute(semantic,doc.createAccessor(file+' '+semantic).setBuffer(buffer).setType('VEC3').setArray(smoothed.getAttribute(name).array));
  }
  if(!engine)primitive.setAttribute('TEXCOORD_0',doc.createAccessor(file+' UV').setBuffer(buffer).setType('VEC2').setArray(new Float32Array(uv)));
  if(!engine){const surface=new Mesh(source.clone(),new MeshBasicMaterial({side:DoubleSide}));surface.position.fromArray(translation.map(n=>n*toMetres));surface.rotation.y=yawDegrees*Math.PI/180;surface.updateMatrixWorld(true);shellSurfaces.push(surface);}
  mesh.addPrimitive(primitive);source.dispose();if(smoothed!==source)smoothed.dispose();
 }
 const result={mesh,triangles:count-removed,removed};geometryBySource.set(file,result);return result;
}
function addPart(file,axisXZ,yMin,translation,yawDegrees,options={}){
 const g=geometry(file,{axisXZ,yMin,yawDegrees,translation,...options}),a=yawDegrees*Math.PI/180;
 const node=doc.createNode(options.name||file.replace(/\.STL$/i,'')).setMesh(g.mesh)
  .setTranslation(translation.map(x=>x*toMetres)).setRotation([0,Math.sin(a/2),0,Math.cos(a/2)]);
 node.setExtras({sourceFile:file,stage:options.stage,component:options.engine?'engine-bell':'shell'});scene.addChild(node);
 assembly.push({name:node.getName(),file,sourceAxisXZ:axisXZ,sourceYMin:yMin,translationMetres:node.getTranslation(),yawDegrees,triangles:g.triangles,removedPinTriangles:g.removed});
 removedPinTriangles+=g.removed;sourceInstanceTriangles+=g.triangles+g.removed;
}
for(const [i,part]of contract.shells.entries()){
 const angle=part.yawDegrees*Math.PI/180,offset=part.optionalLocalOffset||[0,0,0];
 const rotated=[Math.cos(angle)*offset[0]+Math.sin(angle)*offset[2],offset[1],-Math.sin(angle)*offset[0]+Math.cos(angle)*offset[2]];
 addPart(part.file,part.axisXZ,part.yMin,[rotated[0],baseShift+part.yBase+rotated[1],rotated[2]],part.yawDegrees,{stage:i<5?1:2});
}
for(const [stage,engine]of contract.engines.entries()){
 const angle=engine.parentYawDegrees*Math.PI/180;
 engine.mountAxesXZ.forEach(([x,z],i)=>addPart(engine.file,engine.sourceAxisXZ,0,
  [Math.cos(angle)*x+Math.sin(angle)*z,baseShift+engine.yBase,-Math.sin(angle)*x+Math.cos(angle)*z],engine.parentYawDegrees,
  {engine:true,pinY:engine.pinSourceY[0],stage:stage+1,name:`Ступень ${stage+1} · сопло ${i+1}`}));
}
const ray=new Raycaster(),origin=new Vector3(),direction=new Vector3();
const details=r16VisualDetails((a,y)=>{
 origin.set(4*Math.cos(a),y,4*Math.sin(a));direction.set(-Math.cos(a),0,-Math.sin(a));ray.set(origin,direction);
 const hit=ray.intersectObjects(shellSurfaces,false)[0];assert(hit,'Exterior detail must meet the source shell');return Math.hypot(hit.point.x,hit.point.z);
});
const detailMesh=doc.createMesh('Р-16 · детали по новым референсам');
for(const {material:key,geometry:g}of details.geometries){
 const p=doc.createPrimitive().setMaterial(materials[key]);
 for(const [semantic,name]of [['POSITION','position'],['NORMAL','normal']])p.setAttribute(semantic,doc.createAccessor('Р-16 detail '+semantic).setBuffer(buffer).setType('VEC3').setArray(g.attributes[name].array));
 detailMesh.addPrimitive(p);g.dispose();
}
scene.addChild(doc.createNode('Наружные детали · референсы владельца').setMesh(detailMesh).setExtras({component:'reference-exterior-details'}));
for(const m of shellSurfaces){m.geometry.dispose();m.material.dispose();}
await doc.transform(weld(),dedup(),prune());
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
if(args.preview){await mkdir(dirname(resolve(args.preview)),{recursive:true});await writeFile(args.preview,await io.writeBinary(doc));}
await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
const bytes=await io.writeBinary(doc),decoded=await io.readBinary(bytes);
const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let triangles=0,vertices=0,primitives=0;
for(const node of decoded.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()||[]){
 const pos=p.getAttribute('POSITION'),m=node.getWorldMatrix(),v=[];vertices+=pos.getCount();primitives++;triangles+=(p.getIndices()?.getCount()||pos.getCount())/3;
 for(let i=0;i<pos.getCount();i++){
  pos.getElement(i,v);for(let j=0;j<3;j++){const x=m[j]*v[0]+m[4+j]*v[1]+m[8+j]*v[2]+m[12+j];assert.ok(Number.isFinite(x));bounds.min[j]=Math.min(bounds.min[j],x);bounds.max[j]=Math.max(bounds.max[j],x);}
 }
}
bounds.size=bounds.max.map((x,i)=>x-bounds.min[i]);
assert.ok(Math.abs(bounds.min[1])<.001,'Bell exits must meet ground');
assert.ok(Math.abs(bounds.size[1]-contract.heightMetres)<.002,'Do not stretch the source to a different historical variant');
assert.equal(triangles,sourceInstanceTriangles-removedPinTriangles+details.triangles,'Source topology and added exterior details accounted for');
assert.ok(bytes.length<1024*1024,'Museum download budget');
const manifest={
 version:'rocket-exhibits-v1',modelRevision:'r16-reference-v2',id:'r16',configuration:'light',assetSha256:sha(bytes),
 assetStats:{bytes:bytes.length,triangles,vertices,primitives,uniqueMeshes:decoded.getRoot().listMeshes().length,materials:decoded.getRoot().listMaterials().length,textures:decoded.getRoot().listTextures().length},
 appearance:{revision:'r16-reference-v2',referenceFolder:sources.folder,references:appearanceSource.references,embeddedTextureSize:[1024,4096],paint:'dark olive with warm ivory nose',markings:'white stencil groups and 8К64',details:details.counts,addedTriangles:details.triangles,firstStageBellDisplayScaleY:.55,notes:'Exterior interpretation of four supplied renders; small unreadable lettering is not transcribed.'},
 bounds,normalization:{unit:'metre',up:'+Y',baseY:0,uniformSourceUnitMetres:toMetres,sourceBaseShift:baseShift,bodyDiameterMetres:3,sourceBodyDiameter:30},
 source:{format:'binary STL',sourceFolder:sources.folder,sourceFileCount:sources.files.length,sourceBytes:sources.files.reduce((s,f)=>s+f.bytes,0),
  sourceTriangles:sources.files.reduce((s,f)=>s+f.triangles,0),sourceInstanceTriangles,selectedTriangles:sourceInstanceTriangles-removedPinTriangles,files:sources.files,
  selectedFiles:[...geometryBySource.keys()],omitted:contract.omitted},
 assembly,
 optimization:{geometryDecimation:false,normalCreaseAngleDegrees:36,removedPinTriangles,omittedInternalSleeves:3,omittedUnconfirmedFrame:true,sharedEngineMeshes:true,compression:'EXT_meshopt_compression',positionBits:16,normalBits:12},
 references:[
  {url:'https://rvsn.ruzhany.info/umz_2000_01_01.html',basis:'Издание ГКБ «Южное», 2000: основной диаметр 3 м; разные верхние части не приводятся к одной высоте.'},
  {url:'https://www.testpilot.ru/espace/bibl/kb-ujn/63.jpg',basis:'Силуэт из издания ГКБ «Южное», 2004: выбор вытянутого конуса light.'},
  {url:'https://commons.wikimedia.org/wiki/File:RVSN_gallery11.jpg',basis:'Фотография экспозиции музея РВСН, Mil.ru, 2014: оливковая окраска. Фотография не включена в ассет.'},
  {url:'https://museumgagarin.ru/news/khronika_chernogo_dnya/',basis:'Связь Р-16 с площадками 41 и 42 Байконура.'}
 ],
 attribution:{authors:[],providedBy:'Владелец проекта / Google Drive',driveUrl:sources.folder,licenseNote:'Автор и лицензия исходного STL-набора в предоставленных файлах не указаны. Открытая лицензия не заявляется.'},
 museumChoices:contract.museumChoices,
 interpretation:'Музейный экспонат по предоставленному STL и четырём новым визуальным референсам. Габариты сохранены; наружные детали, окраска и видимая форма сопел уточнены по изображениям. Не заявляется точной реконструкцией конкретного борта 1960 года.'
};
await mkdir(output,{recursive:true});await writeFile(resolve(output,'r16.glb'),bytes);await writeFile(resolve(output,'r16.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({id:'r16',...manifest.assetStats,bounds,removedPinTriangles},null,2));
