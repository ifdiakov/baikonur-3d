import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import * as THREE from 'three';
import {buildSite118Exhibit,site118Controller,SITE118_ASSET_VERSION,SITE118_PROFILE} from '../src/site118-source.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {measureSite118,assertSite118Measurement} from './site118-geometry.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJSON=async file=>JSON.parse(await readFile(file,'utf8'));
const manifest=await readJSON('assets/models/site118/manifest-v1.json'),bytes=await readFile('assets/models/site118/model-v1.glb');
assert.equal(SITE118_ASSET_VERSION,'site118-drive-20261111-v1');assert.equal(manifest.version,SITE118_ASSET_VERSION);
assert.equal(bytes.length,manifest.asset.bytes);assert.equal(sha(bytes),manifest.asset.sha256);assert(bytes.length<2200000);
assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
const jsonLength=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength)),binStart=28+jsonLength;
assert.equal(bytes.readUInt32LE(binStart-4),0x004e4942);const binary=bytes.subarray(binStart);
assert(!gltf.extensionsUsed?.length,'This compact source uses ordinary embedded glTF buffers');
assert.equal(gltf.buffers.length,1);assert(!gltf.buffers[0].uri);assert.equal(gltf.meshes.length,4);
assert.equal(gltf.materials.length,1);assert.equal(gltf.textures.length,1);assert.equal(gltf.images.length,1);
assert(!gltf.animations?.length&&!gltf.cameras?.length);assert(!JSON.stringify(gltf).match(/"uri"\s*:/));
assert.match(gltf.asset.copyright,/novusod.*CC BY 4\.0/);
assert.deepEqual(gltf.scenes[gltf.scene||0].nodes,[0,1,2,3]);assert.equal(gltf.nodes.length,4);
assert.deepEqual(manifest.normalization,{unit:'metre',up:'+Y',scale:1,translation:manifest.normalization.translation,
  sourceGroundY:0,modelGroundY:0,worldGroundY:-2.755,interpretation:manifest.normalization.interpretation});
assert.equal(manifest.normalization.translation[1],0,'Original underground pipes stay below the surface datum');
assert.equal(manifest.sourceSha256,'ac477f190f9314fd1a1d6c4abf81282dc2c7081ed2b1ed0336349d4acaf39938');
assert.equal(manifest.adaptation.geometryDecimated,false);
const removed=manifest.adaptation.removed;
assert.equal(removed.filter(p=>p.sourcePart==='Gate_2').length,7);assert.equal(removed.filter(p=>p.sourcePart==='Grass_4').length,1);
assert.equal(removed.reduce((n,p)=>n+p.triangles,0),286);assert.equal(manifest.sourceTriangles-286,10669);
for(const p of removed.filter(p=>p.sourcePart==='Gate_2')){assert.equal(p.sourceTriangleIndices.length,p.triangles);assert.equal(new Set(p.sourceTriangleIndices).size,p.triangles);}
const textureView=gltf.bufferViews[gltf.images[0].bufferView],texture=binary.subarray(textureView.byteOffset,textureView.byteOffset+textureView.byteLength);
assert.equal(sha(texture),manifest.asset.textureSha256);assert.equal(gltf.images[0].mimeType,'image/png');

// This asset deliberately has four flat, uncompressed primitives. Reading
// their real accessors directly keeps the test independent of the exporter.
function accessor(index){
  const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],sizes={SCALAR:1,VEC2:2,VEC3:3},types={5123:Uint16Array,5126:Float32Array};
  const Type=types[a.componentType],size=sizes[a.type];assert(Type&&size&&!a.sparse&&!a.normalized);
  assert(!v.byteStride||v.byteStride===size*Type.BYTES_PER_ELEMENT);assert.equal(v.buffer,0);
  const offset=(v.byteOffset||0)+(a.byteOffset||0),length=a.count*size*Type.BYTES_PER_ELEMENT;
  assert(offset+length<=binary.byteLength);const data=binary.subarray(offset,offset+length);
  return {array:new Type(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)),size,bytes:data};
}
const source=new THREE.Group(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});let triangles=0;
for(const node of gltf.nodes){
  assert(!node.matrix&&!node.translation&&!node.rotation&&!node.scale&&!node.children?.length,'The retained geometry is already in source-local metres');
  const expected=manifest.retained.find(p=>p.name===node.name);assert(expected);
  const primitives=gltf.meshes[node.mesh].primitives;assert.equal(primitives.length,1);const primitive=primitives[0];assert.equal(primitive.mode??4,4);
  const geometry=new THREE.BufferGeometry();
  for(const [key,name] of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']]){
    const a=accessor(primitive.attributes[key]);assert.equal(sha(a.bytes),expected.geometrySha256[key]);
    assert([...a.array].every(Number.isFinite));geometry.setAttribute(name,new THREE.BufferAttribute(a.array,a.size));
  }
  const indices=accessor(primitive.indices);assert.equal(sha(indices.bytes),expected.geometrySha256.indices);geometry.setIndex(new THREE.BufferAttribute(indices.array,1));
  assert.equal(indices.array.length/3,expected.triangles);triangles+=indices.array.length/3;
  const mesh=new THREE.Mesh(geometry,material);mesh.name=node.name;mesh.userData={...node.extras};source.add(mesh);
}
assert.equal(triangles,10669);assert.deepEqual(source.children.map(m=>m.name),['Cube_0','Siding_1','Gate_2','Cylinder_3']);
const pipe=manifest.retained.find(p=>p.name==='Cylinder_3');assert.equal(pipe.triangles,1074);assert.equal(pipe.triangles,pipe.sourceTriangles);assert(pipe.bounds.min[1]<-13&&pipe.bounds.max[1]<0);
assert.equal(manifest.contacts.length,15);assert.equal(manifest.groundNegativeProbes.length,6);
for(const p of manifest.contacts){assert(!p.mesh.startsWith('Cylinder'));assert.equal(p.maximumGap,.025);assert.equal(p.maximumEmbedDepth,1.75);}
const catalog=await readJSON('data/catalog.json'),matches=await readJSON('data/osm/catalog-matches.json');
const site=createMuseumGeography({catalog,matches}).sites.find(s=>s.id==='pad-118'),spec=ARCHIVE_MAP.find(s=>s.id==='pad-118');
assert(site&&spec);assert.equal(spec.kind,'site118');assert.equal(spec.scale,.14);assert.equal(spec.yaw,-2.106);
assert(Math.abs(site.x-539.8494544248842)<1e-9&&Math.abs(site.y-403.8748645052626)<1e-9,'Preserve the current geographic anchor');
const root=new THREE.Group();root.position.set((site.x-650)*3.4,-2.755,(site.y-522.5)*3.4);root.scale.setScalar(spec.scale);root.rotation.y=spec.yaw;
const events=[];root.addEventListener('museum-exhibit-loaded',event=>events.push(event));
let calls=0,fail=true,release;const held=new Promise(resolve=>release=resolve);
buildSite118Exhibit(root,{autoLoad:false,loadSource:async options=>{assert.equal(options.consumer,'museum-site118');calls++;if(fail)throw Error('Injected source network error');await held;return {scene:source.clone(true),manifest};}});
const controller=site118Controller(root);assert(controller);assert.equal(root.children.length,0,'There is no fabricated fallback or pedestal');
assert.deepEqual(Object.keys(controller.stats().views),['all','ground','top']);assert.deepEqual(controller.stats().views,SITE118_PROFILE.views);
assert.equal(await controller.load(),false);assert.equal(controller.stats().asset.status,'error');assert.equal(root.children.length,0);assert.equal(events.length,0);
fail=false;const first=controller.load(),second=controller.load();assert.equal(first,second,'Concurrent source requests share the same pending load');
assert.equal(controller.stats().asset.status,'loading');assert.equal(calls,2);release();assert.deepEqual(await Promise.all([first,second]),[true,true]);
assert.equal(events.length,1);assert.equal(events[0].added.length,4);assert.deepEqual(events[0].removed,[]);
assert.equal(await controller.load(),true);assert.equal(calls,2);assert.equal(events.length,1);assert.equal(root.children.length,1);
assert.throws(()=>buildSite118Exhibit(root,{autoLoad:false}),/уже установлена/);
const measured=measureSite118({THREE,root,manifest});assertSite118Measurement(measured,{manifest});
assert.doesNotThrow(()=>JSON.stringify(controller.stats()));
const credits=await readFile('credits.html','utf8');assert(credits.includes('novusod'));assert(credits.includes(manifest.sourceUrl));assert.match(credits,/CC BY 4\.0/);
const report={passed:true,sourceCommit:process.env.GITHUB_SHA||null,asset:{bytes:bytes.length,sha256:sha(bytes),triangles,meshes:source.children.length},removedTriangles:286,loader:{calls,events:events.length,retry:true,concurrent:true},measured};
await mkdir('qa-site118',{recursive:true});await writeFile('qa-site118/source-report.json',JSON.stringify(report,null,2)+'\n');
console.log('SITE118_SOURCE_PASS',JSON.stringify({bytes:bytes.length,triangles,meshes:4,contacts:measured.contacts.length,negativeProbes:measured.negativeProbes.length,loaderCalls:calls}));
