import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out='qa-sprinter';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1000,height:800}});
try{
 await page.route('**/tests/sprinter-fixture.html',r=>r.fulfill({contentType:'text/html',body:`<html><style>body{margin:0}</style><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/"}}</script><script type="module">
 import * as THREE from 'three';import {loadSprinterSource,createSprinterVehicle} from '../src/sprinter-source.js';
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xa79982);const camera=new THREE.PerspectiveCamera(52,1.25,.1,80000),renderer=new THREE.WebGLRenderer({antialias:true,logarithmicDepthBuffer:true});renderer.setSize(1000,800);document.body.append(renderer.domElement);scene.add(new THREE.HemisphereLight(0xbdd7f2,0x62533d,2));const sun=new THREE.DirectionalLight(0xffdfb4,2.2);sun.position.set(-700,1200,500);scene.add(sun);
 const source=await loadSprinterSource();const root=new THREE.Group();scene.add(root);root.scale.setScalar(.64);root.position.set(-125,.74,951);root.rotation.y=3.107;root.add(source.scene);const target=root.position.clone().add(new THREE.Vector3(0,.8,0));camera.position.copy(target).add(new THREE.Vector3(8,5,10).multiplyScalar(.64));camera.lookAt(target);
 const original=[];source.scene.traverse(o=>{if(o.isMesh)original.push({mesh:o,mat:o.material,side:o.material.side,transparent:o.material.transparent});});
 window.inspectMaterials=()=>original.map(o=>({name:o.mat.name,type:o.mat.type,depthWrite:o.mat.depthWrite,transparent:o.mat.transparent,side:o.mat.side,opacity:o.mat.opacity}));
 window.draw=mode=>{for(const o of original){o.mesh.material=o.mat;o.mat.side=o.side;o.mat.transparent=o.transparent;o.mat.needsUpdate=true;if(mode==='basic')o.mesh.material=new THREE.MeshBasicMaterial({color:o.mat.color,side:o.mat.side});if(mode==='front')o.mat.side=THREE.FrontSide;if(mode==='opaque')o.mat.transparent=false;}
 renderer.render(scene,camera);};window.draw('normal');window.ready=true;
 </script></html>`}));
 await page.goto(base+'tests/sprinter-fixture.html');await page.waitForFunction(()=>window.ready,null,{timeout:60000});
 for(const mode of ['normal','basic','front','opaque']){await page.evaluate(m=>window.draw(m),mode);await page.screenshot({path:`${out}/detail-${mode}.png`});}
 await writeFile(`${out}/detail-materials.json`,JSON.stringify(await page.evaluate(()=>window.inspectMaterials()),null,2));
}finally{await browser.close();}
