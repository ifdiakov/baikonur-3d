import assert from 'node:assert/strict';
import {ENERGIA_LAUNCH_EVENTS,ENERGIA_LAUNCH_END,ENERGIA_LAUNCH_START,sampleEnergiaLaunch} from '../src/energia-polyus-launch.js';
assert.equal(ENERGIA_LAUNCH_START,-90);
assert.equal(ENERGIA_LAUNCH_END,600);
assert.equal(ENERGIA_LAUNCH_EVENTS.find(e=>e.at===-14.4)?.title,'ЗАПУСК ДВИГАТЕЛЕЙ БЛОКА Ц');
assert.equal(ENERGIA_LAUNCH_EVENTS.find(e=>e.at===-3.2)?.title,'ЗАПУСК ДВИГАТЕЛЕЙ БЛОКОВ А');
for(let t=-90;t<=600;t+=.5){
 const s=sampleEnergiaLaunch(t),again=sampleEnergiaLaunch(t);
 assert.deepEqual(s,again,'Seeking must reproduce the same telemetry and FX parameters');
 assert.ok(Number.isFinite(s.altitudeKm)&&Number.isFinite(s.speedKmS)&&Number.isFinite(s.downrangeKm));
 assert.ok(s.altitudeKm>=0&&s.speedKmS>=0&&s.exhaust>=0&&s.exhaust<=1);
 assert.equal(s.phase,Math.max(0,ENERGIA_LAUNCH_EVENTS.findLastIndex(e=>t>=e.at)));
}
assert.equal(sampleEnergiaLaunch(0).altitudeKm,0);
assert.equal(sampleEnergiaLaunch(460).altitudeKm,110);
assert.ok(sampleEnergiaLaunch(-3.2).ignition<sampleEnergiaLaunch(0).ignition);
assert.equal(sampleEnergiaLaunch(459.9).payloadSeparated,false);
assert.equal(sampleEnergiaLaunch(460).payloadSeparated,true);
assert.equal(sampleEnergiaLaunch(511).payloadTurn,true);
assert.equal(sampleEnergiaLaunch(568).failedOrbit,true);
assert.equal(sampleEnergiaLaunch(460).exhaust,1);
assert.equal(sampleEnergiaLaunch(468).exhaust,0);
console.log('ENERGIA_LAUNCH_UNIT_PASS '+JSON.stringify({phases:ENERGIA_LAUNCH_EVENTS.length,launch:0,separation:460,altitudeKm:110}));
