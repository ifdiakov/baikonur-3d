import assert from 'node:assert/strict';
import {nozzleFlameMaterial,ENERGIA_PLASMA_VERSION} from '../src/energia-plasma-shader.js';
import {ENERGIA_LAUNCH_EVENTS,ENERGIA_LAUNCH_END,ENERGIA_LAUNCH_START,sampleEnergiaLaunch,advanceEnergiaClock,energiaVisualHeight,sampleEnergiaEnginePlumes,sampleEnergiaPadDissipation,sampleEnergiaDuctFire,sampleEnergiaSteamSpread,sampleEnergiaPlumeBottomFade,energiaCameraHeightUnits,shouldDetachEnergiaCamera,ENERGIA_CAMERA_DETACH_UNITS} from '../src/energia-polyus-launch.js';
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

for(const time of [-90,-9.4,-5.4,-3.2,0,3,144,145.9,146,467.6,469.2]){
 const p=sampleEnergiaEnginePlumes(time);
 assert.equal(p.nozzleCount,8);
 assert.equal(p.coreNozzles,4);assert.equal(p.boosterNozzles,4);
 assert.ok(p.core>=0&&p.core<=1&&p.boosters>=0&&p.boosters<=1);
}
assert.equal(sampleEnergiaEnginePlumes(-9.4).core,0);
assert.equal(sampleEnergiaEnginePlumes(-5.4).core,1);
assert.equal(sampleEnergiaEnginePlumes(-3.2).boosters,0);
assert.equal(sampleEnergiaEnginePlumes(0).boosters,1);
assert.equal(sampleEnergiaEnginePlumes(146).boosters,0);
assert.equal(sampleEnergiaEnginePlumes(469.2).core,0);

// The physical nozzle power remains independently timed when the effects
// switch on heavy shadow maps and denser billboards.
assert.equal(sampleEnergiaEnginePlumes(0).nozzleCount,8);
assert.equal(sampleEnergiaEnginePlumes(150).boosters,0);
assert.equal(sampleEnergiaEnginePlumes(150).core,1);

assert.deepEqual(sampleEnergiaPadDissipation(0),{fire:1,smoke:1});
assert.deepEqual(sampleEnergiaPadDissipation(100),{fire:1,smoke:1});
assert.ok(sampleEnergiaPadDissipation(101).fire<1,'Pad fire must begin fading once above 100m');
assert.ok(sampleEnergiaPadDissipation(101).smoke<1,'Pad smoke must begin fading once above 100m');
assert.ok(sampleEnergiaPadDissipation(200).fire>0&&sampleEnergiaPadDissipation(200).fire<1);
assert.ok(sampleEnergiaPadDissipation(200).smoke>0&&sampleEnergiaPadDissipation(200).smoke<1);
assert.deepEqual(sampleEnergiaPadDissipation(360).fire,0);
assert.deepEqual(sampleEnergiaPadDissipation(800),{fire:0,smoke:0});
assert.deepEqual(sampleEnergiaPadDissipation(4000),{fire:0,smoke:0});

// The short ground flare has its own time envelope. Rocket exhaust and the
// residual smoke keep their independent engine/height-dependent lifetimes.
for(const time of [-90,-22,-10,-9.4])assert.equal(sampleEnergiaDuctFire(time),0,
 'The duct must not burn before engine ignition');
assert.equal(sampleEnergiaDuctFire(0),1,'Ground flare peaks at liftoff');
assert.ok(sampleEnergiaDuctFire(2)>0&&sampleEnergiaDuctFire(2)<1,
 'The duct flare must already be fading two seconds after liftoff');
for(const time of [4,6,20,30,146,480,600])assert.equal(sampleEnergiaDuctFire(time),0,
 'The short duct flare must end by T+4 and never return later in the flight');
let lastDuctPower=1;
for(let tick=0;tick<=80;tick++){
 const power=sampleEnergiaDuctFire(tick/20);
 assert.ok(Number.isFinite(power)&&power>=0&&power<=1);
 assert.ok(power<=lastDuctPower,'Post-liftoff ground flare fades without a second surge');
 lastDuctPower=power;
}
assert.ok(Math.abs(sampleEnergiaDuctFire(-.001)-sampleEnergiaDuctFire(.001))<.01,
 'The liftoff boundary does not introduce an abrupt flare jump');
assert.ok(sampleEnergiaDuctFire(3.999)<.01,'The last visible flame fades before switching off');
const ductTimes=[-90,-9.4,-5.4,-3.2,0,2,4,20,600];
const ductFirst=ductTimes.map(sampleEnergiaDuctFire);
const ductReplay=[...ductTimes].reverse().map(sampleEnergiaDuctFire).reverse();
assert.deepEqual(ductReplay,ductFirst,'Seeking and replay reproduce the same short flare');
assert.equal(sampleEnergiaEnginePlumes(6).core,1,'The ascending rocket keeps its core exhaust');
assert.equal(sampleEnergiaEnginePlumes(6).boosters,1,'The ascending rocket keeps its booster exhaust');
assert.equal(sampleEnergiaPadDissipation(sampleEnergiaLaunch(6).altitudeKm*1000).smoke,1,
 'Smoke continues after the brief flame in the duct has ended');
console.log('ENERGIA_SHORT_DUCT_FIRE_PASS '+JSON.stringify({peak:sampleEnergiaDuctFire(0),mid:sampleEnergiaDuctFire(2),end:sampleEnergiaDuctFire(4)}));

const early=sampleEnergiaSteamSpread(-90),near=sampleEnergiaSteamSpread(-1);
const firstVents=sampleEnergiaSteamSpread(-65),laterVents=sampleEnergiaSteamSpread(-25);
assert.equal(early.presence,0,'T-90 must begin without steam around the rocket');
assert.ok(firstVents.presence>0&&firstVents.presence<laterVents.presence,
 'Steam must appear gradually rather than popping in at scene start');
assert.ok(laterVents.presence<near.presence,'Vapor still builds approaching T=0');
assert.ok(near.radius>early.radius*3,'Steam spreads laterally across the apron');
assert.ok(near.radius<65,'The cloud must remain smaller than the old 148-unit halo');
assert.ok(near.drift>early.drift*4,'Ground-level flow gradually becomes more irregular');
assert.ok(near.rise<=23&&near.groundBias>2,
 'Most of the steam must hug the ground rather than surrounding the rocket');
assert.ok(near.transparency<early.transparency&&near.transparency<=.36,
 'Final vent cloud must be more transparent than the old version');
assert.ok(sampleEnergiaPlumeBottomFade(.25,280,8)>sampleEnergiaPlumeBottomFade(.96,280,8),
 'The oldest, low end of a smoke plume must dissolve irregularly');
assert.equal(sampleEnergiaPlumeBottomFade(.7,-80,4),0,'The plume cannot leave a hard smoke plane underground');
assert.notEqual(sampleEnergiaPlumeBottomFade(.7,40,3),sampleEnergiaPlumeBottomFade(.7,40,9),
 'Each billow must have a different dissolution envelope');
assert.equal(ENERGIA_CAMERA_DETACH_UNITS,100);
assert.ok(energiaCameraHeightUnits(sampleEnergiaLaunch(30).altitudeKm)<100);
assert.ok(energiaCameraHeightUnits(sampleEnergiaLaunch(90).altitudeKm)>100);
assert.equal(shouldDetachEnergiaCamera(sampleEnergiaLaunch(30).altitudeKm),false);
assert.equal(shouldDetachEnergiaCamera(sampleEnergiaLaunch(90).altitudeKm),true);
console.log('ENERGIA_CINEMATIC_FX_PASS');

const nozzleMaterial=nozzleFlameMaterial(0xffb45d);
assert.equal(nozzleMaterial.depthTest,true,'Exhaust remains behind solid launch hardware');
assert.equal(nozzleMaterial.depthWrite,false,'Transparent glow does not create hard depth silhouettes');
assert.match(nozzleMaterial.vertexShader,/logdepthbuf_vertex/);
assert.match(nozzleMaterial.fragmentShader,/logdepthbuf_fragment/);
assert.match(nozzleMaterial.vertexShader,/tailChaos/,'Tail needs physical vertex turbulence');
assert.match(nozzleMaterial.fragmentShader,/topLimit/,'Nozzle collar must be bounded by alpha');
assert.match(nozzleMaterial.fragmentShader,/lowerCut/,'Tail must dissolve at staggered heights');
assert.ok(!('uRibbon' in nozzleMaterial.uniforms),'Ray-like crossing ribbon shader controls are removed');
assert.match(ENERGIA_PLASMA_VERSION,/soft-nozzle-frayed-tail/);
nozzleMaterial.dispose();
console.log('ENERGIA_NO_UPPER_RAYS_PASS');
