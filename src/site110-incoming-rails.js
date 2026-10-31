import * as THREE from 'three';
import {createPairedRailApproach} from './paired-rail-approach.js?v=20261031-facilities-rails-lighting-v4';

const V=(x,z)=>new THREE.Vector3(x,0,z);
function simplifyStraight(points){
 const result=[];
 for(const p of points){
  while(result.length>1){
   const a=result.at(-2),b=result.at(-1),ab=b.clone().sub(a),bc=p.clone().sub(b);
   if(ab.dot(bc)<=0||Math.abs(ab.x*bc.z-ab.z*bc.x)>1e-8*ab.length()*bc.length())break;
   result.pop();
  }
  result.push(p.clone());
 }
 return result;
}

/** Model-local C1 connections from the fixed external four-track ports to
 * the two rotated launch-pad running-rail pairs. The short straight end
 * sections give the real rail faces the same exact frames on both seams. */
export function createSite110IncomingRails({pads,ports,yaw}){
 const inward=V(-Math.sin(yaw),-Math.cos(yaw)),endLead=2,tracks=[];
 for(let pair=0;pair<2;pair++){
  const pad=pads[pair],ends=[-1,1].map(side=>V(pad.centre[0]+Math.cos(yaw)*side*10+Math.sin(yaw)*260,pad.centre[1]-Math.sin(yaw)*side*10+Math.cos(yaw)*260));
  const rows=ends.map((end,side)=>({id:pad.id+'-'+(side?'east':'west'),start:V(ports[pair*2+side][0],ports[pair*2+side][2]),startTangent:V(0,-1),end:end.clone().addScaledVector(inward,-endLead),endTangent:inward}));
  const plan=createPairedRailApproach(rows,{ballastWidth:3.2,innerRadius:80,sampleStep:2});
  for(let side=0;side<2;side++){
   const track=plan.tracks[side],points=simplifyStraight([...track.points,ends[side]]);
   tracks.push({id:track.id,portIndex:pair*2+side,padId:pad.id,points:points.map(p=>[p.x,p.z]),
    port:[...ports[pair*2+side]],runningRailEntry:[ends[side].x,ports[pair*2+side][1],ends[side].z],
    portInward:[0,0,-1],runningRailInward:inward.toArray(),sharedPairSpacing:20,nominalInnerRadius:80});
  }
 }
 return {version:'site110-c1-model-rails-v1',tracks};
}
