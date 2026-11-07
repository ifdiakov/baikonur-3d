import {readFile,writeFile,mkdir} from 'node:fs/promises';import{createHash}from'node:crypto';
import{NodeIO,Logger}from'@gltf-transform/core';import{ALL_EXTENSIONS}from'@gltf-transform/extensions';import{weld,prune,dedup,meshopt,simplifyPrimitive,textureCompress}from'@gltf-transform/functions';import{MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier}from'meshoptimizer';import sharp from'sharp';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});const sha=b=>createHash('sha256').update(b).digest('hex'),dir=process.argv[2];
const source=await readFile(dir+'/proton.blend'),exported=JSON.parse(await readFile(dir+'/export.json'));const all={version:'proton-source-20261108-v1',source:{driveIds:['1kXUE3OOcQ2k_0ClnJmQf1PrN88UEw6O4','1Aitm-DFLekAKPqyFgy3tzL2bSJFJ-jNr'],bytes:source.length,sha256:sha(source)},normalization:{unit:'metre',up:'Y',height:58.2,...exported},assets:{}};
await mkdir('assets/models/proton',{recursive:true});
for(const part of ['rocket','gantry','pad']){
 const doc=await io.read(dir+'/'+part+'-raw.glb');doc.setLogger(new Logger(Logger.Verbosity.ERROR));const r=doc.getRoot();let original=0;
 // The Blender decal mixes alpha over white paint; glTF baseColor must contain that composite.
 for(const t of r.listTextures())if(t.getName()==='proton_decal')t.setImage(await sharp(t.getImage()).flatten({background:'#ffffff'}).png().toBuffer()).setMimeType('image/png');
 await doc.transform(weld());
 for(const m of r.listMeshes())for(const p of m.listPrimitives()){
  original+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
  const a=p.getAttribute('POSITION').getArray(),range=MeshoptSimplifier.getScale(a,3);
  simplifyPrimitive(p,{simplifier:MeshoptSimplifier,ratio:.18,error:(part==='rocket'?.012:.02)/range,lockBorder:false});
 }
 await doc.transform(dedup(),prune(),weld(),textureCompress({encoder:sharp,targetFormat:'webp',quality:90,effort:6}),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
 const bytes=await io.writeBinary(doc),d=await io.readBinary(bytes),root=d.getRoot();const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let triangles=0,primitives=0;
 for(const n of root.listNodes())for(const p of n.getMesh()?.listPrimitives()||[]){primitives++;triangles+=p.getIndices().getCount()/3;const pos=p.getAttribute('POSITION'),m=n.getWorldMatrix(),v=[];for(let i=0;i<pos.getCount();i++){pos.getElement(i,v);for(let j=0;j<3;j++){const x=m[j]*v[0]+m[j+4]*v[1]+m[j+8]*v[2]+m[j+12];bounds.min[j]=Math.min(bounds.min[j],x);bounds.max[j]=Math.max(bounds.max[j],x);}}}
 bounds.size=bounds.max.map((v,i)=>v-bounds.min[i]);all.assets[part]={path:part+'-v1.glb',bytes:bytes.length,sha256:sha(bytes),triangles,sourceTriangles:original,primitives,bounds,textures:root.listTextures().map(t=>({name:t.getName(),size:t.getSize()}))};
 await writeFile('assets/models/proton/'+part+'-v1.glb',bytes);console.log(part,JSON.stringify(all.assets[part]));
}
await writeFile('assets/models/proton/manifest.json',JSON.stringify(all,null,2)+'\n');
