import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {FLANK_OUTLINE} from '../src/flank-boundaries.js';
import {AIRPORT_SCALE,airportDisplaySpec} from '../src/airport-models.js';
import {createBuranLandingPath,BURAN_LANDING_TIMES,landingClock} from '../src/buran-landing-path.js';
import {BURAN_LANDING_PARAMETERS as HISTORY,BURAN_LANDING_RADAR_SAMPLES} from '../src/buran-landing-history.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const airports=read('data/osm/airports.geojson'),sourceBefore=JSON.stringify([airports,HISTORY,BURAN_LANDING_RADAR_SAMPLES]);
const runway=airports.features.find(f=>f.properties.osmId===24949215&&f.geometry.type==='LineString');
assert(runway,'The landing uses the actual Yubileiny runway source');
const V=(...p)=>new THREE.Vector3(...p),project=coord=>{const p=geography.project(coord);return V((p[0]-650)*3.4,0,(p[1]-522.5)*3.4);};
const a=project(runway.geometry.coordinates[0]),b=project(runway.geometry.coordinates.at(-1)),sign=b.x>=a.x?1:-1;
const airport=new THREE.Group();airport.position.copy(a.clone().lerp(b,.5)).setY(-2.72);
airport.rotation.y=Math.atan2((b.x-a.x)*sign,(b.z-a.z)*sign);airport.scale.setScalar(AIRPORT_SCALE);
airport.userData.airport=airportDisplaySpec('yubileiny');airport.updateWorldMatrix(true,true);
const transformBefore=JSON.stringify({position:airport.position,rotation:airport.rotation,scale:airport.scale,spec:airport.userData.airport});
const bounds={
 minX:(Math.min(geography.bounds.minX,...FLANK_OUTLINE.map(p=>p[0]))-650)*3.4,
 maxX:(Math.max(geography.bounds.maxX,...FLANK_OUTLINE.map(p=>p[0]))-650)*3.4,
 minZ:(Math.min(geography.bounds.minY,...FLANK_OUTLINE.map(p=>p[1]))-522.5)*3.4,
 maxZ:(Math.max(geography.bounds.maxY,...FLANK_OUTLINE.map(p=>p[1]))-522.5)*3.4
};
const path=createBuranLandingPath({airfield:airport,bounds}),stats=path.stats(),times=BURAN_LANDING_TIMES;
const near=(actual,expected,tolerance=1e-8,message='Unexpected landing coordinate')=>assert(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} != ${expected}`);
assert.equal(stats.runwayDesignator,'24');near(path.metre,.14);
near(path.centre.distanceTo(airport.localToWorld(V(0,airport.userData.airport.runwayY,0))),0);
assert.equal(HISTORY.date,'1988-11-15');assert.equal(HISTORY.timeZone,'Europe/Moscow');
assert.equal(landingClock(0),'09:18:23');assert.equal(landingClock(times.touchdown),'09:24:42');assert.equal(landingClock(times.stop),'09:25:24');
near(times.stop-times.touchdown,42);near(stats.rolloutM,1620);near(stats.rolloutSeconds,42);
near(HISTORY.touchdown.reportedVerticalSpeedMps,-.3,1e-12);
near(path.raw(path.joinTime).heightM,8200,1e-6,'The escort rendezvous does not match its documented approximate altitude');
assert(path.joinTime>9*3600+21*60+6.8-times.start&&path.joinTime<9*3600+21*60+30.4-times.start,'The escort rendezvous skipped a radar interval');

// All 19 source observations survive unchanged. The 16 coherent descent
// observations are exact anchors; the final 12 -> 14 -> 24 m radar heights
// remain evidence, while the displayed final flare descends to the runway.
assert.equal(BURAN_LANDING_RADAR_SAMPLES.length,19);
assert(Object.isFrozen(BURAN_LANDING_RADAR_SAMPLES));
assert(BURAN_LANDING_RADAR_SAMPLES.every(Object.isFrozen));
const coherent=BURAN_LANDING_RADAR_SAMPLES.slice(0,16);
assert.equal(coherent.at(-1).clock,'09:24:14.7');assert.equal(coherent.at(-1).heightM,344);
assert.deepEqual(BURAN_LANDING_RADAR_SAMPLES.slice(16).map(p=>p.heightM),[12,14,24]);
assert.equal(stats.observationCount,19);assert.equal(stats.interpolatedObservationCount,16);
let anchorChecks=0,maxAnchorError=0;
for(const observation of coherent){
 const t=observation.secondsOfDay-times.start,actual=path.raw(t);
 for(const key of ['eastM','northM','heightM']){const error=Math.abs(actual[key]-observation[key]);maxAnchorError=Math.max(maxAnchorError,error);near(actual[key],observation[key],1e-8,'A coherent radar anchor moved');anchorChecks++;}
}

// Coordinates within 2.5 km retain the physical airport scale. The distant
// compression has the same position and first derivative at its boundary.
let metricChecks=0;
for(const [eastM,northM]of [[0,0],[1000,0],[0,1000],[1500,2000],[-1500,-2000]]){
 const p=path.display({eastM,northM,heightM:0});
 near(p.x,path.centre.x+eastM*.14);near(p.z,path.centre.z-northM*.14);near(p.y,path.centre.y);metricChecks++;
}
const radius=stats.metricRadiusM,dr=.001;
const radial=r=>path.display({eastM:r,northM:0,heightM:0}).x-path.centre.x;
near(radial(radius),radius*.14);
near((radial(radius)-radial(radius-dr))/dr,(radial(radius+dr)-radial(radius))/dr,1e-7,'Radial display compression has a velocity seam');
assert(radial(1e9)<=stats.distantRadiusLimit+1e-7);

let samples=0,groundSamples=0,minHeight=Infinity,minBuranBoundary=Infinity,minMigBoundary=Infinity,maxLateralM=0,previousHeight=Infinity;
const boundaryDistance=p=>Math.min(p.x-bounds.minX,bounds.maxX-p.x,p.z-bounds.minZ,bounds.maxZ-p.z);
for(let i=0;i<=Math.ceil(times.end/.05);i++){
 const t=Math.min(times.end,i*.05),s=path.sample(t);samples++;
 assert([...s.position.toArray(),...s.heading.toArray(),...s.mig.position.toArray(),...s.mig.heading.toArray(),s.pitchDeg,s.bankDeg,s.physicalSpeedMps].every(Number.isFinite),'A landing pose is not finite at '+t);
 near(s.heading.length(),1,1e-7);if(s.mig.visible)near(s.mig.heading.length(),1,1e-7);
 const height=s.position.y-path.centre.y;minHeight=Math.min(minHeight,height);
 assert(height>=-1e-9,'The flight goes below the runway plane');
 assert(s.sourcePose.heightM<=previousHeight+1e-8,'The reconstructed descent rises between final radar anchors');previousHeight=s.sourcePose.heightM;
 minBuranBoundary=Math.min(minBuranBoundary,boundaryDistance(s.position));
 if(s.mig.visible)minMigBoundary=Math.min(minMigBoundary,boundaryDistance(s.mig.position));
 // Twenty scene units cover the complete metric aircraft and its nearby
 // deployed surfaces; checking only the centre could permit clipped bodies.
 assert(boundaryDistance(s.position)>20,'The Buran body reaches the museum boundary');
 if(s.mig.visible)assert(boundaryDistance(s.mig.position)>20,'The escort body reaches the museum boundary');
 if(s.onGround){
  const local=airport.worldToLocal(s.position.clone()),metres=local.clone().divideScalar(airport.userData.airport.physicalToLocal);
  assert(Math.abs(metres.x)<HISTORY.runway.widthM/2&&Math.abs(metres.z)<HISTORY.runway.lengthM/2,'The rollout leaves runway 24');
  near(s.position.y,path.centre.y,1e-9);near(s.gear,1);maxLateralM=Math.max(maxLateralM,Math.abs(metres.x));groundSamples++;
 }
}
assert(samples>8000&&groundSamples>800);
const touchdown=path.sample(times.touchdown),stop=path.sample(times.stop),touchLocal=airport.worldToLocal(touchdown.position.clone()),stopLocal=airport.worldToLocal(stop.position.clone());
near(touchLocal.z/airport.userData.airport.physicalToLocal,HISTORY.runway.lengthM/2-810);
near((touchLocal.z-stopLocal.z)/airport.userData.airport.physicalToLocal,1620,1e-8,'The physical rollout length changed');
near(Math.abs(stopLocal.x)/airport.userData.airport.physicalToLocal,.8);
assert(touchLocal.z>0&&touchdown.heading.dot(path.northEnd.clone().negate())>.999,'The landing is not toward the designated 24 end');
near(path.raw(times.stop).rolloutM,1620);near(path.raw(times.touchdown).rolloutM,0);
assert(path.sample(times.touchdown-.001).onGround===false&&touchdown.onGround);
near(path.sample(times.parachutes-.001).chute,0);near(path.sample(times.parachutes+1.3).chute,1);
near(path.sample(times.noseWheel).pitchDeg,0);
assert(stop.position.distanceTo(path.sample(times.end).position)<1e-9,'Buran moves after its documented stop');

// Numeric one-sided derivatives verify C1 motion independently of the
// interpolation implementation, including both stages of the escort break.
const joins=[...coherent.slice(1).map(p=>({label:p.clock,time:p.secondsOfDay-times.start,actor:'buran'})),
 {label:'touchdown',time:times.touchdown,actor:'buran'},{label:'stop',time:times.stop,actor:'buran'},
 {label:'escort break',time:9*3600+24*60-times.start,actor:'mig'},{label:'escort flyby',time:times.stop+9,actor:'mig'}];
let continuityChecks=0,maxVelocityGap=0;const dt=.0001;
for(const join of joins){
 const get=t=>join.actor==='buran'?path.sample(t).position:path.sample(t).mig.position;
 const p=get(join.time),left=p.clone().sub(get(join.time-dt)).divideScalar(dt),right=get(join.time+dt).sub(p).divideScalar(dt);
 const gap=left.distanceTo(right);maxVelocityGap=Math.max(maxVelocityGap,gap);
 assert(gap<.001,'The landing trajectory has a C1 break: '+JSON.stringify({...join,gap,left:left.toArray(),right:right.toArray()}));continuityChecks++;
}
assert.equal(JSON.stringify([airports,HISTORY,BURAN_LANDING_RADAR_SAMPLES]),sourceBefore,'The animation mutated its source observations or source runway');
assert.equal(JSON.stringify({position:airport.position,rotation:airport.rotation,scale:airport.scale,spec:airport.userData.airport}),transformBefore,'The landing path moved or rescaled the airport');
console.log('BURAN_LANDING_PATH_PASS',JSON.stringify({sourceRunway:24949215,runwayDesignator:stats.runwayDesignator,metre:path.metre,sourceRecords:19,coherentRecords:16,anchorChecks,maxAnchorError,metricChecks,samples,groundSamples,rolloutM:1620,rolloutSeconds:42,minHeight,minBuranBoundary,minMigBoundary,maxLateralM,continuityChecks,maxVelocityGap}));
