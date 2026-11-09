import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {MeshoptSimplifier} from 'meshoptimizer';
import {chromium} from 'playwright';
import {MODEL_CATALOG} from '../src/model-catalog.js';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const out='assets/public-v1';await mkdir(out+'/sites',{recursive:true});await mkdir(out+'/tiles',{recursive:true});await MeshoptSimplifier.ready;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message);});
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__BUILD_FRAME=()=>pending?.(performance.now());});
await page.route('**/*',async route=>{if(route.request().resourceType()!=='document')return route.continue();const r=await route.fetch();let text=await r.text();text=text.replace('window.__BAIKONUR_QA={','window.__BUILD={THREE,scene,camera,ctl,renderer,objects,layers,portalArchive,roadEditor,transport,terrainRelief,museumTerrainHeightAt,ground,satelliteGround,outerTerrain,sharedSiloHill,saturnGroup,requestTransportDetail,steppeSurface,roadLOD};window.__BAIKONUR_QA={');await route.fulfill({response:r,body:text});});
const writeData=async(path,data)=>{const bytes=gzipSync(Buffer.from(JSON.stringify(data)),{level:9});await writeFile(out+'/'+path,bytes);return {url:out+'/'+path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};};
function meshSummary(json,id){
 const clean=structuredClone(json);delete clean.images;delete clean.textures;
 for(const m of clean.materials||[])for(const k of Object.keys(m))if(/map$/i.test(k))delete m[k];
 const root=new THREE.ObjectLoader().parse(clean);root.updateMatrixWorld(true);
 const pos=[],normal=[],color=[],v=new THREE.Vector3(),nm=new THREE.Matrix3(),im=new THREE.Matrix4(),world=new THREE.Matrix4(),c=new THREE.Color();
 root.traverseVisible(mesh=>{
  if(!mesh.isMesh||mesh.isSkinnedMesh)return;
  let geo=mesh.geometry;const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const source=geo.attributes.position;if(!source||!source.count)return;
  geo.computeBoundingBox();const extent=geo.boundingBox.getSize(new THREE.Vector3()).length();
  let simple=geo.clone();simple.deleteAttribute('uv');simple.deleteAttribute('normal');simple.deleteAttribute('color');simple=mergeVertices(simple,.002);
  let indices=new Uint32Array(simple.index.array),points=simple.attributes.position.array;
  if(indices.length>3000&&materials.length===1){
   try{[indices]=MeshoptSimplifier.simplifySloppy(indices,points,3,Math.max(180,Math.floor(indices.length*.08/3)*3),.025);}catch{}
   simple.setIndex(new THREE.BufferAttribute(indices,1));
  }
  simple.computeVertexNormals();const normals=simple.attributes.normal;
  for(let instance=0;instance<(mesh.isInstancedMesh?mesh.count:1);instance++){
   if(mesh.isInstancedMesh){mesh.getMatrixAt(instance,im);world.multiplyMatrices(mesh.matrixWorld,im);}else world.copy(mesh.matrixWorld);
   const scale=new THREE.Vector3().setFromMatrixScale(world);if(extent*Math.max(scale.x,scale.y,scale.z)<.7)continue;
   nm.getNormalMatrix(world);const mat=materials[0];if(!mat||mat.opacity<.12)continue;c.copy(mat.color||new THREE.Color(.65,.65,.6));
   for(const ix of indices){v.fromBufferAttribute(simple.attributes.position,ix).applyMatrix4(world);pos.push(Math.round(v.x*100)/100,Math.round(v.y*100)/100,Math.round(v.z*100)/100);v.fromBufferAttribute(normals,ix).applyMatrix3(nm).normalize();normal.push(Math.round(v.x*127),Math.round(v.y*127),Math.round(v.z*127));color.push(Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255));}
  }
  simple.dispose();
 });
 return {id,p:pos,n:normal,c:color};
}
try{
 await page.goto(base+'workshop.html?tour=0&workshopBuild=1',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BUILD||document.querySelector('#error')?.textContent,null,{timeout:240000});
 if(!await page.evaluate(()=>!!window.__BUILD))throw Error(await page.evaluate(()=>document.body.innerText.slice(-800)));
 console.log('BUILD_SCENE_READY');
 await page.evaluate(()=>{window.__BAIKONUR_QA.evening.setEvening(false);window.__BAIKONUR_QA.setLabelsVisible(false);window.__BUILD_FRAME();window.__BUILD.requestTransportDetail();});
 await page.waitForFunction(()=>window.__BAIKONUR_QA.stats().transportBake.detailReady,null,{timeout:360000});
 console.log('BUILD_ROADS_READY');
 const seed=await page.evaluate(()=>{
  const b=window.__BUILD,T=b.THREE;b.scene.updateMatrixWorld(true);
  const sites=b.objects.map(o=>{const box=new T.Box3().setFromObject(o.g);return {id:o.record.id,title:o.record.titleFull||o.name||o.record.name,short:o.record.titleShort||o.name,kind:o.record.kind,number:o.record.number,description:o.record.purposeLong||o.record.purposeShort||o.record.purpose||'',position:o.g.getWorldPosition(new T.Vector3()).toArray(),center:(box.isEmpty()?o.g.getWorldPosition(new T.Vector3()):box.getCenter(new T.Vector3())).toArray(),size:(box.isEmpty()?new T.Vector3(10,1,10):box.getSize(new T.Vector3())).toArray()};});
  const bounds=[-2350,-1900,2350,1900],segments=160,heights=[];
  for(let z=0;z<=segments;z++)for(let x=0;x<=segments;x++)heights.push(Math.round(b.museumTerrainHeightAt(bounds[0]+(bounds[2]-bounds[0])*x/segments,bounds[1]+(bounds[3]-bounds[1])*z/segments)*1000)/1000);
  return {version:'museum-public-v1',sites,bounds,segments,heights,camera:{position:b.camera.position.toArray(),target:b.ctl.target.toArray()},sourceRoads:b.transport.editableRoadPaths().length,roadsMode:'baked-into-terrain',createdAt:new Date().toISOString()};
 });
 seed.models=Object.values(MODEL_CATALOG).map(({id,title})=>({id,title}));
 const overview=[];
 for(let i=0;i<seed.sites.length;i++){
  const json=await page.evaluate(index=>{
   const b=window.__BUILD,T=b.THREE,o=b.objects[index],root=new T.Group(),materials=new Map();root.name=o.record.id;
   b.scene.updateMatrixWorld(true);
   o.g.traverseVisible(m=>{
    if(!m.isMesh||m.isSkinnedMesh)return;
    const cleanMat=mat=>{if(materials.has(mat.uuid))return materials.get(mat.uuid);const c=new T.MeshStandardMaterial({color:mat.color||new T.Color(.65,.65,.6),roughness:.9,metalness:0,side:T.DoubleSide,transparent:mat.transparent,opacity:mat.opacity,vertexColors:mat.vertexColors});if(mat.map)c.map=mat.map;materials.set(mat.uuid,c);return c;};
    const mat=Array.isArray(m.material)?m.material.map(cleanMat):cleanMat(m.material);let copy;
    if(m.isInstancedMesh){copy=new T.InstancedMesh(m.geometry,mat,m.count);copy.instanceMatrix=m.instanceMatrix.clone();if(m.instanceColor)copy.instanceColor=m.instanceColor.clone();}else copy=new T.Mesh(m.geometry,mat);
    copy.matrix.copy(m.matrixWorld);copy.matrixAutoUpdate=false;root.add(copy);
   });return root.toJSON();
  },i);
  const site=seed.sites[i];site.detail=await writeData('sites/'+site.id+'.json.gz',json);
  const low=meshSummary(json,site.id);overview.push(low);site.overviewTriangles=low.p.length/9;
  if(i%20===0)console.log('EXPORTED',i,'/',seed.sites.length,site.id);
 }
 seed.overview=await writeData('overview.json.gz',overview);
 // Bake terrain offline. Public roads are part of its texture, not ribbons.
 await page.evaluate(()=>{
  const b=window.__BUILD,T=b.THREE;
  b.scene.fog=null;b.renderer.setPixelRatio(1);b.renderer.setSize(1024,1024);
  const allowed=new Set();
  const allow=o=>o?.traverse(m=>{if(m.isMesh||m.isLine||m.isPoints)allowed.add(m);});
  for(const g of [b.ground,b.satelliteGround,...b.outerTerrain.planes,b.terrainRelief.mesh,b.sharedSiloHill.mesh,b.layers.roads,b.layers.rails])allow(g);
  b.saturnGroup.traverse(m=>{if(m.userData.museumComponent==='murguduk-hill')allow(m);});
  // Keep ancestors enabled while excluding unrelated sibling buildings.
  b.scene.traverse(o=>{if(o.isMesh||o.isLine||o.isPoints)o.visible=allowed.has(o);else o.visible=true;});
  if(b.roadLOD)b.roadLOD.root.visible=false;
  window.__ATLAS=document.createElement('canvas');window.__ATLAS.width=window.__ATLAS.height=1024;
 });
 seed.tiles=[];
 for(let z=0;z<4;z++)for(let x=0;x<4;x++){
  const image=await page.evaluate(({x,z,bounds})=>{
   const b=window.__BUILD,T=b.THREE,w=(bounds[2]-bounds[0])/4,h=(bounds[3]-bounds[1])/4,cx=bounds[0]+(x+.5)*w,cz=bounds[1]+(z+.5)*h;
   const cam=new T.OrthographicCamera(-w/2,w/2,h/2,-h/2,.1,30000);cam.position.set(cx,12000,cz);cam.up.set(0,0,-1);cam.lookAt(cx,0,cz);cam.updateMatrixWorld(true);
   b.renderer.render(b.scene,cam);window.__ATLAS.getContext('2d').drawImage(b.renderer.domElement,x*256,z*256,256,256);
   return b.renderer.domElement.toDataURL('image/webp',.87).split(',')[1];
  },{x,z,bounds:seed.bounds});
  const path=`tiles/${x}-${z}.webp`,buffer=Buffer.from(image,'base64');await writeFile(out+'/'+path,buffer);seed.tiles.push({x,z,url:out+'/'+path,bytes:buffer.length});
 }
 const atlas=await page.evaluate(()=>window.__ATLAS.toDataURL('image/webp',.86).split(',')[1]);await writeFile(out+'/terrain-overview.webp',Buffer.from(atlas,'base64'));seed.terrainTexture=out+'/terrain-overview.webp';
 seed.build={errors,overviewTriangles:overview.reduce((n,s)=>n+s.p.length/9,0),overviewBytes:seed.overview.bytes,detailBytes:seed.sites.reduce((n,s)=>n+s.detail.bytes,0)};
 if(errors.length)throw Error('Build had browser errors: '+errors.join('; '));
 seed.fingerprint=createHash('sha256').update(JSON.stringify(seed)).digest('hex').slice(0,12);
 await writeFile('data/public-scene.json',JSON.stringify(seed));
 console.log('PUBLIC_SCENE_BAKED',JSON.stringify({...seed.build,sites:seed.sites.length}));
}finally{await browser.close();}
