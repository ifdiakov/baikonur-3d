import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

class V {
 constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
 clone(){return new V(this.x,this.y,this.z);}
 copy(o){this.x=o.x;this.y=o.y;this.z=o.z;return this;}
 add(o){this.x+=o.x;this.y+=o.y;this.z+=o.z;return this;}
 sub(o){this.x-=o.x;this.y-=o.y;this.z-=o.z;return this;}
 set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
 setY(y){this.y=y;return this;}
 multiplyScalar(n){this.x*=n;this.y*=n;this.z*=n;return this;}
 addScaledVector(o,n){this.x+=o.x*n;this.y+=o.y*n;this.z+=o.z*n;return this;}
 lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}
 normalize(){const n=Math.sqrt(this.lengthSq());if(n)this.multiplyScalar(1/n);return this;}
 lerp(o,t){this.x+=(o.x-this.x)*t;this.y+=(o.y-this.y)*t;this.z+=(o.z-this.z)*t;return this;}
 distanceTo(o){return Math.hypot(this.x-o.x,this.y-o.y,this.z-o.z);}
}

function node(){
 const attributes=new Map(),classes=new Set(),children=new Map();
 return {
  hidden:false,style:{},textContent:'',innerHTML:'',open:false,
  children,attributes,handlers:new Map(),
  classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},
  querySelector:k=>children.get(k)??null,appendChild(child){this.lastChild=child;},
  addEventListener(k,handler){this.handlers.set(k,handler);},
  setAttribute(k,v){attributes.set(k,String(v));},getAttribute:k=>attributes.get(k),
  getClientRects:()=>[{}]
 };
}
const ids=new Map(),loader=node(),body=node();
loader.hidden=true;
body.classList.add('museum-ready');
ids.set('museumLoading',loader);
for(const id of ['info','sitesAccordion','reconstructionsAccordion','mobileMenuToggle'])ids.set(id,node());
const guide=node(),replayHost=node();
guide.querySelector=selector=>selector==='.navigation-guide-content'?replayHost:null;
ids.set('navigationGuide',guide);
const document={
 readyState:'complete',body,events:new Map(),
 createElement(){const root=node();root.children.set('.museum-tour__title',node());root.children.set('.museum-tour__text',node());
  root.children.set('.museum-tour__step',node());root.children.set('.museum-tour__skip',node());
  root.children.set('.museum-tour__fill',node());root.children.set('[role="progressbar"]',node());return root;},
 getElementById:k=>ids.get(k)??null,
 querySelector:k=>k==='#navigationGuide .navigation-guide-content'?replayHost:null,
 addEventListener(k,fn){this.events.set(k,fn);}
};
const frames=[],location={search:'?tour=1'},storage=new Map();
const window={
 matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>(frames.push(fn),frames.length),
 localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}
};
const context={window,document,location,navigator:{webdriver:false},localStorage:window.localStorage,
 URLSearchParams,console,Math,requestAnimationFrame:window.requestAnimationFrame};
const source=readFileSync(new URL('../src/museum-onboarding.js',import.meta.url),'utf8');
vm.runInNewContext(source,context,{filename:'museum-onboarding.js'});
const tour=window.__MUSEUM_ONBOARDING;
assert(tour,'The global onboarding controller must exist');
assert.equal(tour.stats().durationMs,29000);
assert.equal(tour.stats().flankFlyoverMs,3000);
const initialEye=new V(0,2814,2814),initialTarget=new V(0,0,0);
const camera={position:initialEye.clone(),lookAt(){},updateMatrixWorld(){}};
const controls={target:initialTarget.clone(),enabled:true,enableDamping:true,update(){}};
let focused=0;
tour.attach({camera,controls,
 flankTourPose(){return {eye:new V(0,760*2.3448276,760*2.3448276),target:new V(0,0,0)};},
 focusGagarin(){focused++;camera.position.set(200,100,300);controls.target.set(190,0,220);},
 isObjectFocused:()=>false
});
tour.ready();
assert.equal(tour.stats().pendingStart,true);
for(let i=0;i<3;i++){const jobs=frames.splice(0);jobs.forEach(fn=>fn());}
assert.equal(tour.stats().active,true,'Tour must start immediately after the revealed scene frame');
tour.update(100);
assert.equal(tour.stats().step,0);
assert.equal(tour.stats().flyingFlanks,true);
tour.update(1100);const zoomEye=camera.position.clone();
assert(zoomEye.y<initialEye.y,'Opening sequence must zoom toward the flanks');
tour.update(2600);
const flyEye=camera.position.clone(),flyTarget=controls.target.clone();
assert(flyTarget.x>0&&flyTarget.z<0,'The second half must travel horizontally above the cosmodrome');
assert(flyEye.y<initialEye.y);
tour.update(3100);
assert.equal(tour.stats().step,1,'Flank intro must end at 3 seconds');
assert.equal(tour.stats().flyingFlanks,false);
assert.equal(focused,0,'Gagarin focus must not interrupt the opening flyover');
tour.update(8100);assert.equal(tour.stats().step,2);
tour.update(14100);assert.equal(tour.stats().step,3);assert.equal(focused,1);
tour.update(20100);assert.equal(tour.stats().step,4);
tour.update(25100);assert.equal(tour.stats().step,5);
tour.update(29100);assert.equal(tour.stats().active,false);
assert.equal(camera.position.distanceTo(initialEye),0,'Natural completion must restore the original camera eye');
assert.equal(controls.target.distanceTo(initialTarget),0,'Natural completion must restore the original look-at');
assert.equal(controls.enabled,true);
assert.match(replayHost.lastChild?.textContent||'','29 СЕК');
assert.equal(storage.get('baikonur-museum-onboarding-v2'),'yes');

// A visitor who interrupts the intro stays at the observed camera pose.
camera.position.copy(initialEye);controls.target.copy(initialTarget);
assert.equal(tour.replay(),true);
tour.update(31000);tour.update(31900);const interrupted=camera.position.clone();
tour.skip();assert.equal(tour.stats().active,false);
assert.equal(camera.position.distanceTo(interrupted),0,'Skip must never snap back to overview');
assert.equal(controls.enabled,true);
console.log('ONBOARDING_FLANK_FLYOVER_PASS',JSON.stringify({introMs:3000,totalMs:29000,steps:6,
 zoomDelta:Math.round(initialEye.y-zoomEye.y),flyTarget:[flyTarget.x,flyTarget.z]}));
