import * as THREE from 'three';
import {ARCHIVE_MAP,ARCHIVE_VERSION} from './archive-manifest.js?v=20261031-facilities-rails-lighting-v1';
import * as buildings from './archive-buildings.js?v=20261031-facilities-rails-lighting-v1';
import * as launches from './archive-launches.js?v=20261031-facilities-rails-lighting-v1';
import {photoCity} from './archive-city.js?v=20261031-facilities-rails-lighting-v1';
import {buildSite31Pad} from './site31-pad.js?v=20261031-facilities-rails-lighting-v1';
import {buildSiloPad,siloController} from './silo-pad.js?v=20261031-facilities-rails-lighting-v1';
import {buildSevenWinds} from './seven-winds.js?v=20261031-facilities-rails-lighting-v1';
import {buildSite110,SITE110_VIEWS} from './site110.js?v=20261031-facilities-rails-lighting-v1';
import {buildSite41} from './site41.js?v=20261031-facilities-rails-lighting-v1';
import {SITE41_VIEWS} from './site41-profile.js?v=20261031-facilities-rails-lighting-v1';
export function buildArchiveModel(root,entry){
 const builders={'seven-winds':buildSevenWinds,silo:buildSiloPad,'proton-halls':buildings.protonHalls,settlement:buildings.settlement95,mik42:buildings.mik42Facade,mzk:buildings.mzk112a,yubileiny:buildings.yubileiny,checkpoint:buildings.checkpoint7,observation:buildings.observationPoint,nedelin:buildSite41,buran:buildings.buranMuseum,cleanroom:buildings.cleanroom,energia:buildSite110,soyuz:buildSite31Pad,zenit:launches.zenit45,city:photoCity};
 if(entry.kind==='silo')return buildSiloPad(root,{siteId:entry.id,title:entry.title});
 if(entry.kind==='proton')return launches.protonComplex(root,entry.id);
 if(!builders[entry.kind])throw Error('Unknown archive model '+entry.kind);
 return builders[entry.kind](root);
}
export function installArchiveModels({objects,clickable,voids}){
 const records=[],silos=[];
 for(const spec of ARCHIVE_MAP){
  const i=objects.findIndex(o=>o.record.id===spec.id);if(i<0)throw Error('Missing archive site '+spec.id);
  const o=objects[i],root=o.g;root.clear();root.scale.setScalar(spec.scale);root.rotation.y=spec.yaw;root.position.y=-2.72;
  for(let n=clickable.length-1;n>=0;n--)if(clickable[n].userData.idx===i)clickable.splice(n,1);
  root.name=spec.title;
  const built=buildArchiveModel(root,spec);
  // Builder handles belong to the live scene, not the serializable catalogue
  // report. In particular, a rocket holder points back through its parents.
  const {rocket:rocketHandle,...features}=built;
  const silo=siloController(root);if(silo)silos.push(silo);root.updateWorldMatrix(true,true);
  root.addEventListener('museum-exhibit-loaded',event=>{
   const removed=new Set(event.removed);
   for(let n=clickable.length-1;n>=0;n--)if(removed.has(clickable[n]))clickable.splice(n,1);
   for(const m of event.added){m.userData.idx=i;clickable.push(m);}
  });
  root.traverse(m=>{
   if(m.userData.archiveCutouts)for(const shape of m.userData.archiveCutouts)voids.add(m,shape);
   if(m.isMesh){m.userData.idx=i;clickable.push(m);}
  });
  const bounds=new THREE.Box3().setFromObject(root);
  const entry={...spec,version:ARCHIVE_VERSION,features,bounds:bounds.getSize(new THREE.Vector3()).toArray(),centre:bounds.getCenter(new THREE.Vector3()).toArray(),index:i};
  o.archive=entry;o.type='archive-'+spec.kind;root.userData.archiveModel=entry;records.push(entry);
 }
 function focus(index,camera,controls){const o=objects[index];if(!o?.archive)return false;
  if(o.archive.kind==='seven-winds')return inspectHotel('all',camera,controls);
  if(o.record.id==='pad-31')return inspectSite31('duct',camera,controls);
  if(o.record.id==='pad-110')return inspectSite110('all',camera,controls);
  if(o.record.id==='pad-41')return inspectSite41('all',camera,controls);
  if(o.archive.kind==='silo'){siloController(o.g).inspect('all',camera,controls);return true;}
  if(o.archive.kind==='mzk')return inspectMzkSdi('all',camera,controls);
  const b=new THREE.Box3().setFromObject(o.g),size=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3()),r=Math.max(size.x,size.z,size.y*2);
  controls.target.copy(c);camera.position.copy(c).add(new THREE.Vector3(.75,.92,1.0).multiplyScalar(r));return true;
 }
 function inspectHotel(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-75')?.g;if(!root)return false;root.updateWorldMatrix(true,false);
  const [target,eye]=view==='garden'?[[22,1.5,33],[44,23,60]]:view==='front'?[[0,6,4],[-40,48,62]]:[[0,3,13],[-64,61,92]];
  controls.target.copy(root.localToWorld(new THREE.Vector3(...target)));camera.position.copy(root.localToWorld(new THREE.Vector3(...eye)));controls.update();return true;
 }
 function inspectSite110(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-110')?.g;if(!root)return false;
  const v=SITE110_VIEWS[view]||SITE110_VIEWS.all;root.updateWorldMatrix(true,false);
  controls.target.copy(root.localToWorld(new THREE.Vector3(...v.target)));
  camera.position.copy(root.localToWorld(new THREE.Vector3(...v.eye)));controls.update();return true;
 }
 function inspectSite41(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-41')?.g;if(!root)return false;
  const v=SITE41_VIEWS[view]||SITE41_VIEWS.all;root.updateWorldMatrix(true,false);
  controls.target.copy(root.localToWorld(new THREE.Vector3(...v.target)));
  camera.position.copy(root.localToWorld(new THREE.Vector3(...v.eye)));controls.update();return true;
 }
 function inspectMzkSdi(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-112a')?.g,views=root?.userData.mzkSdi?.views;
  if(!views)return false;const {target,eye}=views[view]||views.all;
  root.updateWorldMatrix(true,false);
  controls.target.copy(root.localToWorld(new THREE.Vector3(...target)));
  camera.position.copy(root.localToWorld(new THREE.Vector3(...eye)));controls.update();return true;
 }
 function inspectSite31(view,camera,controls){
  const o=objects.find(o=>o.record.id==='pad-31');if(!o?.archive)return false;
  const root=o.g;root.updateWorldMatrix(true,false);
  if(view==='top'){
   controls.target.copy(root.localToWorld(new THREE.Vector3(0,0,-8)));
   camera.position.copy(controls.target).add(new THREE.Vector3(0,150,.001));
  }else{
   const target=view==='connections'?new THREE.Vector3(0,2,66):new THREE.Vector3(-3,0,-54);
   const eye=view==='connections'?new THREE.Vector3(260,230,315):new THREE.Vector3(-150,205,-270);
   controls.target.copy(root.localToWorld(target));camera.position.copy(root.localToWorld(eye));
  }
  return true;
 }
 return {focus,inspectHotel,inspectMzkSdi,inspectSite31,inspectSite110,inspectSite41,inspectSilo:(view,camera,controls,siteId='pad-109')=>silos.find(s=>s.siteId===siteId)?.inspect(view,camera,controls),update:(now,camera,target)=>silos.forEach(s=>s.update(now,camera,target)),silos:()=>silos.map(s=>s.stats()),stats:()=>({version:ARCHIVE_VERSION,count:records.length,models:records})};
}
