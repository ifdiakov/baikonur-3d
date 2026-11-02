// Repaint the supplied archive meshes without rebuilding their silhouettes.
// Input directory contains the three pre-paint GLBs (see docs/buran-paint.md).
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {join,prune} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import {Matrix4,Matrix3,Vector3} from 'three';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const input=process.argv[2];if(!input)throw Error('Usage: node scripts/fix-buran-paint.mjs INPUT_MODELS_DIRECTORY');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const hashes={
 'rockets/energia-buran.glb':'51638dfe815935e06934505303662e95ae18e7306d2d62956c02a45c36e5083b',
 'mriya-buran/near-v2.glb':'ffad09ad153f39f51fa4ad13fd2e7043657d662e3ebe329b70c7dea1a3b5a827',
 'mriya-buran/far-v2.glb':'f10255869f2d726c5bfc372d9eb75d9f3d6aa72fca93edc4595068d6f0b99ce5',
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function load(file){const bytes=await readFile(path.join(input,file));if(sha(bytes)!==hashes[file])throw Error('Unexpected input version: '+file);return io.readBinary(bytes);}
const vector=(a,i,m)=>new Vector3(...a.getElement(i,[])).applyMatrix4(m);
const accessor=(doc,name,type,array)=>doc.createAccessor(name,doc.getRoot().listBuffers()[0]).setType(type).setArray(array);
function floats(doc,a){const values=[];for(let i=0;i<a.getCount();i++)values.push(...a.getElement(i,[]));return accessor(doc,a.getName(),a.getType(),new Float32Array(values));}
const wingFlag=p=>p.x<-5.9&&p.y>9.8&&p.y<11.2&&p.z<-6;
const wingLetters=(p,uv)=>p.x>6&&p.x<8.6&&p.y>9.9&&p.y<11.1&&p.z<-6&&Math.abs(uv[0]-.6171664)<.001;
const copiedMarks={flag:[],letters:[]};
const energia=await load('rockets/energia-buran.glb');
for(const node of energia.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()||[]){
 const name=p.getMaterial().getName(),world=new Matrix4().fromArray(node.getWorldMatrix());
 if(['Kil_B.gif','RNN.gif','RNV.gif'].includes(name)){
  // The bCAD fin and rudder frames ran aft-to-forward, opposite to these images.
  const uv=floats(energia,p.getAttribute('TEXCOORD_0'));p.setAttribute('TEXCOORD_0',uv);
  for(let i=0;i<uv.getCount();i++){const v=uv.getElement(i,[]);v[0]=1-v[0];uv.setElement(i,v);}
 }
 if(name!=='Flag.gif'&&name!=='PaletteMaterial001')continue;
 const pos=p.getAttribute('POSITION').clone(),uv=name==='Flag.gif'?floats(energia,p.getAttribute('TEXCOORD_0')):p.getAttribute('TEXCOORD_0'),normal=p.getAttribute('NORMAL'),inverse=world.clone().invert();
 const isMark=i=>name==='Flag.gif'?wingFlag(vector(pos,i,world)):wingLetters(vector(pos,i,world),uv.getElement(i,[]));
 const selected=new Set();for(let i=0;i<pos.getCount();i++)if(isMark(i))selected.add(i);
 for(const i of selected){const v=vector(pos,i,world);v.z-=.035;pos.setElement(i,v.applyMatrix4(inverse).toArray());}
 if(name==='Flag.gif'){
  for(let i=0;i<pos.getCount();i++){
   const v=vector(pos,i,world);
   uv.setElement(i,selected.has(i)?[1-(v.x+8.53785324)/2.53331883,(11.04791861-v.y)/1.12679982]:[(v.y-9.55734606)/.87205556,(-8.04615761-v.z)/.47383465]);
  }
  p.getMaterial().getBaseColorTextureInfo().setWrapS(33071).setWrapT(33071);
 }
 p.setAttribute('POSITION',pos).setAttribute('TEXCOORD_0',uv);
 const index=p.getIndices(),normalMatrix=new Matrix3().getNormalMatrix(world);
 for(let t=0;t<index.getCount();t+=3){const ids=[0,1,2].map(j=>index.getScalar(t+j));if(!ids.every(i=>selected.has(i)))continue;
  copiedMarks[name==='Flag.gif'?'flag':'letters'].push(ids.map(i=>({position:vector(pos,i,world).toArray(),normal:new Vector3(...normal.getElement(i,[])).applyMatrix3(normalMatrix).normalize().toArray(),uv:uv.getElement(i,[])})));
 }
}
const sourceMaterials=new Map(energia.getRoot().listMaterials().map(m=>[m.getName(),m]));
// Both archive copies use the same orbiter. The transport copy is uniformly
// scaled by 0.99545 and rotated into an X-longitudinal, Y-up coordinate frame.
const scale=.99545,toTransport=([x,y,z])=>[52.0585-y*scale,30.156-z*scale,x*scale+.0007];
function copyMaterial(doc,sourceName,name){const original=sourceMaterials.get(sourceName),m=doc.createMaterial(name).setBaseColorFactor(original.getBaseColorFactor()).setRoughnessFactor(.86).setMetallicFactor(.02).setDoubleSided(true),texture=original.getBaseColorTexture();if(texture){m.setBaseColorTexture(doc.createTexture(name).setImage(texture.getImage()).setMimeType(texture.getMimeType()));m.getBaseColorTextureInfo().setWrapS(33071).setWrapT(33071);}return m;}
function addTriangles(doc,name,triangles,material){
 if(!triangles.length)return;
 const positions=[],normals=[],uv=[];for(const triangle of triangles)for(const v of triangle){positions.push(...v.position);normals.push(...v.normal);uv.push(...v.uv);}
 const p=doc.createPrimitive().setMaterial(material).setAttribute('POSITION',accessor(doc,name,'VEC3',new Float32Array(positions))).setAttribute('NORMAL',accessor(doc,name,'VEC3',new Float32Array(normals))).setAttribute('TEXCOORD_0',accessor(doc,name,'VEC2',new Float32Array(uv))).setIndices(accessor(doc,name,'SCALAR',Uint32Array.from({length:positions.length/3},(_,i)=>i)));
 doc.getRoot().listScenes()[0].addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(p)));
}
const outputs={};
async function save(doc,file){await doc.transform(prune());const bytes=await io.writeBinary(doc);await writeFile(path.join('assets/models',file),bytes);const r=doc.getRoot();outputs[file]={sha256:sha(bytes),bytes:bytes.length,triangles:r.listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0),0),vertices:r.listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((n,p)=>n+p.getAttribute('POSITION').getCount(),0),0),primitives:r.listMeshes().reduce((n,m)=>n+m.listPrimitives().length,0),materials:r.listMaterials().length,textures:r.listTextures().length};}
await save(energia,'rockets/energia-buran.glb');
for(const file of ['mriya-buran/near-v2.glb','mriya-buran/far-v2.glb']){
 const doc=await load(file),root=doc.getRoot(),materials=new Map(root.listMaterials().map(m=>[m.getName(),m]));
 materials.get('Buran NF.gif').getBaseColorTextureInfo().setWrapS(33071).setWrapT(33071);
 const surfaces={nose:[],noseTop:[],cockpitSurround:[],noseGlazing:[],fin:[],lowerRudder:[],upperRudder:[]};
 for(const node of [...root.listNodes()])for(const p of [...node.getMesh()?.listPrimitives()||[]]){
  if(!p.getMaterial().getName().startsWith('Buran thermal'))continue;
  const pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),colors=p.getAttribute('COLOR_0'),index=p.getIndices(),world=new Matrix4().fromArray(node.getWorldMatrix()),nm=new Matrix3().getNormalMatrix(world),kept=[];
  for(let at=0;at<index.getCount();at+=3){
   const ids=[0,1,2].map(j=>index.getScalar(at+j)),vertices=ids.map(i=>vector(pos,i,world)),center=vertices.reduce((a,b)=>a.add(b),new Vector3()).multiplyScalar(1/3);let part=null;
   // Project the authored TPS image onto the small inset nose details as well
   // as the shell: their old approximate vertex mask made white spots/spikes.
   if(vertices.every(v=>v.x<24.274&&v.y<39.12&&v.x>17.05))part='nose';
   const ny=ids.reduce((sum,i)=>sum+new Vector3(...normal.getElement(i,[])).applyMatrix3(nm).normalize().y,0)/3;
   const pane=ny<.85&&center.x>20.5&&center.y>39.15&&ids.every(i=>colors.getElement(i,[])[0]<.1);
   if(ny>.2&&vertices.every(v=>v.x<24.28&&v.x>16.25&&v.y>37.1))part=pane?'noseGlazing':center.x<21.1?'noseTop':'cockpitSurround';
   if(vertices.every(v=>v.x>42.85&&v.y>40.82&&Math.abs(v.z)<.6)){
    const hinge=15.535+.7343*center.y;
    part=center.x>hinge-.07?(center.y>.758*center.x+7.25?'upperRudder':'lowerRudder'):'fin';
   }
   if(!part){kept.push(...ids);continue;}
   surfaces[part].push(vertices.map((v,j)=>{
    let uv;if(part==='nose')uv=[v.x*.118205-1.87199,9.48815-v.y*.238105];
    else if(part==='noseGlazing')uv=[0,0];
    else if(part==='noseTop'||part==='cockpitSurround'){const sx=(v.z-.0007)/scale,sy=(52.0585-v.x)/scale,sz=(30.156-v.y)/scale;uv=part==='noseTop'?[.256409*sx+.5,.2014895*sy+.0070379*sz-6.189008]:[.2242154*sx+.5,-.2980629*sy+9.277413];}
    else if(part==='fin')uv=[v.x*.1096-4.70578,6.18613-v.y*.12685];
    else{const sy=(52.0585-v.x)/scale,sz=(30.156-v.y)/scale;uv=part==='upperRudder'?[1.04191-.30875*sy,4.753+.26607*sz]:[1.57908-.29766*sy,5.38612+.35461*sz];}
    return{position:v.toArray(),normal:new Vector3(...normal.getElement(ids[j],[])).applyMatrix3(nm).normalize().toArray(),uv};
   }));
  }
  p.setIndices(accessor(doc,'Retained thermal tiles','SCALAR',new Uint32Array(kept)));
 }
 addTriangles(doc,'Buran nose details',surfaces.nose,materials.get('Buran NF.gif'));
 addTriangles(doc,'Buran nose glazing',surfaces.noseGlazing,doc.createMaterial('Buran nose glazing').setBaseColorFactor([.014,.018,.02,1]).setRoughnessFactor(.35).setDoubleSided(true));
 addTriangles(doc,'Buran upper nose',surfaces.noseTop,copyMaterial(doc,'NFV.gif','Buran upper nose TPS'));
 addTriangles(doc,'Buran cockpit surround',surfaces.cockpitSurround,copyMaterial(doc,'NFK.gif','Buran cockpit surround TPS'));
 addTriangles(doc,'Buran fin details',surfaces.fin,materials.get('Buran Kil_B.gif'));
 addTriangles(doc,'Buran lower rudder',surfaces.lowerRudder,copyMaterial(doc,'RNN.gif','Buran lower rudder TPS'));
 addTriangles(doc,'Buran upper rudder',surfaces.upperRudder,copyMaterial(doc,'RNV.gif','Buran upper rudder TPS'));
 for(const [key,triangles]of Object.entries(copiedMarks)){
  const material=key==='flag'?copyMaterial(doc,'Flag.gif','Buran wing USSR flag'):doc.createMaterial('Buran wing CCCP').setBaseColorFactor([.65,.017,.001,1]).setRoughnessFactor(.86).setDoubleSided(true);
  addTriangles(doc,'Buran wing '+key,triangles.map(triangle=>triangle.map(v=>({position:toTransport(v.position),normal:[-v.normal[1],-v.normal[2],v.normal[0]],uv:v.uv}))),material);
 }
 await doc.transform(join({filter:node=>node.getMesh()?.listPrimitives().every(p=>p.getMaterial().getName().startsWith('Buran'))??false}));
 await save(doc,file);
}
await writeFile('assets/models/buran-paint.json',JSON.stringify({version:'buran-paint-20261102-v1',sourceHashes:hashes,assets:outputs},null,2)+'\n');
console.log(JSON.stringify(outputs,null,2));
