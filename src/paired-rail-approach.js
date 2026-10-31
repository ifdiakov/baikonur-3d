import * as THREE from 'three';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const flat=p=>p.clone().setY(0);
const normal=d=>V(-d.z,0,d.x);
const ease=t=>t*t*(3-2*t);
const horizontal=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const angle=d=>Math.atan2(d.z,d.x);
const direction=a=>V(Math.cos(a),0,Math.sin(a));
function sweep(from,to,sign){
 let delta=to-from;
 while(delta*sign<0)delta+=sign*Math.PI*2;
 while(delta*sign>=Math.PI*2)delta-=sign*Math.PI*2;
 return delta;
}

/** A pair shares its two turn centres and straight corridor. The four fixed
 * source/model poses remain separate tracks, never independent crossing
 * cubics. All offsets stay outside the inside rail/ballast turning radius. */
export function createPairedRailApproach(rows,{sampleStep=.16,ballastWidth=.448,innerRadius=ballastWidth/2+.38,entryBlend=0}={}){
 if(rows.length!==2)throw new Error('A paired rail approach requires two tracks');
 const startDirections=rows.map(r=>flat(r.startTangent).normalize()),endDirections=rows.map(r=>flat(r.endTangent).normalize());
 const startDirection=startDirections[0].clone().add(startDirections[1]).normalize(),endDirection=endDirections[0].clone().add(endDirections[1]).normalize();
 if(startDirections.some(d=>d.dot(startDirection)<.98)||endDirections.some(d=>d.dot(endDirection)<.999))throw new Error('Rail pair has incompatible endpoint headings');
 const startNormal=normal(startDirection),endNormal=normal(endDirection);
 const sourceOrder=flat(rows[1].start).sub(flat(rows[0].start)).dot(startNormal),gateOrder=flat(rows[1].end).sub(flat(rows[0].end)).dot(endNormal);
 if(sourceOrder<=ballastWidth||gateOrder<=ballastWidth)throw new Error('Rail pair endpoint order or clearance is inconsistent');
 if(Math.abs(flat(rows[1].end).sub(flat(rows[0].end)).dot(endDirection))>1e-5)throw new Error('Rail pair model ports must share an entrance plane');
 // Staggered source endpoints first enter a common cross-section along their
 // original headings. This preserves both source poses and transverse order.
 const plane=Math.max(...rows.map(r=>flat(r.start).dot(startDirection)))+ballastWidth*2;
 const aligned=rows.map((r,i)=>flat(r.start).addScaledVector(startDirections[i],(plane-flat(r.start).dot(startDirection))/startDirections[i].dot(startDirection)));
 const start=aligned[0].clone().add(aligned[1]).multiplyScalar(.5),end=flat(rows[0].end).add(flat(rows[1].end)).multiplyScalar(.5);
 const halfStart=aligned[1].clone().sub(aligned[0]).dot(startNormal)/2,halfEnd=gateOrder/2;
 const r0=halfStart+innerRadius,r1=halfEnd+innerRadius,a0=angle(startDirection),a1=angle(endDirection),candidates=[];
 for(const turn0 of [-1,1])for(const turn1 of [-1,1]){
  const center0=start.clone().addScaledVector(startNormal,turn0*r0),center1=end.clone().addScaledVector(endNormal,turn1*r1),delta=center1.clone().sub(center0),length=delta.length(),k=turn1*r1-turn0*r0;
  if(length<=Math.abs(k)+1e-7)continue;
  const middleAngle=angle(delta)-Math.asin(k/length),middleDirection=direction(middleAngle),middleNormal=normal(middleDirection);
  const arc0=sweep(a0,middleAngle,turn0),arc1=sweep(middleAngle,a1,turn1);
  if(Math.abs(arc0)>Math.PI||Math.abs(arc1)>Math.PI)continue;
  const straight0=center0.clone().addScaledVector(middleNormal,-turn0*r0),straight1=center1.clone().addScaledVector(middleNormal,-turn1*r1),straightLength=straight1.clone().sub(straight0).dot(middleDirection);
  if(straightLength<ballastWidth)continue;
  candidates.push({center0,center1,turn0,turn1,middleAngle,middleNormal,arc0,arc1,straight0,straight1,straightLength,length:Math.abs(arc0)*r0+straightLength+Math.abs(arc1)*r1});
 }
 candidates.sort((a,b)=>a.length-b.length);const corridor=candidates[0];
 if(!corridor)throw new Error('No non-looping paired rail corridor fits the fixed endpoint poses');
 const sections=[],append=(center,n,half,along)=>sections.push({center,n,half,along});
 function arc(center,radius,turn,from,delta,half,before){
  const count=Math.max(1,Math.ceil(Math.abs(delta)/.045),Math.ceil(Math.abs(delta)*(radius+half)/sampleStep));
  for(let i=0;i<=count;i++){
   if(sections.length&&i===0)continue;
   const n=normal(direction(from+delta*i/count));append(center.clone().addScaledVector(n,-turn*radius),n,half,before+radius*Math.abs(delta)*i/count);
  }
 }
 arc(corridor.center0,r0,corridor.turn0,a0,corridor.arc0,halfStart,0);
 const firstLength=Math.abs(corridor.arc0)*r0,count=Math.max(2,Math.ceil(corridor.straightLength/sampleStep));
 for(let i=1;i<=count;i++){const t=i/count;append(corridor.straight0.clone().lerp(corridor.straight1,t),corridor.middleNormal,THREE.MathUtils.lerp(halfStart,halfEnd,ease(t)),firstLength+corridor.straightLength*t);}
 arc(corridor.center1,r1,corridor.turn1,corridor.middleAngle,corridor.arc1,halfEnd,firstLength+corridor.straightLength);
 const blendIndex=entryBlend>0?Math.max(1,sections.findIndex(section=>section.along>=Math.min(entryBlend,firstLength*.8))):0;
 const leadStation=aligned.reduce((sum,p,i)=>sum+horizontal(rows[i].start,p),0)/2;
 const tracks=rows.map((row,index)=>{
  const side=index?1:-1,section=sections[blendIndex],entry=section.center.clone().addScaledVector(section.n,side*section.half).setY(row.start.y);
  const entryDirection=V(section.n.z,0,-section.n.x),leadLength=horizontal(row.start,entry);
  const sourceNormal=normal(startDirections[index]),lateral=entry.clone().sub(row.start).dot(sourceNormal),turnRate=entryDirection.dot(sourceNormal);
  const reach=Math.abs(turnRate)>1e-8&&lateral*turnRate>0?Math.min(leadLength/3,Math.abs(lateral/turnRate)*.98):leadLength/3;
  const lead=new THREE.CubicBezierCurve3(row.start,row.start.clone().addScaledVector(startDirections[index],leadLength/3),entry.clone().addScaledVector(entryDirection,-reach),entry);
  const leadCount=Math.max(8,Math.ceil(leadLength/sampleStep)),points=Array.from({length:leadCount+1},(_,i)=>lead.getPoint(i/leadCount)),stations=Array.from({length:leadCount+1},(_,i)=>(leadStation+section.along)*i/leadCount);
  for(const section of sections.slice(blendIndex+1)){
   const p=section.center.clone().addScaledVector(section.n,side*section.half),t=section.along/corridor.length;
   p.y=THREE.MathUtils.lerp(row.start.y,row.end.y,ease(t));points.push(p);stations.push(leadStation+section.along);
  }
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+horizontal(points[i-1],points[i]));
  points.forEach((p,i)=>p.y=THREE.MathUtils.lerp(row.start.y,row.end.y,ease(lengths[i]/lengths.at(-1))));
  points[0].copy(row.start);points.at(-1).copy(row.end);
  return {id:row.id,points,stations,startTangent:startDirections[index],endTangent:endDirections[index]};
 });
 return {tracks,stats:{version:'paired-rail-corridor-v1',trackIds:rows.map(r=>r.id),sourceOrder,gateOrder,startSpacing:halfStart*2,endSpacing:halfEnd*2,innerRadius,
  turnAngles:[corridor.arc0,corridor.arc1].map(r=>r*180/Math.PI),straightLength:corridor.straightLength,length:corridor.length,sourcePosesPreserved:true,modelPosesPreserved:true}};
}

/** Dense physical sleepers meet the model at half a period. Detail eases
 * gradually to the existing distant-network cadence near the source seam. */
export function railApproachSleeperDistances(length,{step=.105,networkStep=1.45,anchor='end'}={}){
 const dense=Math.min(6,length*.25),blend=Math.min(24,length*.55),distances=[];
 for(let fromModel=step/2;fromModel<length;){
  distances.push(anchor==='start'?fromModel:length-fromModel);
  const t=THREE.MathUtils.clamp((fromModel-dense)/(blend||1),0,1);
  fromModel+=THREE.MathUtils.lerp(step,networkStep,ease(t));
 }
 return distances.sort((a,b)=>a-b);
}
