import assert from 'node:assert/strict';
import {ENERGIA_LAUNCH_EVENTS,ENERGIA_LAUNCH_END,ENERGIA_LAUNCH_START,sampleEnergiaLaunch,advanceEnergiaClock,energiaVisualHeight} from '../src/energia-polyus-launch.js';
assert.equal(ENERGIA_LAUNCH_START,-90);
assert.equal(ENERGIA_LAUNCH_END,600);
assert.equal(ENERGIA_LAUNCH_EVENTS.find(e=>e.at===-9.4)?.title,'ЗАПУСК ДВИГАТЕЛЕЙ БЛОКА Ц');
assert.equal(ENERGIA_LAUNCH_EVENTS.find(e=>e.at===-3.2)?.title,'ЗАПУСК ДВИГАТЕЛЕЙ БЛОКОВ А');
for(let t=-90;t<=600;t+=.5){
 const s=sampleEnergiaLaunch(t),again=sampleEnergiaLaunch(t);
 assert.deepEqual(s,again,'Seeking must reproduce the same telemetry and FX parameters');
 assert.ok(Number.isFinite(s.altitudeKm)&&Number.isFinite(s.speedKmS)&&Number.isFinite(s.downrangeKm));
 assert.ok(s.altitudeKm>=0&&s.speedKmS>=0&&s.exhaust>=0&&s.exhaust<=1);
 assert.equal(s.phase,Math.max(0,ENERGIA_LAUNCH_EVENTS.findLastIndex(e=>t>=e.at)));
}
assert.equal(sampleEnergiaLaunch(0).altitudeKm,0);
assert.equal(sampleEnergiaLaunch(480).altitudeKm,110);
assert.ok(sampleEnergiaLaunch(-3.2).ignition<sampleEnergiaLaunch(0).ignition);
assert.equal(sampleEnergiaLaunch(479.9).payloadSeparated,false);
assert.equal(sampleEnergiaLaunch(480).payloadSeparated,true);
assert.equal(sampleEnergiaLaunch(511).payloadTurn,true);
assert.equal(sampleEnergiaLaunch(600).failedOrbit,true);
assert.equal(sampleEnergiaLaunch(467.6).exhaust,1);
assert.equal(sampleEnergiaLaunch(477).exhaust,0);
console.log('ENERGIA_LAUNCH_UNIT_PASS '+JSON.stringify({phases:ENERGIA_LAUNCH_EVENTS.length,launch:0,separation:480,altitudeKm:110}));

// Wall-clock time must never get multiplied by the countdown rate after T=0.
assert.equal(advanceEnergiaClock(-2,1,8,1),.75);
assert.equal(advanceEnergiaClock(0,3,8,1),3);
assert.equal(advanceEnergiaClock(-4,.5,8,1),0);
assert.equal(advanceEnergiaClock(-4,1.5,8,1),1);
assert.ok(energiaVisualHeight(sampleEnergiaLaunch(3).altitudeKm)<3,'At T+3 the rocket has only just cleared its mounting');
assert.ok(energiaVisualHeight(sampleEnergiaLaunch(10).altitudeKm)>energiaVisualHeight(sampleEnergiaLaunch(3).altitudeKm));
assert.equal(sampleEnergiaLaunch(-9.4).engines.rd0120,'ЗАПУСК');
assert.equal(sampleEnergiaLaunch(0).ground.umbilicals,'РАССТЫКОВАНЫ');

assert.ok(sampleEnergiaLaunch(-10).ground.water==='ПОДАЧА');
assert.equal(sampleEnergiaLaunch(467.6).engines.rd0120,'ВЫКЛ');
assert.equal(sampleEnergiaLaunch(145.9).engines.rd170,'ВЫКЛ');

// Low frame rate must not slow the actual T+ clock; visibility resets the
// previous timestamp separately in the browser controller.
assert.equal(advanceEnergiaClock(0,1.2,8,1),1.2);
assert.equal(advanceEnergiaClock(-2,1.2,8,1),.95);
