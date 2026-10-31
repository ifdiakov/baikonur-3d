// Serve the checkout on :8765 first. npm install --no-save three@0.160.1
// playwright @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1
// @gltf-transform/functions@4.5.1 meshoptimizer
import {chromium} from 'playwright';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,weld,meshopt,textureCompress} from '@gltf-transform/functions';
import sharp from 'sharp';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();
 await page.goto(new URL('workshop/zenit.html',base).href);await page.waitForFunction(()=>window.__ZENIT_QA);
 const result=await page.evaluate(async()=>{
  const {GLTFExporter}=await import('../node_modules/three/examples/jsm/exporters/GLTFExporter.js');
  const data=new Uint8Array(await new GLTFExporter().parseAsync(window.__ZENIT_QA.asset(),{binary:true}));
  let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));
  return {encoded:btoa(binary),stats:window.__ZENIT_QA.stats()};
 });
 await MeshoptEncoder.ready;await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
 const document=await io.readBinary(Buffer.from(result.encoded,'base64'));
 await document.transform(dedup(),weld(),meshopt({encoder:MeshoptEncoder,level:'medium'}),textureCompress({encoder:sharp,targetFormat:'jpeg',quality:92}));
 const bytes=await io.writeBinary(document),dir='assets/models/zenit-3sl';await mkdir(dir,{recursive:true});await writeFile(dir+'/model-v1.glb',bytes);
 const {dimensions,triangles,drawCalls,components,version}=result.stats;
 const manifest={id:'zenit-3sl',version,units:'metres',upAxis:'+Y',ground:0,dimensions,triangles,drawCalls,components,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),compression:'EXT_meshopt_compression',source:'Original procedural reconstruction from eight owner-supplied Zenit-3SL reference images; see docs/zenit-reference-model.md',generator:'src/zenit-rocket.js',viewer:'workshop/zenit.html'};
 await writeFile(dir+'/manifest-v1.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
}finally{await browser.close();}
