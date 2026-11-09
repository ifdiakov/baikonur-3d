import assert from 'node:assert/strict';
export async function verifyEveningNavigation(page,{mode,out}){
 const report={permanentEvening:false,followBounds:false,nestedTraditions:false};
 assert.equal(await page.locator('#museumLightSwitch,#museumDayMode,#museumNightMode').count(),0);
 await page.evaluate(()=>__BAIKONUR_QA.evening.setEvening(false));
 assert.equal(await page.evaluate(()=>__BAIKONUR_QA.evening.evening),true);
 assert.equal(await page.evaluate(()=>__BAIKONUR_QA.arrival.stats().appearance.night),true);
 report.permanentEvening=true;
 await page.evaluate(()=>{const q=__BAIKONUR_QA;q.arrival.stopFollowing();q.arrival.seek(0);window.__RESTORE_FRAME();});
 assert(await page.locator('#arrivalFollow').isDisabled());
 assert.equal(await page.locator('#arrivalFollow').getAttribute('aria-disabled'),'true');
 const cameraBefore=await page.evaluate(()=>__BAIKONUR_QA.cameraState().position);
 await page.evaluate(()=>{document.getElementById('arrivalFollow').click();__BAIKONUR_QA.arrival.setFollowing(true);});
 assert.equal(await page.evaluate(()=>__BAIKONUR_QA.arrival.stats().following),false);
 assert.deepEqual(await page.evaluate(()=>__BAIKONUR_QA.cameraState().position),cameraBefore);
 const samples=await page.evaluate(()=>{const q=__BAIKONUR_QA,b=q.cameraState().bounds,p=q.arrival.path,inside=t=>{const s=p.sample(t),v=s.position;return s.visible&&v.x>=b.minX&&v.x<=b.maxX&&v.z>=b.minZ&&v.z<=b.maxZ;};const intervals=[];for(let t=0;t<p.duration;t++)if(inside(t)&&!inside(t-1))intervals.push(t);return intervals;});
 assert(samples.length>=2,'Both arrivals cross the museum footprint');
 for(const t of samples){
  await page.evaluate(t=>__BAIKONUR_QA.arrival.seek(t+1),t);
  assert(await page.locator('#arrivalFollow').isEnabled());
  await page.locator('#arrivalFollow').click();
  assert.equal(await page.evaluate(()=>__BAIKONUR_QA.arrival.stats().following),true);
  await page.evaluate(()=>{__BAIKONUR_QA.arrival.seek(380);window.__RESTORE_FRAME();});
  assert(await page.locator('#arrivalFollow').isDisabled());
  assert.equal(await page.evaluate(()=>__BAIKONUR_QA.arrival.stats().following),false);
  const c=await page.evaluate(()=>__BAIKONUR_QA.cameraState());
  for(const [axis,min,max] of [[0,'minX','maxX'],[2,'minZ','maxZ']])assert(c.position[axis]>=c.positionBounds[min]-.01&&c.position[axis]<=c.positionBounds[max]+.01);
 }
 await page.evaluate(()=>{__BAIKONUR_QA.arrival.seek(150);__BAIKONUR_QA.arrival.setSuppressed(true);});assert(await page.locator('#arrivalFollow').isDisabled());
 await page.evaluate(()=>__BAIKONUR_QA.arrival.setSuppressed(false));assert(await page.locator('#arrivalFollow').isEnabled());
 await page.locator('#arrivalReplay').click();assert(await page.locator('#arrivalFollow').isDisabled());
 report.followBounds=true;report.arrivalEntries=samples;
 assert.equal(await page.locator('#ui > #traditionsAccordion').count(),0);
 assert.equal(await page.locator('#mythsAccordion #traditionsAccordion').count(),1);
 assert.equal(await page.locator('#traditionsAccordion.museum-section').count(),0);
 if(mode==='mobile')await page.locator('#mobileMenuToggle').click();
 await page.locator('#mythsAccordion > summary').click();
 assert.equal(await page.locator('#traditionsAccordion').evaluate(e=>e.open),false);
 await page.locator('#traditionsAccordion > summary').click();
 assert.equal(await page.locator('#mythsAccordion').evaluate(e=>e.open),true);
 assert.equal(await page.locator('#traditionsAccordion').evaluate(e=>e.open),true);
 assert(await page.locator('#traditionsAccordion [data-museum-action="story:coins-under-tua"]').isVisible());
 assert.equal(await page.locator('#mythsAccordion [data-museum-action]').count(),4);
 assert.equal(await page.locator('#mythsAccordion > summary .sites-accordion-count').textContent(),'4');
 await page.evaluate(()=>{__BAIKONUR_QA.showOverview();window.__RESTORE_FRAME();});
 await page.screenshot({path:out+'/'+mode+'-evening-menu.png',timeout:180000});
 await page.locator('#traditionsAccordion [data-museum-action="story:coins-under-tua"]').click();
 await page.waitForFunction(()=>document.querySelector('#info')?.textContent.includes('Монет'));
 assert.equal(await page.evaluate(()=>__BAIKONUR_QA.menu.stats().lastAction),'story:coins-under-tua');
 report.nestedTraditions=true;
 await page.evaluate(()=>{document.getElementById('close')?.click();document.getElementById('mythsAccordion').open=false;document.getElementById('traditionsAccordion').open=false;});
 if(mode==='desktop'){
  await page.evaluate(()=>__BAIKONUR_QA.buranLanding.start());
  assert.equal(await page.evaluate(()=>__BAIKONUR_QA.stats().buranLandingScene.evening),true);
  assert(await page.locator('#arrivalFollow').isDisabled());
  await page.evaluate(()=>__BAIKONUR_QA.buranLanding.stop());
  assert.equal(await page.evaluate(()=>__BAIKONUR_QA.evening.evening),true);
  report.buranEvening=true;
 }
 await page.evaluate(()=>{__BAIKONUR_QA.arrival.seek(150);__BAIKONUR_QA.showOverview();window.__RESTORE_FRAME();});
 return report;
}
