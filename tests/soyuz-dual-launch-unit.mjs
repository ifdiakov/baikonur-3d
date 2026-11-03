import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Pure launch sampling is intentionally dependency-free. Extract the top-level
// module exports without requiring the WebGL renderer or network assets.
const source=readFileSync(new URL('../src/soyuz-dual-launch.js',import.meta.url),'utf8');
const evaluate=source.replace(/^import .*?;\s*$/gm,'').replace(/^export\s+(?=(const|function)\b)/gm,'');
const {SOYUZ_START,SOYUZ_END,SOYUZ_EVENTS,sampleSoyuzLaunch}=new Function(evaluate+';return {SOYUZ_START,SOYUZ_END,SOYUZ_EVENTS,sampleSoyuzLaunch};')();
assert.equal(SOYUZ_START,-75);
assert.equal(SOYUZ_END,70);
assert.equal(sampleSoyuzLaunch(-75).venting,0,'Prelaunch opens without smoke');
assert.equal(sampleSoyuzLaunch(-75).supportOpen,0);
assert.equal(sampleSoyuzLaunch(-1).supportOpen,0,'Support arms do not open before lift-off');
assert.equal(sampleSoyuzLaunch(-1).altitudeMetres,0);
assert.equal(sampleSoyuzLaunch(0).supportOpen,0,'Arms begin to move only at lift-off');
assert.ok(sampleSoyuzLaunch(1).supportOpen>0,'Arms open under decreasing rocket weight');
assert.equal(sampleSoyuzLaunch(3).supportOpen,1,'Arms fully open early in ascent');
assert.ok(sampleSoyuzLaunch(-19).enginePower>0);
assert.ok(sampleSoyuzLaunch(-15).enginePower>sampleSoyuzLaunch(-19).enginePower);
assert.ok(sampleSoyuzLaunch(0).enginePower>sampleSoyuzLaunch(-3).enginePower);
assert.equal(sampleSoyuzLaunch(-60).firstColumnOpen,0);
assert.ok(sampleSoyuzLaunch(-54).firstColumnOpen>0);
assert.equal(sampleSoyuzLaunch(-45).firstColumnOpen,1);
assert.equal(sampleSoyuzLaunch(-16).secondColumnOpen,0);
assert.ok(sampleSoyuzLaunch(-10).secondColumnOpen>0);
assert.equal(sampleSoyuzLaunch(-5).secondColumnOpen,1);
assert.ok(sampleSoyuzLaunch(-40).serviceRetraction>0);
assert.equal(sampleSoyuzLaunch(-35).serviceRetraction,1);
for(let t=SOYUZ_START;t<=SOYUZ_END;t+=.25){
 const a=sampleSoyuzLaunch(t),b=sampleSoyuzLaunch(t);
 assert.deepEqual(a,b,'Phase and visual state must be deterministic for seeking');
 assert.equal(a.phase,Math.max(0,SOYUZ_EVENTS.findLastIndex(e=>t>=e.at)));
 assert.ok(Number.isFinite(a.altitudeMetres)&&a.altitudeMetres>=0);
 for(const key of ['enginePower','supportOpen','serviceRetraction','firstColumnOpen','secondColumnOpen','umbilicalRelease','venting','smoke'])assert.ok(a[key]>=0&&a[key]<=1, key+' at '+t);
}
assert.ok(sampleSoyuzLaunch(40).altitudeMetres>sampleSoyuzLaunch(20).altitudeMetres);
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const menu=readFileSync(new URL('../src/museum-menu.js',import.meta.url),'utf8');
for(const needle of ['soyuz-dual-launch.js','soyuz-dual-launch.css','requestSoyuzLaunch','soyuzLaunch?.update(now)','soyuzLaunch?.stats()','soyuz-launch-1','soyuz-launch-31'])
 assert.ok((index+menu).includes(needle),'Missing live integration: '+needle);
assert.ok(source.includes('createSoyuzPneumaticColumns'),'Real hinged pneumatic columns must be active');
const sourceEffects=readFileSync(new URL('../src/soyuz-launch-effects.js',import.meta.url),'utf8');
const sourceColumns=readFileSync(new URL('../src/soyuz-launch-columns.js',import.meta.url),'utf8');
assert.ok(!/SphereGeometry|IcosahedronGeometry/.test(sourceEffects),'Smoke must not use spheres');
assert.ok(sourceEffects.includes('nozzleFlameMaterial'),'Use animated plasma shader for engine exhaust');
assert.ok(sourceEffects.includes('holder.add(flame)'),'Flame must follow rocket');
assert.ok(sourceColumns.includes('rotation.z'),'Pneumatic towers rotate about horizontal hinges');
assert.ok(sourceColumns.includes('maskSourceStaticColumns'),'Sourced static columns must be suppressed when moving');
console.log('SOYUZ_DUAL_LAUNCH_PASS',JSON.stringify({phases:SOYUZ_EVENTS.length,pads:['pad-1','pad-31'],testedSamples:(SOYUZ_END-SOYUZ_START)*4+1}));
