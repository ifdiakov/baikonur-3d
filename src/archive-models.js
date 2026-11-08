import {buildSite113} from './site113.js?v=20261105-site113-town-v1';
import {buildSite250a} from './site250a.js?v=20261103-site250a-photo-v1';
import {buildSite254} from './site254.js?v=20261103-site254-e10s5';
import {SEVEN_WINDS_LAYOUT} from './seven-winds-layout.js?v=20261101-hotel-v3';
import {sdiController} from './mzk-sdi-stand.js?v=20261102-site2-photo-v3';
import * as THREE from 'three';
import {site2Controller} from './site2-exhibit.js?v=20261103-site2-main-road-v1';
import {buildCycloneComplex,CYCLONE_VIEWS} from './cyclone-launch.js?v=20261102-site2-photo-v3';
import {ARCHIVE_MAP,ARCHIVE_VERSION} from './archive-manifest.js?v=20261106-site95-town-v1';
import * as buildings from './archive-buildings.js?v=20261106-site95-town-v1';
import * as launches from './archive-launches.js?v=20261108-proton-source-v1';
import {photoCity} from './archive-city.js?v=20261102-site2-photo-v3';
import {buildSite31Exhibit,site31Controller,SITE31_VIEWS} from './site31-exhibit.js?v=20261108-site31-lamps-v1';
import {buildSiloPad,siloController} from './silo-pad.js?v=20261102-site2-photo-v3';
import {buildSevenWinds} from './seven-winds.js?v=20261102-site2-photo-v3';
import {buildSite110,SITE110_VIEWS} from './site110.js?v=20261102-site2-photo-v3';
import {buildSite41} from './site41.js?v=20261102-site2-photo-v3';
import {SITE45_VIEWS} from './site45.js?v=20261102-site2-photo-v3';
import {protonPositionController} from './proton-launch.js?v=20261108-proton-source-v1';
import {SITE41_VIEWS} from './site41-profile.js?v=20261101-r16-exhibit-v1';
export function buildArchiveModel(root,entry){
 const builders={site113:buildSite113,site250a:buildSite250a,site254:buildSite254,cyclone:buildCycloneComplex,'seven-winds':buildSevenWinds,silo:buildSiloPad,'proton-halls':buildings.protonHalls,settlement:buildings.settlement95,mik42:buildings.mik42Facade,mzk:buildings.mzk112a,yubileiny:buildings.yubileiny,checkpoint:buildings.checkpoint7,observation:buildings.observationPoint,nedelin:buildSite41,buran:buildings.buranMuseum,cleanroom:buildings.cleanroom,energia:buildSite110,soyuz:buildSite31Exhibit,zenit:launches.zenit45,city:photoCity};
 if(entry.kind==='silo')return buildSiloPad(root,{siteId:entry.id,title:entry.title,activation:'height'});
 if(entry.kind==='proton')return launches.protonComplex(root,entry.id);
 if(!builders[entry.kind])throw Error('Unknown archive model '+entry.kind);
 return builders[entry.kind](root);
}
export function installArchiveModels({objects,clickable,voids,checkpoint7Placement}){
 const records=[],silos=[],sdiGates=[],protons=[];
 for(const spec of ARCHIVE_MAP){
  const i=objects.findIndex(o=>o.record.id===spec.id);if(i<0)throw Error('Missing archive site '+spec.id);
  const o=objects[i],root=o.g;root.clear();root.scale.setScalar(spec.scale);root.rotation.y=spec.yaw;root.position.y=-2.72;
  for(let n=clickable.length-1;n>=0;n--)if(clickable[n].userData.idx===i)clickable.splice(n,1);
  if(spec.id==='kpp-7'){
   if(!checkpoint7Placement)throw Error('КПП №7: отсутствует привязка к дороге');
   root.position.fromArray(checkpoint7Placement.position);root.rotation.y=checkpoint7Placement.yaw;
   root.userData.checkpoint7Placement=checkpoint7Placement;
   [o.record.x,o.record.y]=checkpoint7Placement.map;
  }
  root.name=spec.title;
  const built=buildArchiveModel(root,spec);
  // Builder handles belong to the live scene, not the serializable catalogue
  // report. In particular, a rocket holder points back through its parents.
  const {rocket:rocketHandle,...features}=built;
  root.traverse(o=>{const controller=protonPositionController(o);if(controller)protons.push(controller);});
  const gate=sdiController(root);if(gate)sdiGates.push(gate);
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
  if(o.record.id==='kpp-7')return inspectCheckpoint7('all',camera,controls);
  if(o.archive.kind==='seven-winds')return inspectHotel('all',camera,controls);
  if(o.record.id==='pad-31')return inspectSite31('all',camera,controls);
  if(o.record.id==='pad-110')return inspectSite110('all',camera,controls);
  if(o.archive.kind==='proton')return inspectProton(o.record.id,'launch',camera,controls);
  if(o.record.id==='pad-90')return inspectCyclone('all',camera,controls);
  if(o.record.id==='pad-45')return inspectSite45('all',camera,controls);
  if(o.record.id==='pad-41')return inspectSite41('all',camera,controls);
  if(o.archive.kind==='silo'){siloController(o.g).inspect('all',camera,controls);return true;}
  if(o.record.id==='pad-250a')return inspectSite250a('all',camera,controls);
  if(o.record.id==='pad-95')return inspectSite95('all',camera,controls);
  if(o.record.id==='pad-113')return inspectSite113('all',camera,controls);
  if(o.record.id==='pad-254')return inspectSite254('all',camera,controls);
  if(o.record.id==='pad-2')return inspectSite2('all',camera,controls);
  if(o.archive.kind==='mzk')return inspectMzkSdi('all',camera,controls);
  const b=new THREE.Box3().setFromObject(o.g),size=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3()),r=Math.max(size.x,size.z,size.y*2);
  controls.target.copy(c);camera.position.copy(c).add(new THREE.Vector3(.75,.92,1.0).multiplyScalar(r));return true;
 }
 function protonPosition(siteId,index=0){return objects.find(o=>o.record.id===siteId)?.g.children.filter(g=>g.userData.protonLaunch)[index];}
 function inspectProton(siteId,view,camera,controls,index=0){
  const root=protonPosition(siteId,index);if(!root)return false;protonPositionController(root).loadSource();const v=root.userData.protonLaunch.views[view]||root.userData.protonLaunch.views.launch;
  root.updateWorldMatrix(true,false);controls.target.copy(root.localToWorld(new THREE.Vector3(...v.target)));camera.position.copy(root.localToWorld(new THREE.Vector3(...v.eye)));controls.update();return true;
 }
 function setProtonRocketVisible(siteId,visible){const group=objects.find(o=>o.record.id===siteId)?.g;group?.children.filter(g=>g.userData.protonLaunch).forEach(g=>protonPositionController(g).setRocketVisible(visible));return !!group;}
 function protonStats(siteId){const group=objects.find(o=>o.record.id===siteId)?.g;return group?.children.filter(g=>g.userData.protonLaunch).map(g=>({...g.userData.protonLaunch,rocketVisible:protonPositionController(g).rocketVisible()}));}
 function inspectHotel(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-75')?.g;if(!root)return false;root.updateWorldMatrix(true,false);
  const {target,eye}=SEVEN_WINDS_LAYOUT.views[view]||SEVEN_WINDS_LAYOUT.views.all;
  controls.target.copy(root.localToWorld(new THREE.Vector3(...target).add(new THREE.Vector3(...SEVEN_WINDS_LAYOUT.modelOffset))));camera.position.copy(root.localToWorld(new THREE.Vector3(...eye).add(new THREE.Vector3(...SEVEN_WINDS_LAYOUT.modelOffset))));controls.update();return true;
 }
 function inspectSite110(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-110')?.g;if(!root)return false;
  const v=SITE110_VIEWS[view]||SITE110_VIEWS.all;root.updateWorldMatrix(true,false);
  controls.target.copy(root.localToWorld(new THREE.Vector3(...v.target)));
  camera.position.copy(root.localToWorld(new THREE.Vector3(...v.eye)));controls.update();return true;
 }
 function inspectCyclone(view,camera,controls){const root=objects.find(o=>o.record.id==='pad-90')?.g;if(!root)return false;const v=CYCLONE_VIEWS[view]||CYCLONE_VIEWS.all;root.updateWorldMatrix(true,false);controls.target.copy(root.localToWorld(new THREE.Vector3(...v.target)));camera.position.copy(root.localToWorld(new THREE.Vector3(...v.eye)));controls.update();return true;}
 function inspectSite45(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-45')?.g;if(!root)return false;const v=SITE45_VIEWS[view]||SITE45_VIEWS.all;root.updateWorldMatrix(true,false);controls.target.copy(root.localToWorld(new THREE.Vector3(...v.target)));camera.position.copy(root.localToWorld(new THREE.Vector3(...v.eye)));controls.update();return true;
 }
 function inspectSite41(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-41')?.g;if(!root)return false;
  const v=SITE41_VIEWS[view]||SITE41_VIEWS.all;root.updateWorldMatrix(true,false);
  controls.target.copy(root.localToWorld(new THREE.Vector3(...v.target)));
  camera.position.copy(root.localToWorld(new THREE.Vector3(...v.eye)));controls.update();return true;
 }
 function inspectCheckpoint7(view,camera,controls){
  const root=objects.find(o=>o.record.id==='kpp-7')?.g;if(!root)return false;root.updateWorldMatrix(true,false);
  let target,eye;
  if(view==='road'){
   const p=root.userData.checkpoint7Placement,bridge=new THREE.Vector3(...p.bridge),turn=new THREE.Vector3(...p.turnoff),span=bridge.distanceTo(turn);
   target=bridge.lerp(turn,.5);eye=target.clone().add(new THREE.Vector3(span*.65,span*.9,span*.55).multiplyScalar(Math.max(1,.8/camera.aspect)));
  }else{
   const v=root.userData.checkpoint7Model.views[view]||root.userData.checkpoint7Model.views.all;
   target=new THREE.Vector3(...v.target);eye=new THREE.Vector3(...v.eye);eye.sub(target).multiplyScalar(Math.max(1,.85/camera.aspect)).add(target);
   root.localToWorld(target);root.localToWorld(eye);
  }
  controls.target.copy(target);camera.position.copy(eye);controls.update();camera.updateMatrixWorld(true);return true;
 }
 function inspectSite250a(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-250a')?.g;if(!root)return false;
  const v=root.userData.site250aModel.views[view]||root.userData.site250aModel.views.all;
  root.updateWorldMatrix(true,false);const target=new THREE.Vector3(...v.target),eye=new THREE.Vector3(...v.eye);
  // Preserve the selected composition on a narrow screen.
  eye.sub(target).multiplyScalar(Math.max(1,.85/camera.aspect)).add(target);
  controls.target.copy(root.localToWorld(target));camera.position.copy(root.localToWorld(eye));controls.update();return true;
 }
 function inspectSite95(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-95')?.g;if(!root?.userData.site95Model)return false;
  const v=root.userData.site95Model.views[view]||root.userData.site95Model.views.all;
  const target=new THREE.Vector3(...v.target),eye=new THREE.Vector3(...v.eye);
  eye.sub(target).multiplyScalar(Math.max(1,.85/camera.aspect)).add(target);
  if(camera.aspect<1){
   const forward=target.clone().sub(eye).normalize(),right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
   const up=new THREE.Vector3().crossVectors(right,forward).multiplyScalar(-eye.distanceTo(target)*.16);
   target.add(up);eye.add(up);
  }
  root.updateWorldMatrix(true,false);controls.target.copy(root.localToWorld(target));camera.position.copy(root.localToWorld(eye));controls.update();return true;
 }
 function inspectSite113(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-113')?.g;if(!root?.userData.site113Model)return false;
  const v=root.userData.site113Model.views[view]||root.userData.site113Model.views.all;
  const target=new THREE.Vector3(...v.target),eye=new THREE.Vector3(...v.eye);
  eye.sub(target).multiplyScalar(Math.max(1,.85/camera.aspect)).add(target);
  root.updateWorldMatrix(true,false);controls.target.copy(root.localToWorld(target));camera.position.copy(root.localToWorld(eye));controls.update();return true;
 }
 function inspectSite254(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-254')?.g;if(!root)return false;
  const {target,eye}=root.userData.site254Model.views[view]||root.userData.site254Model.views.all;
  root.updateWorldMatrix(true,false);controls.target.copy(root.localToWorld(new THREE.Vector3(...target)));camera.position.copy(root.localToWorld(new THREE.Vector3(...eye)));controls.update();return true;
 }
 function inspectSite2(view,camera,controls){
  const root=objects.find(o=>o.record.id==='pad-2')?.g;if(!root)return false;
  const views=root.userData.site2Model.views,{target,eye}=views[view]||views.all;
  root.updateWorldMatrix(true,false);controls.target.copy(root.localToWorld(new THREE.Vector3(...target)));camera.position.copy(root.localToWorld(new THREE.Vector3(...eye)));controls.update();return true;
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
  globalThis.window?.__MUSEUM_STARTUP?.promote?.('site31-structure');
  const v=typeof innerWidth!=='undefined'&&innerWidth<=850&&view==='structure'?{target:[0,-4,0],eye:[-105,85,135]}:(SITE31_VIEWS[view]||SITE31_VIEWS.all);
  controls.target.copy(root.localToWorld(new THREE.Vector3(...v.target)));camera.position.copy(root.localToWorld(new THREE.Vector3(...v.eye)));controls.update();
  return true;
 }
 const site2=()=>objects.find(o=>o.record.id==='pad-2')?.g;
 return {inspectSite95,site95Stats:()=>objects.find(o=>o.record.id==='pad-95')?.g.userData.site95Model,inspectSite113,site113Stats:()=>objects.find(o=>o.record.id==='pad-113')?.g.userData.site113Model,inspectCheckpoint7,checkpoint7Stats:()=>objects.find(o=>o.record.id==='kpp-7')?.g.userData.checkpoint7Model,inspectSite250a,site250aStats:()=>objects.find(o=>o.record.id==='pad-250a')?.g.userData.site250aModel,site31Stats:()=>objects.find(o=>o.record.id==='pad-31')?.g.userData.site31Model,loadSite31:()=>site31Controller(objects.find(o=>o.record.id==='pad-31')?.g)?.load(),inspectSite254,site254Stats:()=>objects.find(o=>o.record.id==='pad-254')?.g.userData.site254Model,inspectSite2,site2Stats:()=>site2()?.userData.site2Model,loadSite2:()=>site2Controller(site2())?.load(),setSdiGateOpen:(open,now)=>sdiGates[0]?.setOpen(open,now),sdiGateStats:()=>sdiGates[0]?.stats(),focus,inspectCyclone,inspectProton,setProtonRocketVisible,protonStats,inspectHotel,inspectMzkSdi,inspectSite31,inspectSite110,inspectSite41,inspectSite45,inspectSilo:(view,camera,controls,siteId='pad-109')=>silos.find(s=>s.siteId===siteId)?.inspect(view,camera,controls),update:(now,camera,target)=>{protons.forEach(p=>p.update(now,camera));silos.forEach(s=>s.update(now,camera,target));sdiGates.forEach(g=>g.update(now));},silos:()=>silos.map(s=>s.stats()),stats:()=>({version:ARCHIVE_VERSION,count:records.length,models:records})};
}
