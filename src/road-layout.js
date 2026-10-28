import * as THREE from 'three';
import {FACILITY_PORTS,portWorld} from './facility-ports.js';

export const KAZ_GATE = Object.freeze({x:-67,z:53,scaleX:.29,scaleZ:.48});

export function nearestRoadPoint(curve,point) {
  let best=0,distance=Infinity;
  for(let i=0;i<=500;i++){
    const d=curve.getPoint(i/500).distanceToSquared(point);
    if(d<distance){distance=d;best=i/500;}
  }
  let lo=Math.max(0,best-.002),hi=Math.min(1,best+.002);
  for(let i=0;i<28;i++){
    const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;
    if(curve.getPoint(a).distanceToSquared(point)<curve.getPoint(b).distanceToSquared(point))hi=b;
    else lo=a;
  }
  const t=(lo+hi)/2,position=curve.getPoint(t);
  return {t,position,distance:position.distanceTo(point)};
}

// Attach branch ends to the actual curved road surface, not the nearest
// control point of the plan. The source map coordinates remain unchanged.
export function connectedRoadData(data,point,siteRecords) {
  const roads=data.routes.road.map(r=>({...r,points:r.points.map(p=>[...p])}));
  const origin=point(0,0,0),unitX=point(1,0,0).x-origin.x,unitZ=point(0,1,0).z-origin.z;
  const map=p=>[(p.x-origin.x)/unitX,(p.z-origin.z)/unitZ];
  const main=roads.filter(r=>r.class==='arterial').map(r=>({id:r.id,
    curve:new THREE.CatmullRomCurve3(r.points.map(([x,y])=>point(x,y,.72)),false,'centripetal',.3)}));
  const junctions=[];
  for(const road of roads){
    for(const end of [0,road.points.length-1]){
      // Site endpoints stay at their gates; only the trunk end is snapped.
      if(road.id.startsWith('r-site')&&end!==0)continue;
      const p=point(...road.points[end],.72);
      let best;
      for(const trunk of main){
        if(trunk.id===road.id)continue;
        const near=nearestRoadPoint(trunk.curve,p);
        if(near.distance<36&&(!best||near.distance<best.distance))best={...near,roadId:trunk.id};
      }
      if(best){road.points[end]=map(best.position);junctions.push({roadId:best.roadId,x:best.position.x,z:best.position.z});}
    }
  }
  const ports={};
  for(const [id,spec] of Object.entries(FACILITY_PORTS)){const site=siteRecords.find(s=>s.id===id);if(!site)continue;const gate=portWorld(spec,spec.road,site,point);ports[id]={position:gate.toArray(),outward:new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),spec.yaw).toArray()};}
  for(const [routeId,siteId] of [['r-complex-110','pad-110'],['r-jubilee','pad-251'],['r-31-service','pad-31'],['r-zenit-service','pad-45']]){const route=roads.find(r=>r.id===routeId),port=ports[siteId];if(!route||!port)continue;const gate=new THREE.Vector3(...port.position),out=new THREE.Vector3(...port.outward);route.points.splice(-1,1,map(gate.clone().addScaledVector(out,12)),map(gate));route.gateWorld=gate.toArray();route.gateHeight=gate.y;}
  const kaz=siteRecords.find(s=>s.id==='pad-3'),access=roads.find(r=>r.id==='r-site3-kaz-access');
  if(kaz&&access){
    const center=point(kaz.x,kaz.y,0);
    const gate=center.clone().add(new THREE.Vector3(KAZ_GATE.x*KAZ_GATE.scaleX,0,KAZ_GATE.z*KAZ_GATE.scaleZ));
    // A straight final approach enters the west apron along its local X axis.
    access.points=[access.points[0],map(gate.clone().add(new THREE.Vector3(-14,0,0))),map(gate)];
    access.gateWorld=gate.toArray();
  }
  return {...data,facilityPorts:ports,routes:{...data.routes,road:roads,
    rail:data.routes.rail.map(r=>({...r,points:r.points.map(p=>[...p])}))},junctions};
}
