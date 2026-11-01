#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as T from 'three';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {Document,NodeIO,Logger} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,weld,prune,meshopt,getBounds} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
const directory=process.argv[2];assert(directory,'Pass directory containing owner STL files');
const source=JSON.parse(await readFile('scripts/source-models/rockets/cyclone-source.json','utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const inputs=new Map();for(const f of source.files){const b=await readFile(directory+'/'+f.name);assert.equal(sha(b),f.sha256);inputs.set(f.name,b);}
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
for(const variant of [2,3]){
 const id='cyclone-'+variant,doc=new Document();doc.setLogger(new Logger(Logger.Verbosity.ERROR));const buffer=doc.createBuffer(),scene=doc.createScene(id);doc.getRoot().setDefaultScene(scene);
 const mats={};for(const [key,color,metal,rough]of [['white','#eee9dc',.14,.6],['band','#343c3b',.45,.56],['metal','#827f70',.7,.44],['inner','#282b29',.45,.8],['gold','#b99b5f',.5,.52],['solar','#1b3045',.35,.42]])mats[key]=doc.createMaterial(key).setBaseColorFactor([...new T.Color(color).toArray(),1]).setMetallicFactor(metal).setRoughnessFactor(rough).setDoubleSided(key==='white');
 const groups={};for(const [name,stage]of [['first',0],['second',1],['upper',2],['payload',3],['fairing',4]]){groups[name]=doc.createNode(name).setExtras({inspectionStage:stage,variant});scene.addChild(groups[name]);}
 let instanceTriangles=0,removedTriangles=0;const assembly=[];
 function addGeometry(name,geometry,material,parent,translation=[0,0,0],rotation=null){
  const g=toCreasedNormals(geometry.index?geometry.toNonIndexed():geometry,Math.PI/5),p=doc.createPrimitive().setMaterial(mats[material]);
  for(const [sem,attr]of [['POSITION','position'],['NORMAL','normal']])p.setAttribute(sem,doc.createAccessor(name+sem).setBuffer(buffer).setType('VEC3').setArray(g.attributes[attr].array));
  const mesh=doc.createMesh(name).addPrimitive(p),node=doc.createNode(name).setMesh(mesh).setTranslation(translation);if(rotation)node.setRotation(rotation);parent.addChild(node);return node;
 }
 const cache=new Map();
 function part(file,{axis=[15,15],y0=0,base=0,flip=false,clip=null,material='white',parent='first',x=0,z=0}={}){
  const key=JSON.stringify([file,axis,y0,flip,clip,material]),b=inputs.get(file),n=b.readUInt32LE(80);let cached=cache.get(key),removed=0;
  if(!cached){const buckets={};for(let f=0;f<n;f++){
   let v=Array.from({length:3},(_,k)=>[0,1,2].map(a=>b.readFloatLE(84+f*50+12+k*12+a*4)));
   if(clip!==null&&v.some(p=>p[1]>clip+1e-4)){removed++;continue;}
   v=v.map(p=>[(p[0]-axis[0])*.1,(flip?y0-p[1]:p[1]-y0)*.1,(p[2]-axis[1])*.1*(flip?-1:1)]);
   const a=new T.Vector3(...v[1]).sub(new T.Vector3(...v[0])),c=new T.Vector3(...v[2]).sub(new T.Vector3(...v[0])),normal=a.cross(c),center=v.reduce((s,p)=>s.map((q,j)=>q+p[j]/3),[0,0,0]);
   if(normal.length()<1e-11){removed++;continue;}const m=material==='metal'&&normal.x*center[0]+normal.z*center[2]<0?'inner':material;(buckets[m]??=[]).push(...v.flat());
  }
  cached={meshes:[],triangles:n-removed,removed};for(const [m,positions]of Object.entries(buckets)){const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));const node=addGeometry(file,g,m,groups[parent]);groups[parent].removeChild(node);cached.meshes.push(node.getMesh());node.dispose();}cache.set(key,cached);}
  for(const mesh of cached.meshes)groups[parent].addChild(doc.createNode(file).setMesh(mesh).setTranslation([x,base,z]));instanceTriangles+=cached.triangles;removedTriangles+=cached.removed;
  assembly.push({file,parent,axis,y0,base,flip,clip,translation:[x,base,z],unitMetres:.1,retainedTriangles:cached.triangles});
 }
 // Socket-aligned shell sections; one STL unit is 0.1 metre (30-unit body).
 part('C stage 1 pr1.STL',{axis:[19,19],base:.45});
 part('C stage 1 pr2.STL',{axis:[15,15.5],y0:.028,base:2.5});
 part('C stage 1 pr3.STL',{axis:[15,15.5],base:8.3});
 part('C stage 1 pr4.STL',{axis:[15,15.5],base:9.4});
 for(let i=0;i<6;i++){const a=i*Math.PI/3+Math.PI/6;part('RD marsh stage1.STL',{axis:[4.068,4.068],base:0,x:.93*Math.cos(a),z:.93*Math.sin(a),material:'metal',clip:12});}
 // This printing shell is supplied upside down: its flared skirt faces down.
 part('C stage 2 pr1.STL',{axis:[18,18],y0:27.8,base:19.07,flip:true,clip:null,parent:'second'});
 part('C stage 2 pr2.STL',{axis:[15,15],base:21.57,parent:'second'});
 for(const z of [-.69,.69])part('RD marsh stage2.STL',{axis:[6.595,6.595],base:17.74,z,material:'metal',clip:16,parent:'second'});
 // Thin exterior collars and the exposed interstage bridges are photo-inferred.
 for(const y of [2.5,8.3,9.7,18.67,21.57,27.07,29.07]){const g=new T.TorusGeometry(y>28?1.01:1.505,.022,5,72);g.rotateX(Math.PI/2);addGeometry('circumferential joint',g,'metal',y>18.7?groups.second:groups.first,[0,y,0]);}
 for(let i=0;i<8;i++){const a=i*Math.PI/4,g=new T.CylinderGeometry(.025,.025,.41,5);addGeometry('interstage tie',g,'band',groups.first,[1.42*Math.cos(a),18.88,1.42*Math.sin(a)]);}
 if(variant===3){
  part('C stage 3 adapter.STL',{axis:[13.778,13.5],base:29.07,parent:'upper'});
  part('C Uper stage 1.STL',{axis:[11.5,11.5],base:29.77,parent:'upper'});
  part('RD Uper stage.STL',{axis:[4.5,4.5],base:29.3,clip:8,parent:'upper',material:'metal'});
  part('KA koronos foton pr1.STL',{axis:[10,10],base:31.77,parent:'payload',material:'gold'});
  part('KA koronos foton pr3 v2.STL',{axis:[10.95,10],base:31.77,parent:'payload',material:'solar'});
  part('C fairhead sheld ver1.STL',{axis:[14.5,13.5],base:29.77,parent:'fairing'});
 }else{
  // The owner's STL is Cyclone-3. Cyclone-2's narrow, rounded payload shroud
  // is reconstructed separately from the Yuzhnoye photographs, not relabelled.
  const profile=[[1,29.07],[1.08,29.4],[1.1,29.77],[1.1,36.4],[1.06,36.9],[.94,37.5],[.73,38.1],[.46,38.65],[.24,38.9],[.05,39],[0,39]];
  addGeometry('Cyclone-2 photo fairing',new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),80),'white',groups.fairing);
  const ring=new T.TorusGeometry(1.105,.035,6,64);ring.rotateX(Math.PI/2);addGeometry('payload interface',ring,'metal',groups.fairing,[0,29.77,0]);
 }
 await doc.transform(weld(),dedup(),prune());await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
 const bytes=await io.writeBinary(doc),decoded=await io.readBinary(bytes),bounds=getBounds(decoded.getRoot().listScenes()[0]);bounds.size=bounds.max.map((v,i)=>v-bounds.min[i]);let triangles=0,primitives=0;for(const n of decoded.getRoot().listNodes())for(const p of n.getMesh()?.listPrimitives()||[]){primitives++;triangles+=p.getIndices().getCount()/3;}
 assert(Math.abs(bounds.min[1])<.002);assert(Math.abs(bounds.size[1]-(variant===2?39:39.27))<.01);assert(bytes.length<650000);
 await mkdir('assets/models/rockets',{recursive:true});await writeFile('assets/models/rockets/'+id+'.glb',bytes);
 const manifest={version:'rocket-exhibits-v1',id,assetSha256:sha(bytes),assetStats:{bytes:bytes.length,triangles,primitives},bounds,normalization:{unit:'metre',uniformSourceUnitMetres:.1,bodyDiameterMetres:3},source:{folder:source.folder,files:source.files,selectedFiles:[...new Set(assembly.map(a=>a.file))],retainedInstanceTriangles:instanceTriangles,removedPrintingAndDegenerateTriangles:removedTriangles},assembly,interpretation:variant===2?'Owner Cyclone-3 lower stages adapted; separate Cyclone-2 fairing reconstructed from Yuzhnoye photographs.':'Owner Cyclone-3 printing meshes assembled with inferred flight alignment; Koronas-Foton shown under the fairing.',references:source.references,attribution:{providedBy:'Владелец проекта / Google Drive',licenseNote:'Автор и лицензия STL-набора не указаны; открытая лицензия не заявляется.'}};
 await writeFile('assets/models/rockets/'+id+'.json',JSON.stringify(manifest,null,2)+'\n');console.log(id,manifest.assetStats,bounds.size);
}
