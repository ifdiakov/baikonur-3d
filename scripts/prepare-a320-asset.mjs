// Owner-supplied CC BY 4.0 A320. Retain its geometry; replace airline artwork,
// separate the original gear and fans, normalize units, meshopt-compress.
import * as THREE from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds,dedup,prune,weld,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const source=await readFile('scripts/source-models/a320/source.glb'),io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder}),doc=await io.readBinary(source),scene=doc.getRoot().listScenes()[0],originalBounds=getBounds(scene),asset={...doc.getRoot().getAsset().extras};
const unit=37.57/(originalBounds.max[2]-originalBounds.min[2]),centerX=(originalBounds.min[0]+originalBounds.max[0])/2;
const parts=[];
for(const node of doc.getRoot().listNodes()){
 if(!node.getMesh())continue;
 const matrix=new THREE.Matrix4().fromArray(node.getWorldMatrix()),normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
 for(const primitive of node.getMesh().listPrimitives()){
  const pos=primitive.getAttribute('POSITION'),norm=primitive.getAttribute('NORMAL'),uv=primitive.getAttribute('TEXCOORD_0'),indices=primitive.getIndices();
  const vertices=[],normals=[],uvs=[],parents=Array.from({length:pos.getCount()},(_,i)=>i),coords=new Map(),v=[];
  const find=i=>parents[i]===i?i:parents[i]=find(parents[i]),union=(a,b)=>parents[find(a)]=find(b);
  for(let i=0;i<pos.getCount();i++){
   pos.getElement(i,v);vertices.push(new THREE.Vector3(...v).applyMatrix4(matrix));norm.getElement(i,v);normals.push(new THREE.Vector3(...v).applyNormalMatrix(normalMatrix));uv.getElement(i,v);uvs.push(v.slice(0,2));
   const key=vertices[i].toArray().map(x=>Math.round(x*1e4)).join(',');if(coords.has(key))union(i,coords.get(key));else coords.set(key,i);
  }
  for(let i=0;i<indices.getCount();i+=3){union(indices.getScalar(i),indices.getScalar(i+1));union(indices.getScalar(i),indices.getScalar(i+2));}
  const components=new Map();for(let i=0;i<indices.getCount();i++){const vertex=indices.getScalar(i),id=find(vertex);if(!components.has(id))components.set(id,[]);components.get(id).push(vertex);}
  for(const face of components.values()){
   const bounds=new THREE.Box3();face.forEach(i=>bounds.expandByPoint(vertices[i]));const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
   const wheels=['Object_6','Object_9'].includes(node.getName());
   const gear=wheels||node.getName()==='Object_5'&&(bounds.max.y<3.7&&((Math.abs(center.x)>2.5&&Math.abs(center.x)<4.5&&center.z<2&&center.z>0)||(Math.abs(center.x)<.5&&center.z>12)));
   let group=gear?(center.z>10?'gear-nose':center.x<0?'gear-left':'gear-right'):'airframe';
   let material=primitive.getMaterial(),role='detail';
   if(node.getName()==='Object_4')role='cockpit';
   else if(node.getName()==='Object_5'){
    if(gear)role='gear-metal';else if(size.z>30)role='body';else if(bounds.min.y>6)role='tail';else if(Math.abs(center.x)>4&&Math.abs(center.x)<9)role='nacelle';else role='white';
   }else if(node.getName()==='Object_7'){
    role='engine-metal';if(center.z>6.6){group=center.x<0?'fan-left':'fan-right';role=size.z<.1?'fan-disc':'spinner';}
   }else if(node.getName()==='Object_8')role='wing';else if(node.getName()==='Object_6')role='wheel-side';else if(node.getName()==='Object_9')role='tyre';
   parts.push({group,role,material,vertices:face.map(i=>vertices[i].clone()),normals:face.map(i=>normals[i].clone()),uvs:face.map(i=>uvs[i]),wheels});
  }
 }
}
const wheelPoints=parts.filter(p=>p.role==='tyre'&&p.group==='gear-right').flatMap(p=>p.vertices),wheelBox=new THREE.Box3().setFromPoints(wheelPoints),zOffset=wheelBox.getCenter(new THREE.Vector3()).z*unit+3,yOffset=wheelBox.min.y*unit+3.18;
const noseMin=Math.min(...parts.filter(p=>p.role==='tyre'&&p.group==='gear-nose').flatMap(p=>p.vertices).map(v=>v.y));
const noseCorrection=wheelBox.min.y-noseMin;
for(const p of parts)for(const v of p.vertices){v.x=(v.x-centerX)*unit;v.y=(v.y+(p.group==='gear-nose'?noseCorrection:0))*unit-yOffset;v.z=v.z*unit-zOffset;}
// New vector UV artwork, built for the supplied mesh's existing atlas. No
// source airline title, registration, flag or coloured tail artwork survives.
const windows=[];for(const y of [49,519])for(let i=0;i<21;i++)windows.push([281+i*16.15,y]);for(const y of [189,379])for(let i=0;i<20;i++)windows.push([303+i*16.48,y]);
const svg=(body,bg='#f0f3f3')=>`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${bg}"/>${body}</svg>`;
let artwork='';
for(let x=25;x<1024;x+=39)artwork+=`<path d="M${x} 0V600" stroke="#c6cdd0" stroke-opacity=".22" stroke-width=".55"/>`;
for(const y of [11,75,112,150,214,255,313,354,418,456,493,557,588])artwork+=`<path d="M0 ${y}H1024" stroke="#bdc7cd" stroke-opacity=".23" stroke-width=".5"/>`;
for(const [x,y]of windows)artwork+=`<rect x="${x-4.2}" y="${y-6.2}" width="8.4" height="12.4" rx="3.3" fill="#a6b3bb"/><rect x="${x-3.1}" y="${y-5.2}" width="6.2" height="10.4" rx="2.7" fill="#18313f"/><path d="M${x-1.8} ${y-3.7}h3.6" stroke="#78909e" stroke-width=".65"/>`;
for(const [x,y,w,h]of [[202,20,30,61],[660,158,33,63],[660,347,33,63],[202,487,30,61],[488,37,17,32],[511,37,17,32],[488,500,17,32],[511,500,17,32]])artwork+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none" stroke="#687d86" stroke-width="1.1"/><rect x="${x+w*.42}" y="${y+9}" width="5" height="8" rx="2" fill="#173443"/><path d="M${x+w*.64} ${y+h*.59}h5" stroke="#7a888e" stroke-width="1.5"/>`;
for(const [x,y]of [[116,88],[287,105],[287,463],[116,480]])artwork+=`<rect x="${x-3}" y="${y-3}" width="6" height="6" rx="1" fill="none" stroke="#aa7770" stroke-width=".8"/>`;
const mask=windows.map(([x,y])=>`<rect x="${x-3.1}" y="${y-5.2}" width="6.2" height="10.4" rx="2.7" fill="white"/>`).join('');
const bodyTexture=doc.createTexture('A320 · new neutral panel and window atlas').setImage(await sharp(Buffer.from(svg(artwork))).png().toBuffer()).setMimeType('image/png');
const emission=doc.createTexture('A320 · cabin light mask').setImage(await sharp(Buffer.from(svg(mask,'black'))).png().toBuffer()).setMimeType('image/png');
const material=(name,color,metal=.2,rough=.45)=>doc.createMaterial(name).setBaseColorFactor([...new THREE.Color(color).toArray(),1]).setMetallicFactor(metal).setRoughnessFactor(rough);
const mats={body:material('A320 · ALROSA fuselage',0xffffff,.15,.4).setBaseColorTexture(bodyTexture).setEmissiveTexture(emission).setEmissiveFactor([1,.72,.38]),tail:material('A320 · ALROSA navy tail',0x142e65),nacelle:material('A320 · ALROSA nacelles',0x142e65),cockpit:material('A320 · cockpit glass',0x294553,.2,.22).setEmissiveFactor([.25,.16,.06]),white:material('A320 · white details',0xe2e8eb), 'gear-metal':material('A320 · original gear metal',0xa7b5bc,.7,.35),'engine-metal':material('A320 · engine interior',0x6a7781,.75,.3),'fan-disc':material('A320 · fan disc',0x14202a,.4,.5),spinner:material('A320 · spinner',0x3d4a56,.7,.28)};
for(const p of parts){p.material.setMetallicRoughnessTexture(null);if(p.role==='wing'){p.material.setMetallicFactor(.25).setRoughnessFactor(.5);p.material.setExtension('KHR_materials_specular',null);}else if(mats[p.role])p.material=mats[p.role];}
for(const node of [...doc.getRoot().listNodes()])node.dispose();for(const mesh of [...doc.getRoot().listMeshes()])mesh.dispose();
const root=doc.createNode('Airbus A320-214 · ALROSA museum livery');scene.addChild(root);const groups={},pivots={airframe:[0,0,0],'gear-nose':[0,-1.3,13.69*unit-zOffset],'gear-left':[-3.84*unit,-.2,-3],'gear-right':[3.84*unit,-.2,-3],'fan-left':[-6.14*unit,2.3*unit-yOffset,6.67*unit-zOffset],'fan-right':[6.12*unit,2.3*unit-yOffset,6.67*unit-zOffset]};
for(const [name,pivot]of Object.entries(pivots)){groups[name]=doc.createNode(name).setTranslation(pivot);root.addChild(groups[name]);}
const bins=new Map();for(const p of parts){const key=p.group+'|'+p.role;if(!bins.has(key))bins.set(key,{group:p.group,role:p.role,material:p.material,positions:[],normals:[],uvs:[]});const b=bins.get(key),pivot=pivots[p.group];p.vertices.forEach((v,i)=>{b.positions.push(...v.toArray().map((n,k)=>n-pivot[k]));b.normals.push(...p.normals[i].toArray());b.uvs.push(...p.uvs[i]);});}
const buffer=doc.getRoot().listBuffers()[0];for(const b of bins.values()){
 const a=(type,array)=>doc.createAccessor().setType(type).setArray(new Float32Array(array)).setBuffer(buffer);
 const primitive=doc.createPrimitive().setAttribute('POSITION',a('VEC3',b.positions)).setAttribute('NORMAL',a('VEC3',b.normals)).setAttribute('TEXCOORD_0',a('VEC2',b.uvs)).setMaterial(b.material);
 groups[b.group].addChild(doc.createNode(b.role).setMesh(doc.createMesh(b.role).addPrimitive(primitive)));
}
const support=group=>{const points=parts.filter(p=>p.role==='tyre'&&p.group===group).flatMap(p=>p.vertices).map(v=>[v.y,v.z]),unique=[...new Map(points.map(p=>[p.map(v=>v.toFixed(5)).join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const low=[],high=[];for(const p of unique){while(low.length>=2&&cross(low.at(-2),low.at(-1),p)<=0)low.pop();low.push(p);}for(const p of [...unique].reverse()){while(high.length>=2&&cross(high.at(-2),high.at(-1),p)<=0)high.pop();high.push(p);}return [...low.slice(0,-1),...high.slice(0,-1)].map(p=>p.map(v=>+v.toFixed(8)));};
const profile={length:37.57,wingspan:(originalBounds.max[0]-originalBounds.min[0])*unit,clearance:3.18,mainSupport:support('gear-right'),noseSupport:support('gear-nose'),pivots,cabinWindows:windows.length,sourceUnit:unit};
await doc.transform(dedup(),weld(),prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
Object.assign(doc.getRoot().getAsset(),{copyright:`${asset.author}; CC BY 4.0; ${asset.source}; livery and rig adaptation by RocketTrip`,extras:{...asset,modified:true,adaptation:'ALROSA-inspired museum livery on A320; separated original landing gear and fan components; neutral UV artwork; meshopt compression'}});
const bytes=await io.writeBinary(doc),decoded=await io.readBinary(bytes),bounds=getBounds(decoded.getRoot().listScenes()[0]);
profile.assetBytes=bytes.length;
await mkdir('assets/models/a320-alrosa',{recursive:true});await writeFile('assets/models/a320-alrosa/model-v1.glb',bytes);
const manifest={id:'a320-alrosa',version:'a320-alrosa-v1',source:{...asset,driveFileId:'13iJKCaKflNAiV7aGWgpf-hVw27DHVZ3S',bytes:source.length,sha256:createHash('sha256').update(source).digest('hex')},profile,bounds,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),triangles:parts.reduce((s,p)=>s+p.vertices.length/3,0),primitives:decoded.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().length,0),textures:decoded.getRoot().listTextures().length};
await writeFile('assets/models/a320-alrosa/manifest-v1.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('src/a320-profile.js',`// Generated by scripts/prepare-a320-asset.mjs. Physical metres, +Y up, +Z nose.\nexport const A320_PROFILE=Object.freeze(${JSON.stringify(profile)});\nexport const a320Support=(pitch,nose=false)=>Math.min(...(nose?A320_PROFILE.noseSupport:A320_PROFILE.mainSupport).map(([y,z])=>y*Math.cos(pitch)+z*Math.sin(pitch)));\n`);
console.log(JSON.stringify({bytes:bytes.length,sourceBytes:source.length,triangles:manifest.triangles,primitives:manifest.primitives,textures:manifest.textures,profile}));
