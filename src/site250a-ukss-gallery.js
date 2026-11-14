import * as THREE from 'three';
import {SITE250A_GALLERY_PIXELS,site250aPixel} from './site250a-layout.js?v=20261114-ukss-gallery-v1';

// Continued concrete service gallery from the photographed 250A corridor to the
// UKSS source complex. Geometry is in world space: these two exhibit groups
// have different local rotations, origins and the same metric scene scale.
export const SITE250A_UKSS_GALLERY_VERSION='250a-ukss-road-aligned-v2';
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

export function buildSite250aUkssGallery({site250a,ukss,scene,roadPath,groundY=WORLD_GROUND_Y}={}){
 if(!site250a?.isObject3D||!ukss?.isObject3D||!scene?.isObject3D)throw Error('250A, loaded UKSS and world scene are required');
 site250a.updateWorldMatrix(true,false);ukss.updateWorldMatrix(true,false);
 const last=site250aPixel(SITE250A_GALLERY_PIXELS.at(-1)),previous=site250aPixel(SITE250A_GALLERY_PIXELS.at(-2));
 const origin=site250a.localToWorld(V(last[0],5.1,last[1]));
 const from=site250a.localToWorld(V(previous[0],5.1,previous[1]));
 // Follow the actual rendered 250A → UKSS road instead of inventing a
 // diagonal Catmull-Rom shortcut. The gallery runs PARALLEL to the road, at
 // the same side clearance as its existing 250A end section.
 const docking=ukss.localToWorld(V(...UKSS_GALLERY_DOCK_LOCAL));
 const source=roadPath?.points;
 if(!Array.isArray(source)||source.length<8)throw Error('The published 250A → UKSS road path is required for its gallery');
 const road=source.map(p=>p.isVector3?p.clone():V(...p));
 const dist2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 if(dist2(road[0],docking)<dist2(road.at(-1),docking))road.reverse();
 const stations=[0];for(let i=1;i<road.length;i++)stations.push(stations.at(-1)+dist2(road[i-1],road[i]));
 function closest(p){
  let best={distance:Infinity,at:0,point:road[0],tangent:V(0,0,1)};
  for(let i=1;i<road.length;i++){
   const a=road[i-1],b=road[i],dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;
   if(den<1e-8)continue;
   const t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/den,0,1);
   const q=V(a.x+dx*t,0,a.z+dz*t),d=dist2(p,q);
   if(d<best.distance)best={distance:d,at:stations[i-1]+Math.sqrt(den)*t,point:q,tangent:V(dx,0,dz).normalize()};
  }
  return best;
 }
 const start=closest(origin),finish=closest(docking);
 if(finish.at<=start.at+15)throw Error('250A gallery must run forward along the published road toward UKSS');
 if(start.distance>55||finish.distance>55)throw Error('250A gallery is too far from the published road to align safely');
 const side=Math.sign(start.tangent.x*(origin.z-start.point.z)-start.tangent.z*(origin.x-start.point.x))||1;
 const offset=Math.max(0.2,start.distance);
 function along(at){
  let i=1;while(i<stations.length-1&&stations[i]<at)i++;
  const den=stations[i]-stations[i-1]||1,t=THREE.MathUtils.clamp((at-stations[i-1])/den,0,1);
  const p=road[i-1].clone().lerp(road[i],t),dir=road[i].clone().sub(road[i-1]).setY(0).normalize();
  const normal=V(-dir.z,0,dir.x).multiplyScalar(side*offset);
  return p.add(normal);
 }
 const steps=Math.max(25,Math.ceil((finish.at-start.at)/.65)),points=[origin.clone()];
 for(let i=1;i<steps;i++){
  const t=i/steps,at=start.at+(finish.at-start.at)*t,p=along(at);
  p.y=THREE.MathUtils.lerp(origin.y,docking.y,t);
  points.push(p);
 }
 // The last short join meets the imported start-complex geometry exactly.
 points.push(docking.clone());
 let length=0;for(let i=1;i<points.length;i++)length+=points[i].distanceTo(points[i-1]);
 const segments=points.length-1;
 // Preserve the original gallery's 2.8 x 2.2 m white concrete cross-section
 // and its ten-metre pier spacing. No extra road or rail is created.
 const group=new THREE.Group();group.name='250А — УКСС · бетонная эстакада';
 group.userData.museumComponent='site250a-ukss-gallery';scene.add(group);
 const corridor=[],piers=[],edgeLeft=[],edgeRight=[];
 for(let i=1;i<points.length;i++)corridor.push({a:points[i-1],b:points[i],width:WIDTH,height:HEIGHT});
 const pierCount=Math.max(1,Math.floor(length/1.4));
 for(let i=1;i<pierCount;i++){
  const t=i/pierCount,index=t*(points.length-1),lo=Math.floor(index),p=points[lo].clone().lerp(points[Math.min(points.length-1,lo+1)],index-lo),below=p.y-HEIGHT/2,foot=Math.min(groundY,below-.05);
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
  roadId:roadPath.id,roadAligned:true,roadOffset:offset,sourceGalleryContinuity:true,connectsTo:'pad-250',from:'pad-250a'};
 group.userData.gallery=metadata;return {group,metadata};
}
