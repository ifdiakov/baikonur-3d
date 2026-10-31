import * as THREE from 'three';
import {nearestRoadPoint} from './road-layout.js?v=20261031-facilities-rails-lighting-v1';
import {GAGARIN_RAIL_PORT} from './gagarin-metric-profile.js?v=20261031-facilities-rails-lighting-v1';
import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';
import {RAIL_PROFILE} from './rail-profile.js?v=20261031-facilities-rails-lighting-v1';
export {GAGARIN_RAIL_PORT} from './gagarin-metric-profile.js?v=20261031-facilities-rails-lighting-v1';
export {RAIL_PROFILE} from './rail-profile.js?v=20261031-facilities-rails-lighting-v1';

export function buildGagarinRailApproach({data,point,siteRecords}){
  const pad=siteRecords.find(s=>s.id==='pad-1');
  const main=data.routes.rail.find(r=>r.id==='t-central-north');
  if(!pad||!main)throw Error('Gagarin track connection needs Pad 1 and its western feeder');
  const trunk=new THREE.CatmullRomCurve3(main.points.map(([x,y])=>point(x,y,.75)),false,'centripetal',.3);
  const center=point(pad.x,pad.y,0);
  // Pad 1 rotates -90°: its +Z western approach is world -X.
  const end=center.clone().add(new THREE.Vector3(-GAGARIN_RAIL_PORT[2]*MUSEUM_METRE,0,0));
  const target=end.clone().add(new THREE.Vector3(-260,.75,-25));
  const entry=nearestRoadPoint(trunk,target),start=entry.position;
  const tangent=trunk.getTangent(entry.t).normalize();
  const length=Math.hypot(end.x-start.x,end.z-start.z);
  const control=start.clone().addScaledVector(tangent,Math.min(85,length*.28));control.y=.75;
  const straight=end.clone().add(new THREE.Vector3(-18,0,0));
  const approach=new THREE.CurvePath();
  approach.add(new THREE.CubicBezierCurve3(start,control,end.clone().add(new THREE.Vector3(-Math.min(95,length*.3),0,0)),straight));
  approach.add(new THREE.LineCurve3(straight,end));
  const grade=t=>{const v=THREE.MathUtils.clamp((t-.25)/.75,0,1);return .75*(1-v*v*(3-2*v))-2.755*(v*v*(3-2*v));};
  return {id:'t-r7-feeder',curve:approach,datum:grade,
    stats:()=>({version:'pad1-matched-track-v2-below-grade',gauge:RAIL_PROFILE.gauge,
      entryLocalZ:GAGARIN_RAIL_PORT[2],entryWorld:end.toArray(),joinGap:0,straightLength:18,
      source:'RocketTrip screenshot 2026-10-28 07:24:40 and existing Gagarin model rail geometry'})};
}
