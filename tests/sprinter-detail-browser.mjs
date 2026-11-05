import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-sprinter';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'tests/sprinter-fixture.html');await page.waitForSelector('body[data-ready]',{state:'attached',timeout:90000});assert.equal(await page.locator('body').getAttribute('data-ready'),'true',await page.locator('#result').textContent());
 for(const [view,label]of [['front','Спереди'],['rear','Сзади'],['hood','Капот'],['side','Борт']]){
  await page.getByRole('button',{name:label,exact:true}).click();await page.screenshot({path:`${out}/${prefix}-detail-${view}.png`});
 }
 await page.getByRole('button',{name:'Сзади',exact:true}).click();await page.getByRole('button',{name:'Ночь',exact:true}).click();await page.screenshot({path:`${out}/${prefix}-detail-night.png`});
 const result=await page.evaluate(()=>({state:window.__SPRINTER_DETAIL_TEST.state,stats:window.__SPRINTER_DETAIL_TEST.stats()}));
 assert.equal(result.state.detailVersion,'sprinter-photo-detail-v2');assert.equal(result.stats.decals.length,4);assert(result.stats.decals.every(d=>d.triangles>100&&d.depthWrite&&d.alphaTest>0));assert(result.stats.triangles<280000);assert(result.stats.drawCalls<45);assert.deepEqual(errors,[]);
 await writeFile(`${out}/${prefix}-detail-result.json`,JSON.stringify({passed:true,...result,errors},null,2));
}catch(error){await writeFile(`${out}/${prefix}-detail-failure.json`,JSON.stringify({error:error.message,errors,body:await page.locator('body').innerText()},null,2));await page.screenshot({path:`${out}/${prefix}-detail-failure.png`});throw error;}finally{await browser.close();}
