import assert from 'node:assert/strict';
import {countdownParts,createLaunchCountdown} from '../src/launch-countdown.js';

class FakeElement {
 constructor(tag,doc){
  this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.dataset={};
  this.attributes=new Map();this.textContent='';this.hidden=false;this.disabled=false;
 }
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(name,value){this.attributes.set(name,String(value));}
 getAttribute(name){return this.attributes.get(name)||null;}
 removeAttribute(name){this.attributes.delete(name);}
 addEventListener(){}
 removeEventListener(){}
}
const timerCalls=[];
const doc={
 hidden:false,
 createElement(tag){return new FakeElement(tag,this);},
 addEventListener(){},removeEventListener(){},
 defaultView:{setInterval(fn,ms){timerCalls.push(ms);return timerCalls.length;},clearInterval(){}}
};
const host=doc.createElement('aside');
const launchAt='2026-11-24T13:13:00+03:00';
const deadline=Date.parse(launchAt);
let current=deadline-102*86400000;
const countdown=createLaunchCountdown({element:host,
 launch:{id:'progress-ms-36',name:'ПРОГРЕСС МС-36',siteLabel:'ПЛ 31',siteId:'pad-31',launchAt,precision:'instant',status:'planned'},
 now:()=>current});
function findUnit(root,key){
 if(root.dataset?.countdownUnit===key)return root;
 for(const child of root.children||[]){
  const found=findUnit(child,key);
  if(found)return found;
 }
 return null;
}
function expectDays(days){
 current=deadline-days*86400000;
 const stats=countdown.refresh();
 assert.equal(stats.countdown.days,days);
 assert.equal(findUnit(host,'days').textContent,String(days),
  'Days must display as a natural number without leading zero for '+days);
 assert.equal(findUnit(host,'hours').textContent,'00',
  'Hours retain the conventional two-character clock format');
 assert.equal(findUnit(host,'minutes').textContent,'00');
 assert.equal(findUnit(host,'seconds').textContent,'00');
}
for(const days of [125,100,99,11,10,9,1,0])expectDays(days);
current=deadline-((9*86400)+(4*3600)+(3*60)+2)*1000;
let stats=countdown.refresh();
assert.equal(stats.countdown.days,9);
assert.equal(findUnit(host,'days').textContent,'9');
assert.equal(findUnit(host,'hours').textContent,'04');
assert.equal(findUnit(host,'minutes').textContent,'03');
assert.equal(findUnit(host,'seconds').textContent,'02');
const parts=countdownParts(launchAt,current);
assert.equal(parts.totalSeconds,(9*86400)+(4*3600)+(3*60)+2);
assert.equal(parts.expired,false);
current=deadline+1000;stats=countdown.refresh();
assert.equal(stats.mode,'elapsed');assert.equal(findUnit(host,'days').textContent,'0');
countdown.dispose();
assert(timerCalls.length>0,'Countdown remains live after the formatting change');
console.log('LAUNCH_COUNTDOWN_FORMAT_PASS',JSON.stringify({days:[125,100,99,11,10,9,1,0],clockPad:'04:03:02',expired:'0'}));
