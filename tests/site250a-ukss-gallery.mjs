import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SITE250A_YAW,SITE250A_GALLERY_PIXELS,site250aPixel} from '../src/site250a-layout.js';
import {buildSite250aUkssGallery,UKSS_GALLERY_DOCK_LOCAL,SITE250A_UKSS_GALLERY_VERSION} from '../src/site250a-ukss-gallery.js';
const scene=new THREE.Group(),site=new THREE.Group(),ukss=new THREE.Group();
scene.add(site,ukss);
site.position.set((608-650)*3.4,-2.72,(239-522.5)*3.4);
site.rotation.y=SITE250A_YAW;site.scale.setScalar(.14);
ukss.position.set((635-650)*3.4,-2.755,(220-522.5)*3.4);
ukss.rotation.y=-.56;ukss.scale.setScalar(.14);
site.updateWorldMatrix(true,false);ukss.updateWorldMatrix(true,false);
const galleryEnd=site250aPixel(SITE250A_GALLERY_PIXELS.at(-1));
const first=site.localToWorld(new THREE.Vector3(galleryEnd[0],5.1,galleryEnd[1]));
const last=ukss.localToWorld(new THREE.Vector3(...UKSS_GALLERY_DOCK_LOCAL));
const roadPoints=Array.from({length:45},(_,i)=>{
 const t=i/44;return first.clone().lerp(last,t).add(new THREE.Vector3(5,0,0));
});
const roadPath={id:'museum-yubileiny-250a-ukss',points:roadPoints};
const built=buildSite250aUkssGallery({site250a:site,ukss,scene,roadPath});
const {metadata,group}=built;
const end=site250aPixel(SITE250A_GALLERY_PIXELS.at(-1));
site.updateWorldMatrix(true,false);ukss.updateWorldMatrix(true,false);
const exactStart=site.localToWorld(new THREE.Vector3(end[0],5.1,end[1]));
const exactDock=ukss.localToWorld(new THREE.Vector3(...UKSS_GALLERY_DOCK_LOCAL));
assert(new THREE.Vector3(...metadata.start).distanceTo(exactStart)<1e-7,'Gallery must touch the original 250A corridor without a gap');
assert(new THREE.Vector3(...metadata.end).distanceTo(exactDock)<1e-7,'Gallery must terminate in UKSS exhibit local space');
assert.equal(metadata.version,SITE250A_UKSS_GALLERY_VERSION);
assert.equal(metadata.roadAligned,true);
assert.equal(metadata.roadId,roadPath.id);
assert(metadata.roadOffset>0);
assert(metadata.length>25&&metadata.length<120,'The gallery should connect the two model envelopes without wandering across the map');
assert(metadata.pierCount>=12,'Keep the existing reinforced concrete support rhythm');
assert.equal(group.children.length,2,'The complete span uses two instanced batches, not hundreds of separate draw calls');
for(const mesh of group.children){
 assert(mesh.isInstancedMesh&&mesh.count>0);
 const matrix=new THREE.Matrix4();
 for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);assert([...matrix.elements].every(Number.isFinite));}
}
assert(!metadata.roadChanges,'The gallery must not alter transport route topology');
console.log('SITE250A_UKSS_GALLERY_PASS',JSON.stringify(metadata));
