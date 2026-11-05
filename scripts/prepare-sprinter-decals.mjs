import {readFile,writeFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'meshoptimizer';
import {projectSprinterDecal,SPRINTER_DETAIL_VERSION} from '../src/sprinter-detail.js';
const b=await readFile('assets/models/sprinter/model-v1.glb'),manifest=JSON.parse(await readFile('assets/models/sprinter/manifest-v1.json'));
const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');scene.updateMatrixWorld(true);
const panels=[];scene.traverse(o=>{if(o.isMesh&&o.material.name==='carpaint')panels.push(o);});
const V=(...p)=>new THREE.Vector3(...p),specs={
 hood:{sample:(u,v)=>V((u-.5)*.66,4,3.12-v*.45),direction:V(0,-1,0),columns:28,rows:24},
 rear:{sample:(u,v)=>V(-.46-(u-.5)*.72,.99+v*.19,-5),direction:V(0,0,1),columns:24,rows:8}
};
for(const side of [-1,1])specs['side'+side]={sample:(u,v)=>V(side*2,1.09+v*.25,-1.77-side*(u-.5)*1.75),direction:V(-side,0,0),columns:28,rows:8};
const decals={};for(const [name,spec]of Object.entries(specs)){
 const g=projectSprinterDecal(panels,spec),rounded=a=>Array.from(a,n=>Number(n.toFixed(6)));
 decals[name]={position:rounded(g.attributes.position.array),uv:rounded(g.attributes.uv.array),index:Array.from(g.index.array)};g.dispose();
}
const data={version:SPRINTER_DETAIL_VERSION,sourceSha256:manifest.asset.sha256,decals};const text=JSON.stringify(data)+'\n';await writeFile('assets/models/sprinter/decals-v2.json',text);console.log('SPRINTER_DECALS_BAKED',text.length);
