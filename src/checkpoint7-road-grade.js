import * as THREE from 'three';
import {checkpointRoadProjection} from './checkpoint7-layout.js?v=20261103-checkpoint7-flat-v2';
import {TRANSPORT_GROUND_Y,ROAD_SURFACE_CLEARANCE,ROAD_SURFACE_Y} from './transport-ground-profile.js?v=20261114-ground-contact-v1';

export const CHECKPOINT7_GRADE_VERSION='checkpoint7-flat-ground-v2';
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};

// Keep the city–cosmodrome centreline. Only its elevation around the checkpoint
// changes: asphalt rests on the existing flat ground, with eased end joins.
export function createCheckpoint7RoadGrade(placement){
 const baseY=TRANSPORT_GROUND_Y,roadLift=ROAD_SURFACE_CLEARANCE,axis=placement.roadAxis.map(p=>new THREE.Vector3(...p));
 const length=axis.slice(1).reduce((n,p,i)=>n+p.distanceTo(axis[i]),0),first=18,last=length-18;
 const shoulder=placement.roadWidth/2+.7,reach=shoulder+16;
 const bounds={minX:Math.min(...axis.map(p=>p.x))-reach,maxX:Math.max(...axis.map(p=>p.x))+reach,minZ:Math.min(...axis.map(p=>p.z))-reach,maxZ:Math.max(...axis.map(p=>p.z))+reach};
 const nearBounds=(x,z)=>x>=bounds.minX&&x<=bounds.maxX&&z>=bounds.minZ&&z<=bounds.maxZ;
 function weightAt(x,z){
  if(!nearBounds(x,z))return 0;
  const at=checkpointRoadProjection(axis,new THREE.Vector3(x,0,z));
  if(at.along<first||at.along>last||at.distance>reach)return 0;
  return smooth(Math.min(at.along-first,last-at.along)/14)*(1-smooth((at.distance-shoulder)/16));
 }
 function roadAt(x,z){
  // The surrounding source roads now share this ground datum. The raw OSM
  // placement height must not reintroduce the former raised approach ramps.
  return weightAt(x,z)>0?ROAD_SURFACE_Y:null;
 }
 function conform(points){
  const result=[];
  for(let i=0;i<points.length;i++){
   if(i){const a=points[i-1],b=points[i],mid=a.clone().lerp(b,.5);
    const n=nearBounds(mid.x,mid.z)||nearBounds(a.x,a.z)||nearBounds(b.x,b.z)?Math.ceil(a.distanceTo(b)/.3):1;
    for(let j=1;j<n;j++)result.push(a.clone().lerp(b,j/n));
   }result.push(points[i].clone());
  }
  for(const p of result){const y=roadAt(p.x,p.z);if(y!==null)p.y=y;}
  return result;
 }
 // The museum road is wider than its geographic source. At the old raised
 // road level it concealed the parallel railway. Give the displayed track
 // a continuous west-side clearance, and use that same path for the train.
 // Source coordinates and railway connectivity are left intact.
 const east=new THREE.Vector3(Math.cos(placement.yaw),0,-Math.sin(placement.yaw));
 const railWest=-placement.roadWidth/2-9*placement.scale-1;
 function conformRails(points){
  const result=[];
  for(let i=0;i<points.length;i++){
   if(i){const a=points[i-1],b=points[i],mid=a.clone().lerp(b,.5);
    const n=nearBounds(mid.x,mid.z)||nearBounds(a.x,a.z)||nearBounds(b.x,b.z)?Math.ceil(a.distanceTo(b)/.3):1;
    for(let j=1;j<n;j++)result.push(a.clone().lerp(b,j/n));
   }result.push(points[i].clone());
  }
  for(const p of result){
   if(!nearBounds(p.x,p.z))continue;const at=checkpointRoadProjection(axis,p),side=p.clone().sub(at.point).dot(east);
   if(side>=0||side<railWest||at.along<first||at.along>last)continue;
   const blend=smooth(Math.min(at.along-first,last-at.along)/14);p.addScaledVector(east,(railWest-side)*blend);
  }
  return result;
 }
 return {baseY,roadLift,bounds,first,last,axis,roadAt,weightAt,conform,conformRails,
  stats:()=>({version:CHECKPOINT7_GRADE_VERSION,baseY,roadLift,roadRange:[first,last],flatGround:true,addedTerrainMeshes:0,railClearance:{westOffset:railWest,sourceGraphUnchanged:true,trainUsesSamePath:true}})};
}
