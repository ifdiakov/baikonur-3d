import * as THREE from 'three';
import {FACILITY_PORTS,portWorld} from './facility-ports.js';
import {RAIL_PROFILE} from './gagarin-rail-approach.js';
import {nearestRoadPoint} from './road-layout.js';
export function buildFacilityRailApproaches({data,point,siteRecords}){
 const replacements=new Map(),extras=[],reports=[];
 const get=id=>data.routes.rail.find(r=>r.id===id),curve=r=>new THREE.CatmullRomCurve3(r.points.map(p=>point(...p,.75+RAIL_PROFILE.headY)),false,'centripetal',.3);
 function connect(id,start,tangent,end,inward){const reach=Math.min(80,start.distanceTo(end)*.36),c=new THREE.CubicBezierCurve3(start,start.clone().addScaledVector(tangent,reach),end.clone().addScaledVector(inward,-Math.min(22,reach)),end);const spec={id,curve:c,datum:t=>c.getPoint(t).y-RAIL_PROFILE.headY};reports.push({id,end:end.toArray(),gauge:RAIL_PROFILE.gauge});return spec;}
 for(const [id,siteId] of [['t-250-feeder','pad-250'],['t-31-feeder','pad-31'],['t-zenit-feeder','pad-45']]){
  const site=siteRecords.find(s=>s.id===siteId),spec=FACILITY_PORTS[siteId],old=get(id);if(!site||!old)continue;
  const c=curve(old),trunk=curve(get(siteId==='pad-250'?'t-central-north':'t-center-east')),entry=nearestRoadPoint(trunk,c.getPoint(0)),end=portWorld(spec,spec.rail[0],site,point),inward=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),spec.yaw);
  const heading=trunk.getTangent(entry.t);if(heading.dot(end.clone().sub(entry.position))<0)heading.negate();const replacement=connect(id,entry.position,heading,end,inward);replacements.set(id,replacement);
  if(spec.rail[1]){const t=.64;extras.push(connect(id+'-second-track',replacement.curve.getPoint(t),replacement.curve.getTangent(t),portWorld(spec,spec.rail[1],site,point),inward));}
 }
 const site=siteRecords.find(s=>s.id==='pad-110'),spec=FACILITY_PORTS['pad-110'],trunk=curve(get('t-central-north'));
 spec.rail.forEach((local,i)=>{const end=portWorld(spec,local,site,point),near=nearestRoadPoint(trunk,end.clone().add(new THREE.Vector3(-20,0,35))),tangent=trunk.getTangent(near.t);if(tangent.dot(end.clone().sub(near.position))<0)tangent.negate();extras.push(connect('t-110-launch-'+i,near.position,tangent,end,new THREE.Vector3(i?.74:.4,0,i?-.67:-.92).normalize()));});
 return {replacements,extras,reports};
}
