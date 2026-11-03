import { chromium } from 'playwright';
import {mkdir} from 'node:fs/promises';
const url=process.env.BAIKONUR_URL||'https://ifdiakov.github.io/baikonur-3d/?qa=live-startup-20261103';
const browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl',
 '--enable-unsafe-swiftshader','--disable-gpu-sandbox'
]});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const events={pageErrors:[],consoleErrors:[],failed:[],httpErrors:[],responseSizes:[]};
const report=message=>console.log('LIVE_STARTUP_DIAG '+JSON.stringify(message));
page.on('pageerror',e=>{events.pageErrors.push({message:e.message,stack:e.stack?.slice(0,1200)});report({kind:'pageerror',message:e.message,stack:e.stack?.slice(0,1200)});});
page.on('console',m=>{
 if(m.type()==='error'||m.type()==='warning'){
  const v=m.text().slice(0,900);events.consoleErrors.push({type:m.type(),message:v});
  if(events.consoleErrors.length<=35)report({kind:'console',type:m.type(),message:v});
 }
});
page.on('requestfailed',r=>{events.failed.push({url:r.url(),reason:r.failure()?.errorText});if(events.failed.length<=25)report({kind:'requestfailed',url:r.url(),reason:r.failure()?.errorText});});
page.on('response',r=>{if(r.status()>=400){events.httpErrors.push({url:r.url(),status:r.status()});if(events.httpErrors.length<=25)report({kind:'http',url:r.url(),status:r.status()});}});
let response;
try{
 response=await page.goto(url,{waitUntil:'commit',timeout:25000});
 report({kind:'document',requested:url,final:page.url(),status:response?.status()});
 for(const ms of [1000,3000,6500,13000,22000,35000]){
  await page.waitForTimeout(ms===1000?1000:ms-[1000,3000,6500,13000,22000,35000][[1000,3000,6500,13000,22000,35000].indexOf(ms)-1]);
  const state=await page.evaluate(()=>{
   const loader=document.querySelector('#museumLoading'),progress=document.querySelector('#museumStageProgress');
   const stat=window.__MUSEUM_STARTUP?.stats?.();
   return{
    state:loader?.dataset.state,hidden:loader?.hidden,step:loader?.dataset.launchStep,
    message:document.querySelector('#museumLoadingMessage')?.textContent?.slice(0,200),
    progress:progress?.getAttribute('aria-valuenow'),
    stage:document.querySelector('#museumLaunchStatus')?.textContent?.slice(0,130),
    qs:!!window.__BAIKONUR_QA,loadingReady:document.body.classList.contains('museum-ready'),
    errorElement:document.querySelector('#error')?.textContent?.slice(0,180),
    canvasCount:document.querySelectorAll('canvas').length,
    render:window.__BAIKONUR_QA?.renderStats?.(),
    startup:stat?{interactive:stat.interactive,queued:stat.queued,active:stat.active,taskStates:stat.tasks?.slice(0,15).map(t=>({key:t.key,state:t.state}))}:null
   };
  });
  report({kind:'status',elapsed:ms,...state});
  if(state.state==='ready'||state.state==='error')break;
 }
 await mkdir('qa-live-startup',{recursive:true});
 await page.screenshot({path:'qa-live-startup/production.png',timeout:16000}).catch(()=>{});
 const status=await page.evaluate(()=>document.querySelector('#museumLoading')?.dataset.state);
 report({kind:'summary',state:status,events});
 if(status!=='ready')process.exitCode=2;
}catch(e){report({kind:'exception',message:e.message,stack:e.stack?.slice(0,1200),events});process.exitCode=2;}
finally{await browser.close();}
