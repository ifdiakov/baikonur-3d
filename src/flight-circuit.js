import * as THREE from 'three';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp;
const smooth=(a,b,t)=>{const u=clamp((t-a)/(b-a),0,1);return u*u*(3-2*u);};
const ease=u=>u*u*(3-2*u),easeDerivative=u=>6*u*(1-u);

export const FLIGHT_DURATION=120;
export const TOUCHDOWN_TIME=120;
export const FLIGHT_TIMINGS=Object.freeze({approach:120,rollout:28,hold:20,turn:12,taxi:50,takeoff:24,departure:80,away:60});
export const FLIGHT_LEG_DURATION=Object.values(FLIGHT_TIMINGS).reduce((a,b)=>a+b,0)+FLIGHT_TIMINGS.turn;
export const FLIGHT_CYCLE_DURATION=FLIGHT_LEG_DURATION*2;
export const FLIGHT_CIRCUIT_VERSION='krayniy-osm-circuit-v6';

function hermite(nodes,t){
 let i=0;while(i<nodes.length-2&&t>nodes[i+1].t)i++;
 const a=nodes[i],b=nodes[i+1],dt=b.t-a.t,u=clamp((t-a.t)/dt,0,1),u2=u*u,u3=u2*u;
 const position=a.p.clone().multiplyScalar(2*u3-3*u2+1).addScaledVector(a.v,(u3-2*u2+u)*dt)
  .addScaledVector(b.p,-2*u3+3*u2).addScaledVector(b.v,(u3-u2)*dt);
 const velocity=a.p.clone().multiplyScalar((6*u2-6*u)/dt).addScaledVector(a.v,3*u2-4*u+1)
  .addScaledVector(b.p,(-6*u2+6*u)/dt).addScaledVector(b.v,3*u2-2*u);
 return {position,velocity};
}

function runwayFrame(airfield,aircraftScale){
 airfield.updateWorldMatrix(true,false);
 const spec=airfield.userData.airport||{length:1550,width:45,threshold:760,touchdown:585};
 const length=spec.length,width=spec.width,H=length/2;
 const center=airfield.getWorldPosition(V()),runwayY=airfield.localToWorld(V(0,1.75,0)).y,clearance=3.18*aircraftScale;
 const axis=airfield.localToWorld(V(0,0,1)).sub(center).setY(0).normalize();
 const right=airfield.localToWorld(V(1,0,0)).sub(center).setY(0).normalize();
 const localToGround=(x,z)=>airfield.localToWorld(V(x,1.75,z)).setY(runwayY+clearance);
 const threshold=localToGround(0,spec.threshold??H-15).setY(runwayY);
 const touchdown=localToGround(0,spec.touchdown??H-length*.12);
 const stopLocal=H-length*.8,stop=localToGround(0,stopLocal);
 // Radius leaves every tyre on the 45 m asphalt, including the nose wheel
 // sweeping outside the fuselage centre during each 180-degree turn.
 const turnRadius=width*.17,taxiStartLocal=H-55,takeoffEndLocal=-H+215;
 const startTakeoff=localToGround(0,taxiStartLocal),endTakeoff=localToGround(0,takeoffEndLocal);
 const rolloutDistance=touchdown.distanceTo(stop),landingSpeed=2*rolloutDistance/FLIGHT_TIMINGS.rollout;
 const takeoffDistance=startTakeoff.distanceTo(endTakeoff),takeoffSpeed=2*takeoffDistance/FLIGHT_TIMINGS.takeoff;
 const forward=axis.clone().negate(),along=(speed,y=0)=>forward.clone().multiplyScalar(speed).setY(y);
 const near=(distance,altitude)=>touchdown.clone().addScaledVector(axis,distance).setY(runwayY+clearance+altitude);
 return {airfield,key:spec.key||'krayniy',length,width,H,center,runwayY,clearance,axis,right,localToGround,threshold,touchdown,
  stopLocal,stop,turnRadius,taxiStartLocal,takeoffEndLocal,startTakeoff,endTakeoff,rolloutDistance,landingSpeed,takeoffDistance,takeoffSpeed,forward,along,near};
}

// Both museum sorties land at Krayniy and use its actual model transform.
// An optional firstAirfield remains available to callers with another route.
// The hidden one-minute away phase is the only position discontinuity.
export function createFlightCircuit(airfield,{aircraftScale=.28,firstAirfield=airfield,complexCenter}={}){
 const hub=complexCenter?.clone?.()||V();hub.y=0;
 const atHub=(x,y,z)=>hub.clone().add(V(x,y,z));
 const runways=[runwayFrame(firstAirfield,aircraftScale),runwayFrame(airfield,aircraftScale)];
 const phases=[];
 for(let leg=0;leg<2;leg++){
  let start=leg*FLIGHT_LEG_DURATION;
  for(const [phase,duration] of [['approach',120],['rollout',28],['hold',20],['turn-back',12],['taxi-back',50],['turn-takeoff',12],['takeoff',24],['departure',80],['away',60]]){
   phases.push(Object.freeze({leg,phase,start,end:start+duration,duration,direction:leg===0?'northeast':'north',airport:runways[leg].key}));start+=duration;
  }
 }
 const approachNodes=[
  [{t:0,p:atHub(-2700,520,-2100),v:V(45,-.6,20)}, {t:42,p:atHub(-600,400,-300),v:V(44,-4,28)}],
  [{t:0,p:atHub(-2900,500,-450),v:V(48,-.6,6)}, {t:38,p:atHub(0,400,0),v:V(48,-3,14)}]
 ].map((prefix,leg)=>{const {near,along,touchdown,landingSpeed}=runways[leg];return [...prefix,
  {t:82,p:near(690,690*Math.tan(Math.PI/60)),v:along(22,-22*Math.tan(Math.PI/60))},
  {t:105,p:near(260,260*Math.tan(Math.PI/60)),v:along(19,-19*Math.tan(Math.PI/60))},
  {t:120,p:touchdown.clone(),v:along(landingSpeed,0)}];});
 const departureNodes=runways.map(({endTakeoff,along,takeoffSpeed,forward},leg)=>{const departureStart=endTakeoff.clone().add(V(0,35,0));return [
  {t:0,p:departureStart.clone(),v:along(takeoffSpeed,0)},
  {t:16,p:departureStart.clone().addScaledVector(forward,250).add(V(-160,100,50)),v:V(-16,5,-6)},
  {t:36,p:atHub(-950,260,650),v:V(12,5,-60)},
  {t:56,p:atHub(0,410,0),v:leg===0?V(38,4,-42):V(5,4,-60)},
  {t:80,p:leg===0?atHub(2900,650,-3000):atHub(0,650,-3500),v:leg===0?V(80,2,-80):V(0,3,-100)}
 ];});

 function sample(seconds){
  const total=Math.max(0,Number.isFinite(seconds)?seconds:0),cycleTime=total%FLIGHT_CYCLE_DURATION;
  const descriptor=phases.find(p=>cycleTime<p.end)||phases[0];
  const {leg,phase,start,duration,direction}=descriptor,t=cycleTime-start,u=clamp(t/duration,0,1);
  const {airfield,key,length,width,H,center,runwayY,clearance,axis,right,localToGround,touchdown,stop,stopLocal,
   turnRadius,taxiStartLocal,startTakeoff,endTakeoff,rolloutDistance,landingSpeed,takeoffSpeed,forward,along}=runways[leg];
  let position,velocity,heading=forward.clone(),gear=1,onGround=true,pitchDeg=0,visible=true;
  if(phase==='approach'){
   ({position,velocity}=hermite(approachNodes[leg],t));heading.copy(velocity).normalize();onGround=false;gear=smooth(76,94,t);
   const pathPitch=Math.atan2(heading.y,Math.hypot(heading.x,heading.z))*180/Math.PI;
   pitchDeg=THREE.MathUtils.lerp(pathPitch+2,3.5,smooth(58,76,t))+2.5*smooth(108,120,t);
  }else if(phase==='rollout'){
   const distance=rolloutDistance*(2*u-u*u);position=touchdown.clone().addScaledVector(forward,distance);velocity=along(landingSpeed*(1-u));
   pitchDeg=6*(1-smooth(1,7,t));
  }else if(phase==='hold'){
   position=stop.clone();velocity=V();
  }else if(phase==='turn-back'||phase==='turn-takeoff'){
   const angle=Math.PI*ease(u),speed=Math.PI*easeDerivative(u)/duration;
   const back=phase==='turn-back',cx=turnRadius,z=back?stopLocal:taxiStartLocal;
   const lx=back?cx-turnRadius*Math.cos(angle):cx+turnRadius*Math.cos(angle);
   const lz=back?z-turnRadius*Math.sin(angle):z+turnRadius*Math.sin(angle);
   position=localToGround(lx,lz);
   const localTangent=V(back?Math.sin(angle):-Math.sin(angle),0,back?-Math.cos(angle):Math.cos(angle));
   heading=right.clone().multiplyScalar(localTangent.x).addScaledVector(axis,localTangent.z).normalize();
   const worldRadius=airfield.localToWorld(V(turnRadius,0,0)).distanceTo(center);velocity=heading.clone().multiplyScalar(worldRadius*speed);
  }else if(phase==='taxi-back'){
   const a=localToGround(2*turnRadius,stopLocal),b=localToGround(2*turnRadius,taxiStartLocal);
   position=a.clone().lerp(b,ease(u));velocity=b.clone().sub(a).multiplyScalar(easeDerivative(u)/duration);heading=axis.clone();
  }else if(phase==='takeoff'){
   position=startTakeoff.clone().lerp(endTakeoff,u*u);velocity=along(takeoffSpeed*u);
   const lift=smooth(16,24,t),v=clamp((t-16)/8,0,1);position.y+=35*lift;velocity.y=t>16?35*easeDerivative(v)/8:0;
   onGround=t<=16;pitchDeg=9*smooth(10,17,t);
  }else if(phase==='departure'){
   ({position,velocity}=hermite(departureNodes[leg],t));heading.copy(velocity).normalize();onGround=false;gear=1-smooth(0,12,t);
   const target=clamp(Math.atan2(heading.y,Math.hypot(heading.x,heading.z))*180/Math.PI+3,-5,18);
   pitchDeg=THREE.MathUtils.lerp(9,target,smooth(0,12,t));
  }else{
   position=departureNodes[leg].at(-1).p.clone();velocity=V();heading=departureNodes[leg].at(-1).v.clone().normalize();gear=0;onGround=false;visible=false;
  }
  const phaseLabel=phase==='approach'?(t<58?'overflight':t<108?'approach':'flare'):phase;
  return {position,velocity,heading,gear,onGround,pitchDeg,visible,phase:phaseLabel,segment:phase,phaseTime:t,
   phaseRemaining:duration-t,phaseDuration:duration,leg:leg+1,direction,cycleTime,cycleIndex:Math.floor(total/FLIGHT_CYCLE_DURATION),
   airport:key,runwayY,runwayLength:length,runwayWidth:width,clearance,axis:axis.clone(),touchdown:touchdown.clone(),stop:stop.clone(),
   runwayProgress:(H-airfield.worldToLocal(position.clone()).z)/length};
 }
 const first=runways[0];
 return {sample,phases,axis:first.axis,right:first.right,center:first.center,threshold:first.threshold,touchdown:first.touchdown,stop:first.stop,
  runwayY:first.runwayY,clearance:first.clearance,duration:FLIGHT_CYCLE_DURATION,runways,complexCenter:hub,
  arrivalDuration:FLIGHT_DURATION,legDuration:FLIGHT_LEG_DURATION,runwayLength:first.length,runwayWidth:first.width,stopFraction:.8,
  taxiStart:first.startTakeoff.clone(),turnRadius:first.turnRadius,arrivalEntryPoints:approachNodes.map(n=>n[0].p.clone()),departureNodes};
}

export function flightPose(path,seconds,{aircraftScale=.28}={}){
 const state=path.sample(seconds),pitch=state.pitchDeg*Math.PI/180;
 const horizontal=state.heading.clone().setY(0).normalize();
 const airframeHeading=horizontal.multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch));
 // During flare and rotation, the main wheels define the contact point.
 const pivot=state.onGround||state.segment==='takeoff'?1:state.segment==='approach'?smooth(108,120,state.phaseTime):state.segment==='departure'?1-smooth(0,12,state.phaseTime):0;
 const bodyPosition=state.position.clone();bodyPosition.y+=aircraftScale*(2.72*(Math.cos(pitch)-1)+3*Math.sin(pitch))*pivot;
 const attitude=new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch,Math.atan2(state.heading.x,state.heading.z),0,'YXZ'));
 return {...state,airframeHeading,bodyPosition,attitude};
}
