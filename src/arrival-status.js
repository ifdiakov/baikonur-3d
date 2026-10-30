// The panel describes the passenger flight, while the simulation retains its
// smaller landing, taxi and take-off segments. A countdown belongs to one
// complete passenger status and does not restart at each manoeuvre.
export const ARRIVAL_STATUS_VERSION='moscow-krayniy-status-v1';
export const ARRIVAL_STATUS_LABELS=Object.freeze({
 inbound:'МОСКВА-КРАЙНИЙ',parking:'СТОЯНКА',outbound:'КРАЙНИЙ-МОСКВА'
});
const statusByPhase=Object.freeze({
 approach:'inbound',rollout:'inbound',hold:'parking',
 'turn-back':'outbound','taxi-back':'outbound','turn-takeoff':'outbound',
 takeoff:'outbound',departure:'outbound',away:'outbound'
});

export function createArrivalStatusTimeline(phases){
 const timeline=[];
 for(const phase of phases){
  const id=statusByPhase[phase.phase];
  if(!id)throw new Error('Unknown passenger-flight segment: '+phase.phase);
  const previous=timeline.at(-1),leg=phase.leg+1;
  if(previous?.id===id&&previous.leg===leg&&previous.end===phase.start)previous.end=phase.end;
  else timeline.push({id,label:ARRIVAL_STATUS_LABELS[id],leg,start:phase.start,end:phase.end});
 }
 return Object.freeze(timeline.map(status=>Object.freeze({...status,duration:status.end-status.start})));
}

export function arrivalStatus(timeline,cycleTime){
 const total=timeline.at(-1)?.end;
 if(!(total>0))throw new Error('The passenger-flight timeline is empty');
 const time=Math.max(0,Number.isFinite(cycleTime)?cycleTime:0)%total;
 const status=timeline.find(item=>time>=item.start&&time<item.end);
 if(!status)throw new Error('The passenger-flight timeline contains a gap');
 const remaining=status.end-time;
 return {...status,remaining,seconds:Math.ceil(remaining)};
}
