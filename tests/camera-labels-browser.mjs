import assert from 'node:assert/strict';
export async function installCameraLabelProbe(page){
 await page.route('**/*',async route=>{
  if(route.request().resourceType()!=='document')return route.continue();
  const response=await route.fetch(),html=await response.text(),anchor='window.__BAIKONUR_QA={';
  assert(html.includes(anchor),'Diagnostic scene anchor missing');
  await route.fulfill({response,body:html.replace(anchor,'window.__CAMERA_LABEL_TEST={THREE,objects,camera,ctl,renderer,scene,updateLabels,constrainMuseumCamera,museumCameraBounds,flankCameraBounds,krayniyCameraBox,SCENE_SCALE};'+anchor)});
 });
}
export async function checkCameraLabels(page,mode,out){
 const result={thresholds:[],airportViews:[]};
 await page.evaluate(()=>{__BAIKONUR_QA.arrival.stopFollowing();__BAIKONUR_QA.traffic.stopFollowing();__BAIKONUR_QA.mapCameraSmoothing.cancel();__BAIKONUR_QA.setLabelsVisible(true);__BAIKONUR_QA.focusSite('pad-95');document.getElementById('info').style.display='none';});
 for(const h of [301,300,299,131,130,129]){
  const state=await page.evaluate(h=>{
   const d=__CAMERA_LABEL_TEST,g=d.objects.find(o=>o.record.id==='pad-95').g;d.ctl.enableDamping=false;d.ctl.update();g.getWorldPosition(d.ctl.target);d.ctl.target.y=0;
   d.camera.position.set(d.ctl.target.x,h*d.SCENE_SCALE,d.ctl.target.z+h*.6*d.SCENE_SCALE);d.ctl.update();d.camera.updateMatrixWorld(true);d.updateLabels();
   const visible=selector=>[...document.querySelectorAll(selector)].filter(e=>getComputedStyle(e).display!=='none');
   const labels=visible('.site-label'),details=visible('.detail-card');
   return {height:d.camera.position.y/d.SCENE_SCALE,hierarchy:__BAIKONUR_QA.stats().mapHierarchy,numbers:labels.length,details:details.length,compact:labels.every(e=>e.classList.contains('compact'))};
  },h);
  assert(Math.abs(state.height-h)<1e-8,'HUD altitude differs');
  if(h>300){assert.equal(state.numbers,0);assert.equal(state.details,0);}else if(h>130){assert(state.numbers>0,'Numbers missing at '+h);assert.equal(state.details,0);assert(state.compact);}else{assert.equal(state.numbers,0);assert(state.details>0,'Details missing at '+h);}
  result.thresholds.push(state);
  if(h===300||h===130){await page.evaluate(()=>__DELIVERY_FRAME());await page.screenshot({path:out+'/labels-H'+h+'.png',timeout:60000});}
 }
 for(const view of ['all','airside','landside','top','tu204']){
  const r=await page.evaluate(view=>{
   __BAIKONUR_QA.inspectKrayniyTerminal(view);const d=__CAMERA_LABEL_TEST,before=d.ctl.target.clone(),eye=d.camera.position.clone();
   for(let i=0;i<6;i++)d.constrainMuseumCamera();
   return {view,pivotShift:before.distanceTo(d.ctl.target),eyeShift:eye.distanceTo(d.camera.position),camera:__BAIKONUR_QA.cameraState()};
  },view);
  assert(r.pivotShift<1e-6,'Airport view clamped back to flanks: '+view);assert(r.eyeShift<1e-6,'Airport eye displaced: '+view);result.airportViews.push(r);
 }
 result.navigation=await page.evaluate(()=>{
  const d=__CAMERA_LABEL_TEST,box=d.krayniyCameraBox,b=d.museumCameraBounds,old=d.flankCameraBounds;
  // Deliberately select another site: airport access must not depend on an open card.
  __BAIKONUR_QA.focusSite('pad-95');document.getElementById('info').style.display='none';d.ctl.enableDamping=false;d.ctl.update();
  const points=[[box.min.x,box.min.z],[box.max.x,box.min.z],[box.min.x,box.max.z],[box.max.x,box.max.z]],shifts=[];
  for(const [x,z]of points){d.ctl.target.set(x,0,z);d.camera.position.set(x,220,z+170);d.camera.lookAt(d.ctl.target);const t=d.ctl.target.clone();d.constrainMuseumCamera();shifts.push(t.distanceTo(d.ctl.target));}
  d.ctl.target.set(b.maxX+100000,0,b.maxZ+100000);d.camera.position.copy(d.ctl.target).add(new d.THREE.Vector3(0,220,170));d.constrainMuseumCamera();
  return {oldBounds:old,bounds:b,airport:{min:box.min.toArray(),max:box.max.toArray()},cornerShifts:shifts,clamped:__BAIKONUR_QA.cameraState()};
 });
 assert(result.navigation.cornerShifts.every(s=>s<1e-6),'Airport edge unavailable without its card');
 const c=result.navigation.clamped,[x,y,z]=c.position,[tx,,tz]=c.target,b=c.bounds,p=c.positionBounds;
 assert(tx>=b.minX-1e-6&&tx<=b.maxX+1e-6&&tz>=b.minZ-1e-6&&tz<=b.maxZ+1e-6,'Pivot escaped limits');
 assert(x>=p.minX-1e-6&&x<=p.maxX+1e-6&&z>=p.minZ-1e-6&&z<=p.maxZ+1e-6,'Eye escaped limits');assert(y>=c.heightBounds.min);
 await page.evaluate(()=>{__BAIKONUR_QA.inspectKrayniyTerminal('airside');__DELIVERY_FRAME();});
 await page.screenshot({path:out+'/krayniy-restored.png',timeout:60000});
 if(mode==='workshop'){assert(await page.locator('#cameraAltitude').isVisible());assert(await page.locator('#workshopPanel').isVisible());}
 result.passed=true;return result;
}
