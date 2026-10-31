import * as THREE from 'three';
import {RAIL_PROFILE} from './rail-profile.js?v=20261031-facilities-rails-lighting-v1';
import {MZK_SDI_RAIL_PORTS,MZK_SDI_RAIL_STUBS,MZK_SDI_RAIL_FRAMES,SITE110_RAIL_DESTINATIONS} from './mik112-destination-ports.js?v=20261031-facilities-rails-lighting-v1';

const V=(...p)=>new THREE.Vector3(...p);
const world=(root,p)=>root.localToWorld(V(...p));
const axis=(root,p)=>V(...p).transformDirection(root.matrixWorld);

/** QA framing only. All anchors use the installed model transforms or the
 * rendered connection report; this never moves a building or a railway. */
export function facilityAccessInspection({target,view='oblique',mik112Root,mzkSdiRoot,site110Root,mik112Rail,railPorts=[]}={}){
 if(!['top','oblique'].includes(view))return null;
 const anchors=[],fitPoints=[];
 const add=(id,p)=>{const q=p.clone?p.clone():V(...p);anchors.push({id,position:q.toArray()});fitPoints.push(q);};
 let outward=V(0,0,1);
 if(target==='mik112-gates'){
  const root=mik112Root,model=root?.userData.mik112Model;if(!model?.railGates?.length)return null;root.updateWorldMatrix(true,false);
  outward=axis(root,[0,0,-1]);
  for(const gate of model.railGates){
   add(gate.id,world(root,gate.center));
   for(const side of [-1,1])for(const end of [-1,1])fitPoints.push(world(root,[gate.center[0]+side*gate.clearWidth/2,gate.center[1]+end*gate.clearHeight/2,gate.center[2]]));
  }
  model.railHeadEntries.forEach((entry,i)=>add('mik112-track-'+i,world(root,entry)));
  for(const [i,pose] of (model.tua?.placements||[]).entries())add('tua-'+i,world(root,pose.position));
 }else if(target==='mik112-fanout'){
  if(!mik112Rail?.connected)return null;
  for(const track of mik112Rail.tracks||[]){add('mik112-track-'+track.trackIndex,track.start);add('switch-'+track.sourceNodeId,track.end);}
  for(const port of railPorts.filter(port=>port.sourceRouteId)){add(port.portId+'-model',port.headCenter);add(port.portId+'-source',port.sourcePoint);for(const p of port.points||[])fitPoints.push(V(...p));}
 }else if(target==='mzk'||target==='sdi'){
  const root=mzkSdiRoot;if(!root)return null;root.updateWorldMatrix(true,false);
  const ports=MZK_SDI_RAIL_PORTS.filter(port=>port.destination===target),frame=MZK_SDI_RAIL_FRAMES[target];
  outward=axis(root,ports[0].outward);
  for(const port of ports){
   add(port.id,world(root,port.position));
   const stub=MZK_SDI_RAIL_STUBS.find(row=>row.id===port.id),[x,z]=stub.points[0];
   const inner=[frame.center[0]+x*Math.cos(frame.yaw)+z*Math.sin(frame.yaw),stub.headY,frame.center[1]-x*Math.sin(frame.yaw)+z*Math.cos(frame.yaw)];
   add(port.id+'-door',world(root,inner));
   fitPoints.push(world(root,[inner[0],inner[1]+36,inner[2]]));
  }
  if(view==='top')for(const port of railPorts.filter(port=>ports.some(row=>row.id===port.sourceRouteId))){add(port.portId+'-source',port.sourcePoint);for(const p of port.points||[])fitPoints.push(V(...p));}
 }else if(target==='site110-left'||target==='site110-right'){
  const root=site110Root;if(!root)return null;root.updateWorldMatrix(true,false);outward=axis(root,[0,0,1]);
  const ports=SITE110_RAIL_DESTINATIONS.filter(port=>port.id.startsWith(target+'-'));
  for(const port of ports){add(port.id,world(root,port.position));add(port.id+'-inside',world(root,[port.position[0],port.position[1],port.position[2]-45]));}
  for(const port of railPorts.filter(port=>ports.some(row=>row.id===port.sourceRouteId))){add(port.portId+'-source',port.sourcePoint);for(const p of port.points||[])fitPoints.push(V(...p));}
 }else return null;
 if(!anchors.length)return null;
 const bounds=new THREE.Box3().setFromPoints(fitPoints),center=bounds.getCenter(V()),back=view==='top'?V(0,1,1e-6):outward.setY(1).normalize();
 const right=V(0,1,0).cross(back).normalize(),up=back.clone().cross(right).normalize();
 // Keep evidence in the unobstructed centre of the 1600×1000 QA canvas.
 // The application uses a 52-degree vertical field of view and a left menu.
 const tangent=Math.tan(52*Math.PI/360);let distance=10;
 for(const p of fitPoints){const delta=p.clone().sub(center),depth=delta.dot(back);
  distance=Math.max(distance,depth+Math.abs(delta.dot(right))/(tangent*1.6*.53),depth+Math.abs(delta.dot(up))/(tangent*.55));
 }
 const eye=center.clone().addScaledVector(back,distance+1);
 return {target,view,center:center.toArray(),eye:eye.toArray(),range:distance+1,anchors,gauge:RAIL_PROFILE.gauge};
}
