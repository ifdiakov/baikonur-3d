import * as THREE from 'three';
import {SITE250A_GALLERY_PIXELS,site250aPixel} from './site250a-layout.js?v=20261114-ukss-gallery-v1';

// Continued concrete service gallery from the photographed 250A corridor to the
// UKSS source complex. Geometry is in world space: these two exhibit groups
// have different local rotations, origins and the same metric scene scale.
export const SITE250A_UKSS_GALLERY_VERSION='250a-ukss-concrete-gallery-v1';
export const UKSS_GALLERY_DOCK_LOCAL=Object.freeze([-275,5.1,110]);
const WORLD_GROUND_Y=-2.755;
const WIDTH=2.8*.14,HEIGHT=2.2*.14,PIER_WIDTH=1*.14;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);

function sectionBatch(parent,items,color,name) {
 const material=new THREE.MeshStandardMaterial({color,roughness:.93,metalness:0});
 const geometry=new THREE.BoxGeometry(1,1,1);
 const batch=new THREE.InstancedMesh(geometry,material,items.length);
 batch.name=name;batch.userData.museumComponent='site250a-ukss-gallery';
 batch.castShadow=true;batch.receiveShadow=true;
 const matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(),up=V(0,1,0),axis=V(0,0,1);
 items.forEach(({a,b,width,height},i)=>{
  const delta=b.clone().sub(a),length=delta.length();
  const yaw=Math.atan2(delta.x,delta.z);
  quat.setFromAxisAngle(up,yaw);
  // Local Z is the axis of the rectangular enclosed concrete corridor.
  scale.set(width,height,length+.015);
  const mid=a.clone().add(b).multiplyScalar(.5);
  matrix.compose(mid,quat,scale);batch.setMatrixAt(i,matrix);
 });
 batch.instanceMatrix.needsUpdate=true;
 batch.computeBoundingBox();batch.computeBoundingSphere();parent.add(batch);return batch;
}

export function buildSite250aUkssGallery({site250a,ukss,scene,groundY=WORLD_GROUND_Y}={}){
 if(!site250a?.isObject3D||!ukss?.isObject3D||!scene?.isObject3D)throw Error('250A, loaded UKSS and world scene are required');
 site250a.updateWorldMatrix(true,false);ukss.updateWorldMatrix(true,false);
 const last=site250aPixel(SITE250A_GALLERY_PIXELS.at(-1)),previous=site250aPixel(SITE250A_GALLERY_PIXELS.at(-2));
 const origin=site250a.localToWorld(V(last[0],5.1,last[1]));
 const from=site250a.localToWorld(V(previous[0],5.1,previous[1]));
 const departure=origin.clone().sub(from).setY(0).normalize();
 // The end deliberately enters the UKSS's imported structural envelope rather
 // than terminating at the neighbouring asphalt gate or the pad centroid.
 const docking=ukss.localToWorld(V(...UKSS_GALLERY_DOCK_LOCAL));
 const horizontalDistance=Math.hypot(docking.x-origin.x,docking.z-origin.z);
 if(horizontalDistance<12||horizontalDistance>130)throw Error('250A–UKSS gallery anchors have changed: '+horizontalDistance);
 const outbound=origin.clone().addScaledVector(departure,Math.min(5,horizontalDistance*.22));
 const approach=docking.clone().sub(origin).setY(0).normalize();
 const bend=origin.clone().lerp(docking,.56).addScaledVector(departure,Math.min(4,horizontalDistance*.10));
 bend.addScaledVector(approach,Math.min(2,horizontalDistance*.06));
 const curve=new THREE.CatmullRomCurve3([origin,outbound,bend,docking],false,'centripetal');
 const length=curve.getLength(),segments=Math.max(20,Math.ceil(length/.7)),points=curve.getPoints(segments);
 // Preserve the original gallery's 2.8 x 2.2 m white concrete cross-section
 // and its ten-metre pier spacing. No extra road or rail is created.
 const group=new THREE.Group();group.name='250А — УКСС · бетонная эстакада';
 group.userData.museumComponent='site250a-ukss-gallery';scene.add(group);
 const corridor=[],piers=[],edgeLeft=[],edgeRight=[];
 for(let i=1;i<points.length;i++)corridor.push({a:points[i-1],b:points[i],width:WIDTH,height:HEIGHT});
 const pierCount=Math.max(1,Math.floor(length/1.4));
 for(let i=1;i<pierCount;i++){
  const t=i/pierCount,p=curve.getPointAt(t),below=p.y-HEIGHT/2,foot=Math.min(groundY,below-.05);
  if(below-foot<.10)continue;
  piers.push({a:V(p.x,foot,p.z),b:V(p.x,below,p.z),width:PIER_WIDTH,height:PIER_WIDTH});
 }
 sectionBatch(group,corridor,0xdddcd1,'250А — УКСС · закрытая бетонная галерея');
 // Use an independent rectilinear support box for each pier, preserving the
 // rectangular silhouette of the existing gallery at Site 250A.
 const pierMaterial=new THREE.MeshStandardMaterial({color:0xb6b7a8,roughness:1});
 const pierMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),pierMaterial,piers.length);
 pierMesh.name='250А — УКСС · бетонные опоры';pierMesh.userData.museumComponent='site250a-ukss-gallery';
 const matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
 piers.forEach((p,i)=>{const height=p.b.y-p.a.y;scale.set(PIER_WIDTH,height,PIER_WIDTH);
  matrix.compose(V(p.a.x,p.a.y+height/2,p.a.z),quat,scale);pierMesh.setMatrixAt(i,matrix);});
 pierMesh.instanceMatrix.needsUpdate=true;pierMesh.computeBoundingBox();pierMesh.computeBoundingSphere();pierMesh.castShadow=true;pierMesh.receiveShadow=true;
 group.add(pierMesh);
 const metadata={version:SITE250A_UKSS_GALLERY_VERSION,start:origin.toArray(),end:docking.toArray(),
  ukssDockLocal:[...UKSS_GALLERY_DOCK_LOCAL],length,segments,pierCount:piers.length,width:WIDTH,height:HEIGHT,
  sourceGalleryContinuity:true,connectsTo:'pad-250',from:'pad-250a'};
 group.userData.gallery=metadata;return {group,metadata};
}
