import * as THREE from 'three';
import {BURAN_LANDING_PARAMETERS as HISTORY,BURAN_LANDING_RADAR_SAMPLES} from './buran-landing-history.js?v=20261031-facilities-rails-lighting-v5';

export const BURAN_LANDING_PATH_VERSION='buran-radar-landing-path-v1';
const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const hermite=(a,b,va,vb,u,dt)=>(2*u*u*u-3*u*u+1)*a+(u*u*u-2*u*u+u)*va*dt+(-2*u*u*u+3*u*u)*b+(u*u*u-u*u)*vb*dt;
const START=BURAN_LANDING_RADAR_SAMPLES[0].secondsOfDay;
export const BURAN_LANDING_TIMES=Object.freeze({start:START,touchdown:HISTORY.touchdown.secondsOfDay-START,
 noseWheel:HISTORY.noseWheel.secondsOfDay-START,parachutes:HISTORY.touchdown.secondsOfDay-START+HISTORY.parachutes.afterTouchdownSeconds,
 stop:HISTORY.stop.secondsOfDay-START,end:HISTORY.stop.secondsOfDay-START+24});

export function landingClock(elapsed){
 const s=Math.floor(START+clamp(elapsed,0,BURAN_LANDING_TIMES.end));
 return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':');
}

export function createBuranLandingPath({airfield,bounds=null}){
 airfield.updateWorldMatrix(true,false);
 const spec=airfield.userData.airport,metre=airfield.getWorldScale(new THREE.Vector3()).x*spec.physicalToLocal;
 const centre=airfield.localToWorld(new THREE.Vector3(0,spec.runwayY,0));
 const rotation=airfield.getWorldQuaternion(new THREE.Quaternion()),eastAxis=new THREE.Vector3(1,0,0).applyQuaternion(rotation),northEnd=new THREE.Vector3(0,0,1).applyQuaternion(rotation);
 const localToSource=(x,z,h=0)=>({eastM:eastAxis.x*x+northEnd.x*z,northM:-eastAxis.z*x-northEnd.z*z,heightM:h});
 // Airport geometry uses the museum's common physical metre, whereas distant
 // geography is schematic. Keep the complete runway and its immediate approach
 // metric, then compress distant radii continuously so the manoeuvre stays in
 // the visible museum. Raw observations below are never rescaled or rewritten.
 const radiusLimit=bounds?Math.max(650,Math.min(1100,centre.x-bounds.minX,bounds.maxX-centre.x,centre.z-bounds.minZ,bounds.maxZ-centre.z)-30):1050;
 const metricRadius=2500,metricWorld=metricRadius*metre,remaining=Math.max(180,radiusLimit-metricWorld);
 const horizontalRadius=r=>r<=metricRadius?r*metre:metricWorld+remaining*(1-Math.exp(-(r-metricRadius)*metre/remaining));
 const display=p=>{
  const r=Math.hypot(p.eastM,p.northM),scale=r>1e-8?horizontalRadius(r)/r:metre;
  return new THREE.Vector3(centre.x+p.eastM*scale,centre.y+metre*p.heightM/(1+p.heightM/10000),centre.z-p.northM*scale);
 };
 // The final three radar heights rise 12 -> 14 -> 24m. They remain in the
 // historical data but cannot be used as literal wheel heights. From the last
 // coherent 344m observation, use a continuous optical landing reconstruction.
 const observations=BURAN_LANDING_RADAR_SAMPLES.filter(p=>p.secondsOfDay<=9*3600+24*60+14.7);
 const times=observations.map(p=>p.secondsOfDay-START),flareStart=times.at(-1),flareEnd=BURAN_LANDING_TIMES.touchdown;
 function tangent(i,key){
  if(i===0)return (observations[1][key]-observations[0][key])/(times[1]-times[0]);
  if(i===observations.length-1)return (observations[i][key]-observations[i-1][key])/(times[i]-times[i-1]);
  const before=(observations[i][key]-observations[i-1][key])/(times[i]-times[i-1]),after=(observations[i+1][key]-observations[i][key])/(times[i+1]-times[i]);
  if(key==='heightM')return before*after<=0?0:2*before*after/(before+after);
  return (observations[i+1][key]-observations[i-1][key])/(times[i+1]-times[i-1]);
 }
 // Approximate location from the archive's photographic analysis: about190m
 // before the 1000m diamond. This is explicitly not a surveyed touchdown point.
 const touchdownLocal={x:2,z:HISTORY.runway.lengthM/2-810},stopLocal={x:-HISTORY.stop.lateralOffsetMagnitudeM,z:0};
 stopLocal.z=touchdownLocal.z-HISTORY.stop.rolloutM;
 const touchdownSource=localToSource(touchdownLocal.x,touchdownLocal.z),last=observations.at(-1),lastIndex=observations.length-1;
 const rolloutDuration=BURAN_LANDING_TIMES.stop-flareEnd,speedTouch=HISTORY.touchdown.reportedSpeedKph/3.6;
 const lateralRate=-2*(touchdownLocal.x-stopLocal.x)/rolloutDuration;
 // Render wheel contact with zero normal tangent; the historical estimate of
 // -0.3m/s remains separately labelled, rather than becoming a one-frame snap.
 const touchVelocity=localToSource(lateralRate,-speedTouch,0);
 function raw(t){
  t=clamp(t,0,BURAN_LANDING_TIMES.end);
  if(t>=flareEnd){
   const u=clamp((t-flareEnd)/rolloutDuration,0,1),distance=hermite(0,HISTORY.stop.rolloutM,speedTouch,0,u,rolloutDuration);
   const x=stopLocal.x+(touchdownLocal.x-stopLocal.x)*(1-u)**2*Math.cos(Math.PI*2*u);
   return {...localToSource(x,touchdownLocal.z-distance),onGround:true,rolloutM:distance,source:'reconstructed-rollout'};
  }
  if(t>=flareStart){
   const dt=flareEnd-flareStart,u=(t-flareStart)/dt,result={onGround:false,rolloutM:0,source:'reconstructed-final-flare'};
   for(const key of ['eastM','northM','heightM']){
    const v=tangent(lastIndex,key),startV=key==='heightM'?Math.max(v,-3*last.heightM/dt):v;
    result[key]=hermite(last[key],touchdownSource[key],startV,touchVelocity[key],u,dt);
   }
   result.heightM=Math.max(0,result.heightM);return result;
  }
  let i=0;while(i<times.length-2&&t>times[i+1])i++;
  const dt=times[i+1]-times[i],u=(t-times[i])/dt,result={onGround:false,rolloutM:0,source:'interpolated-radar-observations'};
  for(const key of ['eastM','northM','heightM'])result[key]=hermite(observations[i][key],observations[i+1][key],tangent(i,key),tangent(i+1,key),u,dt);
  return result;
 }
 const headingAt=t=>{
  const a=display(raw(Math.max(0,t-.12))),b=display(raw(Math.min(BURAN_LANDING_TIMES.stop,t+.12))),d=b.sub(a).setY(0);
  return d.lengthSq()>1e-12?d.normalize():northEnd.clone().negate();
 };
 // The described rendezvous altitude lies between radar observations. Use
 // its crossing on the reconstructed descent, not the next lower record.
 let joinLower=0,joinUpper=flareStart;
 for(let i=0;i<48;i++){
  const middle=(joinLower+joinUpper)/2;
  if(raw(middle).heightM>HISTORY.escort.approximateJoinAltitudeM)joinLower=middle;else joinUpper=middle;
 }
 const joinTime=(joinLower+joinUpper)/2;
 const breakTime=9*3600+24*60-START;
 function migClosePosition(t){
   const p=display(raw(t-2)),heading=headingAt(Math.max(0,t-2)),right=new THREE.Vector3().crossVectors(heading,new THREE.Vector3(0,1,0));
   const join=ease((t-(joinTime-24))/24);
   return p.addScaledVector(right,lerp(110,38,join)).addScaledVector(heading,lerp(45,-24,join)).add(new THREE.Vector3(0,12,0));
 }
 const migBreakWorld=migClosePosition(breakTime),migBreakVelocity=migClosePosition(breakTime+.05).sub(migClosePosition(breakTime-.05)).multiplyScalar(10);
 const migTurnSpeed=900*Math.PI*.75/15;
 const migFlybyEnd=display(localToSource(440,stopLocal.z-900,145));
 const migFlybyVelocity=display(localToSource(440,stopLocal.z-900-migTurnSpeed*.05,145)).sub(display(localToSource(440,stopLocal.z-900+migTurnSpeed*.05,145))).multiplyScalar(10);
 function migPosition(t){
  if(t<breakTime)return migClosePosition(t);
  const until=BURAN_LANDING_TIMES.stop+9;
  if(t<=until){
   const dt=until-breakTime,u=(t-breakTime)/dt;
   const p=new THREE.Vector3();for(const key of ['x','y','z'])p[key]=hermite(migBreakWorld[key],migFlybyEnd[key],migBreakVelocity[key],migFlybyVelocity[key],u,dt);
   return p;
  }
  const u=clamp((t-until)/15,0,1),angle=u*Math.PI*.75;
  return display(localToSource(440-900*(1-Math.cos(angle)),stopLocal.z-900-900*Math.sin(angle),145+u*u*160));
 }
 function sample(t){
  t=clamp(Number.isFinite(t)?t:0,0,BURAN_LANDING_TIMES.end);
  const p=raw(t),position=display(p),heading=headingAt(t),a=headingAt(Math.max(0,t-.3)),b=headingAt(Math.min(BURAN_LANDING_TIMES.stop,t+.3));
  const turn=Math.atan2(new THREE.Vector3().crossVectors(a,b).y,a.dot(b))/.6;
  const va=raw(Math.max(0,t-.2)),vb=raw(Math.min(BURAN_LANDING_TIMES.stop,t+.2)),physicalSpeed=Math.hypot(vb.eastM-va.eastM,vb.northM-va.northM)/.4;
  const bankDeg=p.onGround?0:clamp(-Math.atan(physicalSpeed*turn/9.81)*180/Math.PI,-55,55)*(1-ease((t-(flareStart-15))/15));
  const remaining=flareEnd-t,gear=ease((500-p.heightM)/310);
  const pitchDeg=p.onGround?11*(1-ease((t-flareEnd)/(BURAN_LANDING_TIMES.noseWheel-flareEnd))):lerp(4,11,ease((t-flareStart)/(flareEnd-flareStart)));
  const phase=t>=BURAN_LANDING_TIMES.stop?'stop':p.onGround?(t>=BURAN_LANDING_TIMES.parachutes?'parachutes':'rollout'):p.heightM<500?'flare':t>=9*3600+22*60+52.5-START?'final':t>=joinTime?'escort':'manoeuvre';
  const migP=migPosition(t),migD=migPosition(t+.08).sub(migPosition(t-.08));
  return {elapsed:t,clock:landingClock(t),secondsOfDay:START+t,position,heading,pitchDeg,bankDeg,gear:p.onGround?1:gear,
   chute:ease((t-BURAN_LANDING_TIMES.parachutes)/1.3),airbrake:p.onGround?.75:.35,
   onGround:p.onGround,phase,remaining,sourcePose:{...p},physicalSpeedMps:physicalSpeed,
   mig:{visible:t>=joinTime-24,position:migP,heading:migD.clone().setY(0).normalize(),pitchDeg:clamp(Math.atan2(migD.y,Math.hypot(migD.x,migD.z))*180/Math.PI,-15,15),bankDeg:t>BURAN_LANDING_TIMES.stop+9?-24:0}};
 }
 return {sample,raw,display,centre,metre,rotation,northEnd,times:BURAN_LANDING_TIMES,joinTime,flareStart,
  points:Array.from({length:560},(_,i)=>sample(i/559*BURAN_LANDING_TIMES.stop).position),
  stats:()=>({version:BURAN_LANDING_PATH_VERSION,sourceFrame:HISTORY.observationFrame,observationCount:BURAN_LANDING_RADAR_SAMPLES.length,
   interpolatedObservationCount:observations.length,rawObservationsPreserved:true,runwayDesignator:'24',metresToWorld:metre,runwayY:centre.y,
   sourceAirportHeadingPreserved:true,distantRadiusLimit:radiusLimit,metricRadiusM:metricRadius,
   distantScale:'continuous-radial-compression',verticalScale:'continuous-height-compression',
   reconstruction:{...HISTORY.reconstruction,touchdownFromThresholdM:810,touchdownPositionBasis:'approximate-archive-photographic-analysis',lateralPath:'illustrative-damped-correction',stopSide:'illustrative-sign',renderedContactVerticalTangentMps:0,reportedTouchdownVerticalSpeedMps:HISTORY.touchdown.reportedVerticalSpeedMps},
   touchdownLocal,stopLocal,rolloutM:HISTORY.stop.rolloutM,rolloutSeconds:rolloutDuration,escortCount:1,escortJoinElapsed:joinTime,escortJoinAltitudeM:HISTORY.escort.approximateJoinAltitudeM,escortPath:'interpretive-preserving-documented-stages'})};
}
