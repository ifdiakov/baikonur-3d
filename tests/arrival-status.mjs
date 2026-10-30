import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFlightCircuit,FLIGHT_CYCLE_DURATION,FLIGHT_LEG_DURATION} from '../src/flight-circuit.js';
import {createArrivalStatusTimeline,arrivalStatus,ARRIVAL_STATUS_VERSION} from '../src/arrival-status.js';

// Read the real simulation timeline, so changing a landing/taxi duration cannot
// leave the passenger countdown running on a separate hard-coded clock.
const airport=new THREE.Group();
airport.userData.airport={key:'krayniy',length:1380,width:45,threshold:675,touchdown:520.8387096774194};
airport.scale.setScalar(.28);airport.rotation.y=2.1523940038156346;
const path=createFlightCircuit(airport),timeline=createArrivalStatusTimeline(path.phases);
assert.equal(FLIGHT_LEG_DURATION,406);assert.equal(FLIGHT_CYCLE_DURATION,812);
assert.deepEqual(timeline.map(({id,leg,start,end,duration})=>({id,leg,start,end,duration})),[
 {id:'inbound',leg:1,start:0,end:148,duration:148},
 {id:'parking',leg:1,start:148,end:168,duration:20},
 {id:'outbound',leg:1,start:168,end:406,duration:238},
 {id:'inbound',leg:2,start:406,end:554,duration:148},
 {id:'parking',leg:2,start:554,end:574,duration:20},
 {id:'outbound',leg:2,start:574,end:812,duration:238}
]);

const labels={inbound:'МОСКВА-КРАЙНИЙ',parking:'СТОЯНКА',outbound:'КРАЙНИЙ-МОСКВА'};
const checkpoints=[
 [0,'inbound',148],[1.25,'inbound',147],
 [119.999,'inbound',29],[120,'inbound',28],[147.999,'inbound',1],
 [148,'parking',20],[149,'parking',19],[167.999,'parking',1],
 [168,'outbound',238],[180,'outbound',226],[230,'outbound',176],
 [242,'outbound',164],[266,'outbound',140],[346,'outbound',60],[405.999,'outbound',1]
];
let checked=0;
for(let cycle=0;cycle<2;cycle++)for(let leg=0;leg<2;leg++){
 const offset=cycle*FLIGHT_CYCLE_DURATION+leg*FLIGHT_LEG_DURATION;
 for(const [seconds,id,remaining]of checkpoints){
  const state=path.sample(offset+seconds),status=arrivalStatus(timeline,state.cycleTime);
  assert.equal(status.id,id,'Passenger status at '+(offset+seconds));
  assert.equal(status.label,labels[id]);assert.equal(status.seconds,remaining);
  assert.equal(status.leg,leg+1);assert.ok(status.remaining>0&&status.remaining<=status.duration);
  if(id==='parking'){
   assert.equal(state.segment,'hold');assert.equal(state.velocity.length(),0);
  }
  if(state.segment==='away')assert.equal(status.id,'outbound','A hidden departure keeps its outbound label');
  checked++;
 }
}

// A manoeuvre boundary must not reset the large passenger-status countdown.
for(const phase of path.phases){
 if(!phase.start)continue;
 const before=arrivalStatus(timeline,path.sample(phase.start-.001).cycleTime),
  after=arrivalStatus(timeline,path.sample(phase.start).cycleTime);
 if(before.id===after.id&&before.leg===after.leg){
  assert.equal(before.seconds,after.seconds+1,'Continuous countdown across '+phase.phase);
  assert.equal(before.end,after.end);
 }
}
for(const start of [0,FLIGHT_CYCLE_DURATION,FLIGHT_CYCLE_DURATION*2]){
 const state=path.sample(start),status=arrivalStatus(timeline,state.cycleTime);
 assert.equal(state.segment,'approach');assert.equal(status.id,'inbound');
 assert.equal(status.seconds,148);assert.equal(status.leg,1);
}
let previous=null;
for(let time=0;time<FLIGHT_CYCLE_DURATION*2;time+=.25){
 const state=path.sample(time),status=arrivalStatus(timeline,state.cycleTime);
 assert.ok(Number.isInteger(status.seconds)&&status.seconds>0,'No zero or negative countdown flash');
 if(previous?.leg===status.leg&&previous.id===status.id)assert.ok(status.seconds<=previous.seconds);
 previous=status;
}
console.log('ARRIVAL_STATUS_PASS',JSON.stringify({version:ARRIVAL_STATUS_VERSION,checkpoints:checked,
 cycle:FLIGHT_CYCLE_DURATION,leg:FLIGHT_LEG_DURATION,statuses:timeline}));
