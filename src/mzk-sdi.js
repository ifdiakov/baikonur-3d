import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261031-rocket-exhibits-v1';
import {buildMzkHall} from './mzk-hall.js?v=20261030-mzk-sdi-v1';
import {buildSdiStand} from './mzk-sdi-stand.js?v=20261030-mzk-sdi-v1';

export const MZK_SDI_REFERENCE=Object.freeze({
 version:'mzk-sdi-photo-v3',scale:.14,yaw:-Math.PI/4,
 folder:'1a4VpXEGG-mpSwTvBy-Nb0GBIY4KUKR09',photoSetDate:'2026-10-30',photoCount:14,
 roadPort:[160,.15,130],
 // Centres and long-edge axes of the two original OSM polygons, transformed
 // into the unchanged exhibit root. Buildings retain museum display scale.
 mzk:{center:[34.07968287,-113.15655949],yaw:.15541375,width:140.6,depth:71.4,height:62},
 sdi:{center:[-34.07968287,113.15655949],yaw:.00466302,width:52,depth:46,height:118},
 sources:['way/172704643','way/172704656']
});

const transformed=(spec,p)=>new THREE.Vector3(...p)
 .applyAxisAngle(new THREE.Vector3(0,1,0),spec.yaw)
 .add(new THREE.Vector3(spec.center[0],0,spec.center[1])).toArray();

export function buildMzkSdi(root){
 const k=archiveKit(root),ref=MZK_SDI_REFERENCE;
 const m=ref.mzk,s=ref.sdi;
 const {frame,...mzk}=buildMzkHall(k,{...m,x:m.center[0],z:m.center[1]});
 const sdi=buildSdiStand(k,{...s,x:s.center[0],z:s.center[1]});
 const mzkDoor=transformed(m,[-m.width*.265,0,m.depth/2+10.5]);
 const sdiOfficeDoor=transformed(s,[36.5,0,7.2]);
 const roads=[
  [[160,130],[120,130],[120,-45],[mzkDoor[0],-45],[mzkDoor[0],mzkDoor[2]]],
  [[120,130],[80,130],[80,154],[sdiOfficeDoor[0],154],[sdiOfficeDoor[0],sdiOfficeDoor[2]]]
 ];
 for(const path of roads)k.path(path,6,.15,'asphalt','mzk-sdi-internal-access');
 // The visible SDI approach and its track stubs end inside this exhibit.
 const apron=[[-30,24],[30,24],[30,63],[-30,63]].map(([x,z])=>{
  const p=transformed(s,[x,0,z]);return [p[0],p[2]];
 });
 k.poly(apron,.10,'concrete','sdi-gate-apron');
 const railPoints=[[0,24],[0,66]].map(([x,z])=>{
  const p=transformed(s,[x,0,z]);return [p[0],p[2]];
 });
 k.rail(railPoints,{gauge:4,bed:false,y:.27,tag:'sdi-gate-approach-rail'});

 const views={
  all:{target:[0,38,0],eye:[260,340,390]},
  mzk:{target:transformed(m,[0,29,0]),eye:transformed(m,[-128,155,190])},
  sdi:{target:transformed(s,[7,57,0]),eye:transformed(s,[115,174,165])},
  'sdi-side':{target:transformed(s,[0,58,-5]),eye:transformed(s,[-135,169,-150])}
 };
 const metadata={version:ref.version,photoSetDate:ref.photoSetDate,photoCount:ref.photoCount,
  folder:ref.folder,layoutBasis:'OSM-component-centres-and-axes',sources:ref.sources,
  scale:ref.scale,yaw:ref.yaw,mzk,sdi,roadPort:ref.roadPort,roads,views,
  displayNote:'Buildings are enlarged for museum legibility; facade subdivisions and SDI height are approximate.'};
 root.userData.mzkSdi=metadata;
 return {...k.finish(),mzkSdi:metadata};
}
