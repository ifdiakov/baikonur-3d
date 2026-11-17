import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../src/museum-preloader.js',import.meta.url),'utf8');
function scenario({mobile,reduced}){
 let now=0,id=0;const timers=new Map(),listeners=new Map();
 const element=()=>{const classes=new Set();return {dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},setAttribute(){},addEventListener(){},removeEventListener(){}};};
 const root=element(),phrases=Array.from({length:8},element),images=Array.from({length:6},()=>Object.assign(element(),{complete:true,naturalWidth:960}));
 root.querySelectorAll=s=>s.includes('Feature')?phrases:images;
 const document={hidden:false,getElementById:id=>id==='museumLoading'?root:null,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener(){}};
 const media=q=>({matches:q.includes('max-width')?mobile:reduced,addEventListener(){},removeEventListener(){}});
 const window={matchMedia:media,setTimeout:(f,ms)=>{timers.set(++id,{f,at:now+ms});return id;},clearTimeout:i=>timers.delete(i),requestAnimationFrame:f=>window.setTimeout(f,16),cancelAnimationFrame:i=>timers.delete(i)};
 vm.runInNewContext(code,{window,document,performance:{now:()=>now},Promise,Number,Boolean,Array,Math,Object,String});
 const tick=ms=>{const until=now+ms;while(true){const next=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].f();}now=until;};
 const active=es=>es.findIndex(e=>e.classList.contains('is-active'));
 assert(root.classList.contains('is-timed'));
 tick(3000);assert.equal(active(phrases),1);assert.equal(active(images),0);
 tick(1000);assert.equal(active(images),1);
 tick(20000);assert.equal(active(phrases),0);assert.equal(active(images),0);
 document.hidden=true;listeners.get('visibilitychange')();tick(8000);assert.equal(active(phrases),0);assert.equal(active(images),0);
 document.hidden=false;listeners.get('visibilitychange')();tick(4000);assert.equal(active(phrases),1);assert.equal(active(images),1);
 window.__MUSEUM_PRELOADER.destroy();tick(12000);assert.equal(active(phrases),1);assert.equal(active(images),1);assert.equal(timers.size,0);
}
scenario({mobile:true,reduced:false});scenario({mobile:true,reduced:true});scenario({mobile:false,reduced:true});
console.log('PRELOADER_CONTENT_CYCLE_PASS: 3s/4s, wraparound, reduced motion, visibility resume, cleanup');
