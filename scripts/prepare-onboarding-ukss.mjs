import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
const version='20261113-onboarding-ukss-v1';
const update=(path,fn)=>{const before=read(path,'utf8'),after=fn(before);if(after!==before)write(path,after);};
const once=(s,a,b)=>{if(s.includes(b))return s;assert.equal(s.split(a).length,2,'Missing or duplicate anchor: '+a.slice(0,80));return s.replace(a,b);};
update('src/museum-onboarding.js',s=>{
 s=s.replaceAll('focusGagarin','focusUkss').replace('Tour: could not focus Gagarin launch site','Tour: could not focus UKSS');
 s=once(s,"hint: 'Выберите объект на карте, чтобы открыть его историю и 3D-модель.'","hint: 'УКСС «Энергия»: выберите объект на карте, чтобы открыть его историю и 3D-модель.'");
 s=once(s,'  function runMove() {','  function runMove(complete = false) {');
 s=once(s,'const t = Math.max(0, Math.min(1, (elapsed - move.at) / move.duration));','const t = complete ? 1 : Math.max(0, Math.min(1, (elapsed - move.at) / move.duration));');
 s=once(s,'    currentStage = i;','    // Finish a camera leg before the next stage replaces it, even after a dropped frame.\n    if (move) runMove(true);\n    currentStage = i;');
 return s;
});
for(const file of ['index.html','museum.html','workshop.html'])update(file,s=>{
 s=once(s,'focusGagarin:()=>focus(0)',"focusUkss:()=>openMenuSite('pad-250')");
 return s.replace(/(museum-onboarding\.js\?v=)[\w.-]+/g,(_,prefix)=>prefix+version);
});
update('tests/onboarding-flank-flyover.mjs',s=>{
 s=s.replaceAll('focusGagarin(){','focusUkss(){').replace('Gagarin focus','UKSS focus');
 s=once(s,'tour.update(20100);assert.equal(tour.stats().step,4);',"tour.update(20100);assert.equal(tour.stats().step,4);\nassert.equal(controls.target.distanceTo(new V(190,0,220)),0,'The orbit must start at the exact UKSS destination, not an unfinished flight point');\nassert(camera.position.distanceTo(new V(200,100,300))<1e-9,'The completed flight must reach the UKSS eye pose');");
 if(!s.includes('ONBOARDING_UKSS_ROUTE_PASS'))s+=`\n// One site ID in every entrypoint; no dependency on catalogue ordering.\nfor(const file of ['index.html','museum.html','workshop.html']){\n const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');\n assert(html.includes(\"focusUkss:()=>openMenuSite('pad-250')\"),file+' uses stable UKSS ID');\n assert(!html.includes('focusGagarin:'),file+' must not register the old target');\n assert(html.includes('museum-onboarding.js?v=${version}'),file+' cache revision');\n}\nassert(source.includes('УКСС «Энергия»'));\nassert(!source.includes('focusGagarin'));\n// A late frame in the approach must still start the fly-around at the UKSS.\ncamera.position.copy(initialEye);controls.target.copy(initialTarget);\nassert(tour.replay());\nfor(const at of [40000,43000,48000,54000,57000,61000])tour.update(at);\nassert.equal(tour.stats().step,4);\nassert.equal(controls.target.distanceTo(new V(190,0,220)),0);\ntour.update(65000);tour.update(69000);\nassert.equal(camera.position.distanceTo(initialEye),0);\nassert.equal(controls.target.distanceTo(initialTarget),0);\nassert.equal(controls.enabled,true);\nconsole.log('ONBOARDING_UKSS_ROUTE_PASS');\n`;
 return s;
});
update('tests/delivery-smoke.mjs',s=>{
 if(s.includes('checkOnboardingRoute'))return s;
 s="import {checkOnboardingRoute} from './onboarding-route-browser.mjs';\n"+s;
 s=once(s,"cameraLabels=process.env.QA_CAMERA_LABELS==='1';","cameraLabels=process.env.QA_CAMERA_LABELS==='1',onboardingRoute=process.env.QA_ONBOARDING_ROUTE==='1';");
 s=once(s,"'src/map-visible-sites.js',...(cameraLabels?","'src/map-visible-sites.js',...(onboardingRoute?['src/museum-onboarding.js']:[]),...(cameraLabels?");
 return once(s,' if(cameraLabels)report.cameraLabels=await checkCameraLabels(page,mode,out);',' if(onboardingRoute)report.onboardingRoute=await checkOnboardingRoute(page,mode,out);\n if(cameraLabels)report.cameraLabels=await checkCameraLabels(page,mode,out);');
});
assert.equal(read('index.html','utf8'),read('museum.html','utf8'));
console.log('ONBOARDING_UKSS_PREPARED');
