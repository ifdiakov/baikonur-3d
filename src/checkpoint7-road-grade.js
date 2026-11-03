import * as THREE from 'three';
import {checkpointRoadProjection} from './checkpoint7-layout.js?v=20261103-checkpoint7-flat-v2';

export const CHECKPOINT7_GRADE_VERSION='checkpoint7-flat-ground-v2';
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};

// Keep the city–cosmodrome centreline. Only its elevation around the checkpoint
// changes: asphalt rests on the existing flat ground, with eased end joins.
export function createCheckpoint7RoadGrade(placement){
 const baseY=-2.755,roadLift=.025,axis=placement.roadAxis.map(p=>new THREE.Vector3(...p));
 const length=axis.slice(1).reduce((n,p,i)=>n+p.distanceTo(axis[i]),0),first=18,last=length-18;
 const reach=placement.roadWidth/2+.7;
 const bounds={minX:Math.min(...axis.map(p=>p.x))-reach,maxX:Math.max(...axis.map(p=>p.x))+reach,minZ:Math.min(...axis.map(p=>p.z))-reach,maxZ:Math.max(...axis.map(p=>p.z))+reach};
 const nearBounds=(x,z)=>x>=bounds.minX&&x<=bounds.maxX&&z>=bounds.minZ&&z<=bounds.maxZ;
 function roadAt(x,z){
  if(!nearBounds(x,z))return null;
  const at=checkpointRoadProjection(axis,new THREE.Vector3(x,0,z));
  if(at.along<first||at.along>last||at.distance>reach)return null;
  const blend=smooth(Math.min(at.along-first,last-at.along)/14);
  return THREE.MathUtils.lerp(placement.position[1],baseY+roadLift,blend);
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
 return {baseY,roadLift,bounds,first,last,axis,roadAt,conform,
  stats:()=>({version:CHECKPOINT7_GRADE_VERSION,baseY,roadLift,roadRange:[first,last],flatGround:true,addedTerrainMeshes:0})};
}
