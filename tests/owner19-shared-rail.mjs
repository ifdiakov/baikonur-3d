import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const b=JSON.parse(gunzipSync(await readFile('data/osm/transport-geometry-bake-v1.json.gz'))),rails=b.terrain.rails;
assert.equal(b.railRevision,'20261109-owner19-shared-rail-v3');assert(b.fingerprint.includes(b.railRevision));
const main=rails.filter(r=>r.sourceWayId==='37547653'),branch=rails.filter(r=>r.sourceWayId==='37548027');
const x=p=>p[0]/3.4+650,y=p=>p[2]/3.4+522.5;
const shared=p=>x(p)>604&&x(p)<606&&y(p)>420.901&&y(p)<425.699;
assert(main.some(r=>r.points.some(shared)),'Through track must cover the common approach');
assert(!branch.some(r=>r.points.some(shared)),'Branch must not draw a second crossing/duplicate along the common approach');
function gap(p,lines){let best=Infinity;for(const r of lines)for(let i=1;i<r.points.length;i++){const a=r.points[i-1],c=r.points[i],dx=c[0]-a[0],dz=c[2]-a[2],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(p[0]-a[0]-t*dx,p[2]-a[2]-t*dz,p[1]-a[1]-t*(c[1]-a[1])));}return best;}
const endpoints=[[605.2,420.9],[604.6,425.7]].map(([x,y])=>[(x-650)*3.4,.68,(y-522.5)*3.4]),gaps=endpoints.map(p=>({main:gap(p,main),branch:gap(p,branch)}));
assert(gaps.every(p=>p.main<.17&&p.branch<.02),'Both exact branch endpoints must join the through rail within cache quantization');
assert(main.flatMap(r=>r.points.filter(shared)).every(p=>p[1]>=.679),'Rail crossing datum is preserved');
await mkdir('qa-owner19',{recursive:true});await writeFile('qa-owner19/shared-rail.json',JSON.stringify({passed:true,revision:b.railRevision,commonTrackDrawnOnce:true,junctionGaps:gaps},null,2));
console.log('OWNER19_SHARED_RAIL_PASS',JSON.stringify(gaps));
