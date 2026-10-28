import * as THREE from 'three';
import {ARCHIVE_MAP,ARCHIVE_VERSION} from './archive-manifest.js?v=20261028-museum4-osm-live-v1';
import * as buildings from './archive-buildings.js?v=20261028-museum4-osm-live-v1';
import * as launches from './archive-launches.js?v=20261028-museum4-osm-live-v1';
import {photoCity} from './archive-city.js?v=20261028-museum4-osm-live-v1';
import {buildSite31Pad} from './site31-pad.js?v=20261028-museum4-osm-live-v1';
export function buildArchiveModel(root,entry){
 const builders={'proton-halls':buildings.protonHalls,settlement:buildings.settlement95,mik42:buildings.mik42Facade,mzk:buildings.mzk112a,yubileiny:buildings.yubileiny,checkpoint:buildings.checkpoint7,observation:buildings.observationPoint,nedelin:buildings.nedelinRuins,buran:buildings.buranMuseum,cleanroom:buildings.cleanroom,energia:launches.energia110,soyuz:buildSite31Pad,zenit:launches.zenit45,city:photoCity};
 if(entry.kind==='proton')return launches.protonComplex(root,entry.id);
 if(!builders[entry.kind])throw Error('Unknown archive model '+entry.kind);
 return builders[entry.kind](root);
}
export function installArchiveModels({objects,clickable,voids}){
 const records=[];
 for(const spec of ARCHIVE_MAP){
  const i=objects.findIndex(o=>o.record.id===spec.id);if(i<0)throw Error('Missing archive site '+spec.id);
  const o=objects[i],root=o.g;root.clear();root.scale.setScalar(spec.scale);root.rotation.y=spec.yaw;root.position.y=-2.72;
  for(let n=clickable.length-1;n>=0;n--)if(clickable[n].userData.idx===i)clickable.splice(n,1);
  root.name=spec.title;
  const features=buildArchiveModel(root,spec);root.updateWorldMatrix(true,true);
  root.traverse(m=>{
   if(m.userData.archiveCutouts)for(const shape of m.userData.archiveCutouts)voids.add(m,shape);
   if(m.isMesh){m.userData.idx=i;clickable.push(m);}
  });
  const bounds=new THREE.Box3().setFromObject(root);
  const entry={...spec,version:ARCHIVE_VERSION,features,bounds:bounds.getSize(new THREE.Vector3()).toArray(),centre:bounds.getCenter(new THREE.Vector3()).toArray(),index:i};
  o.archive=entry;o.type='archive-'+spec.kind;root.userData.archiveModel=entry;records.push(entry);
 }
 function focus(index,camera,controls){const o=objects[index];if(!o?.archive)return false;
  if(o.record.id==='pad-31')return inspectSite31('duct',camera,controls);
  if(o.archive.kind==='mzk'){controls.target.copy(o.g.localToWorld(new THREE.Vector3(25,35,40)));camera.position.copy(o.g.localToWorld(new THREE.Vector3(255,215,300)));return true;}
  const b=new THREE.Box3().setFromObject(o.g),size=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3()),r=Math.max(size.x,size.z,size.y*2);
  controls.target.copy(c);camera.position.copy(c).add(new THREE.Vector3(.75,.92,1.0).multiplyScalar(r));return true;
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
 return {focus,inspectSite31,stats:()=>({version:ARCHIVE_VERSION,count:records.length,models:records})};
}
