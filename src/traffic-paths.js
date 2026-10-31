import * as THREE from 'three';
import {RAIL_PROFILE} from './gagarin-rail-approach.js?v=20261031-facilities-rails-lighting-v1';
import {nearestRoadPoint} from './road-layout.js?v=20261031-facilities-rails-lighting-v1';

export function distancePath(points){
 const clean=points.filter((p,i)=>!i||p.distanceTo(points[i-1])>1e-8).map(p=>p.clone());
 const distances=new Float64Array(clean.length);for(let i=1;i<clean.length;i++)distances[i]=distances[i-1]+clean[i].distanceTo(clean[i-1]);
 const length=distances.at(-1);
 function position(distance){const s=THREE.MathUtils.clamp(distance,0,length);let lo=0,hi=clean.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(distances[mid]>s)hi=mid;else lo=mid;}
  return clean[lo].clone().lerp(clean[hi],(s-distances[lo])/(distances[hi]-distances[lo]||1));
 }
 return {points:clean,length,position,sample(distance,look=1){const p=position(distance),a=position(distance-look),b=position(distance+look);return {position:p,tangent:b.sub(a).normalize()};}};
}

function arcFraction(curve,t){const lengths=curve.getLengths(4096),p=t*4096,i=Math.min(4095,Math.floor(p));return THREE.MathUtils.lerp(lengths[i],lengths[i+1],p-i)/lengths.at(-1);}

export function buildTrainRoutePlan({data,point,gagarinRail}){
 const make=id=>{const r=data.routes.rail.find(r=>r.id===id);if(!r)throw Error('Missing train route '+id);const c=new THREE.CatmullRomCurve3(r.points.map(([x,y])=>point(x,y,.75)),false,'centripetal',.3);c.arcLengthDivisions=4096;return c;};
 const branch=make('t-central-north'),main=make('t-west-center'),city=make('t-center-south');
 const startOnBranch=nearestRoadPoint(branch,gagarinRail.curve.getPoint(0)).t;
 const leaveBranch=branch.getUtoTmapping(45/branch.getLength());
 const mainNear=nearestRoadPoint(main,branch.getPoint(0)).t;
 const joinMain=main.getUtoTmapping(arcFraction(main,mainNear)+65/main.getLength());
 const leaveMain=main.getUtoTmapping(1-55/main.getLength()),joinCity=city.getUtoTmapping(60/city.getLength());
 const yard=data.yards.find(y=>y.id==='st-tyuratam'),cityEnd=nearestRoadPoint(city,point(yard.x,yard.y,.75)).t;
 function connection(id,a,da,b,db){const reach=a.distanceTo(b)*.4;return {id,curve:new THREE.CubicBezierCurve3(a,a.clone().addScaledVector(da,reach),b.clone().addScaledVector(db,-reach),b)};}
 const first=connection('t-city-train-turnout',branch.getPoint(leaveBranch),branch.getTangent(leaveBranch).negate(),main.getPoint(joinMain),main.getTangent(joinMain));
 const second=connection('t-city-train-south-curve',main.getPoint(leaveMain),main.getTangent(leaveMain),city.getPoint(joinCity),city.getTangent(joinCity));
 const sections=[
  {id:gagarinRail.id,curve:gagarinRail.curve,from:1,to:0,datum:gagarinRail.datum},
  {id:'t-central-north',curve:branch,from:startOnBranch,to:leaveBranch},
  {id:first.id,curve:first.curve,from:0,to:1},
  {id:'t-west-center',curve:main,from:joinMain,to:leaveMain},
  {id:second.id,curve:second.curve,from:0,to:1},
  {id:'t-center-south',curve:city,from:joinCity,to:cityEnd}
 ];
 const points=[],joins=[];let previous=null;
 for(const section of sections){
  const n=Math.max(80,Math.ceil(section.curve.getLength()*Math.abs(section.to-section.from)/.5));
  const get=t=>{const p=section.curve.getPoint(t);p.y=(section.datum?section.datum(t):.75)+RAIL_PROFILE.headY;return p;};
  const start=get(section.from),end=get(section.to);
  const sign=Math.sign(section.to-section.from),heading=section.curve.getTangent(section.from).multiplyScalar(sign).setY(0).normalize();
  if(previous)joins.push({from:previous.id,to:section.id,gap:previous.end.distanceTo(start),tangentDot:previous.heading.dot(heading)});
  for(let i=0;i<=n;i++)points.push(get(THREE.MathUtils.lerp(section.from,section.to,i/n)));
  previous={id:section.id,end,heading:section.curve.getTangent(section.to).multiplyScalar(sign).setY(0).normalize()};
 }
 return {path:distancePath(points),extraRails:[first,second],sections,joins,
  from:'Пл. №1 · Гагаринский старт',to:'Тюратам · город',gauge:RAIL_PROFILE.gauge};
}

export function buildHighwayPath(roads){
 const west=roads.find(r=>r.id==='r-south-west'),east=roads.find(r=>r.id==='r-south-east');
 if(!west||!east)throw Error('Aralsk–Kyzylorda highway is missing');
 const points=[...west.points].reverse().concat(east.points.slice(1));
 return {...distancePath(points),width:Math.min(west.width,east.width),bridgeDistance:distancePath(west.points).length,routeIds:[west.id,east.id],joinGap:west.points[0].distanceTo(east.points[0])};
}
