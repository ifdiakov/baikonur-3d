import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projectOsm} from '../src/osm-geography.js';
import {createNorthBankMask} from '../src/river-bank.js';

const source=JSON.parse(await readFile('data/osm/river.geojson','utf8')).features[0].geometry.coordinates;
const world=ll=>{const p=projectOsm(ll);return [(p[0]-650)*3.4,(p[1]-522.5)*3.4];};
const river=source.map(world),bank=createNorthBankMask(river);
assert(createNorthBankMask([...river].reverse()).contains(...world([63.3209,45.6322])),'Source way direction must not invert the allowed bank');
for(const ll of [[63.3209,45.6322],[63.2107,45.6219],[63.34,45.70],[63.32,46.0]])assert(bank.contains(...world(ll)),'The city, Krayniy and cosmodrome remain illuminated');
assert(!bank.contains(...world([63.32,45.55])),'The opposite river bank remains unlit');
assert(!bank.contains(NaN,0));
// Both sides of ninety actual meander segments, rather than one horizontal
// latitude threshold: the exclusion must follow the entire river shoreline.
let probes=0;
for(let i=1;i<river.length;i+=39){
 const a=river[i-1],b=river[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
 if(length<.1)continue;
 const p=[(a[0]+b[0])/2,(a[1]+b[1])/2],n=[dz/length,-dx/length];
 assert(bank.contains(p[0]+n[0]*.01,p[1]+n[1]*.01));
 assert(!bank.contains(p[0]-n[0]*.01,p[1]-n[1]*.01));probes++;
}
assert(probes>80);
console.log('RIVER_BANK_PASS',JSON.stringify({version:bank.version,sourcePoints:river.length,meanderProbes:probes,cityAndAirportRetained:true}));
