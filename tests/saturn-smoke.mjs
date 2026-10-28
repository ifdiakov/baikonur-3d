import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--use-gl=angle','--use-angle=swiftshader',
 '--enable-webgl','--disable-gpu-sandbox'
]});
try {
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message||String(e)));
 const origin=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
 const url=new URL(origin);url.searchParams.set('site','23');
 url.searchParams.set('check',process.env.GITHUB_SHA||'northwest');
 await page.goto(url.toString(),{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats()?.transport?.saturnAccess?.revision==='northwest-hill20-v2',{timeout:90000});
 await page.waitForTimeout(800);
 const stats=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 const model=stats.saturn,access=stats.transport.saturnAccess;
 assert.equal(model.version,'1.6-gentle-hill20');
 assert.equal(model.siteNumber,23);
 assert.equal(model.access.preservedVerticalRaise,20);
 assert.equal(model.largeAntennaCount,2);
 assert.equal(model.dishDiameterMetres,25);
 assert.equal(stats.saturnScale,.525);
 assert.deepEqual(stats.saturnPlacement,[741,716]);
 assert.ok(model.instancedFrameBatches>=2);
 assert.ok(model.primitiveCount>800);
 for(const [key,min] of [['25m-parabolic-reflector',2],['dish-radial-rib',400],
  ['feed-support-truss',8],['white-radome',1],['control-building',4],
  ['tower-horizontal-cornice',8],['northwest-gate-pavement',1]])
  assert.ok((model.featureCounts[key]||0)>=min,'Missing '+key);
 assert.equal(access.entryCorner,'north-west');
 assert.ok(access.gateLocal.x<0&&access.gateLocal.z<0);
 assert.deepEqual(access.gateLocal,model.access.gateLocal);
 assert.ok(access.gateMap[0]<stats.saturnPlacement[0]);
 assert.ok(access.gateMap[1]<stats.saturnPlacement[1]);
 assert.ok(Math.abs(access.gateWorld[1]-(17.45+.525*7.59))<1e-8);
 assert.ok(access.minTerrainClearance>.10,'Approach must not intersect the mountain');
 assert.ok(access.sectionCount>=160);
 assert.equal(await page.locator('#error').isVisible(),false);
 assert.deepEqual(errors,[]);
 await page.screenshot({path:'qa-saturn-ip5.png'});
 // Independently instantiate the exact modules and inspect the real buffers.
 const geometry=await page.evaluate(async()=>{
  const THREE=await import('three');
  const {buildSaturnIP5}=await import('./src/saturn-ip5.js');
  const {buildTransportNetwork}=await import('./src/transport-network.js');
  const catalog=await (await fetch('./data/catalog.json',{cache:'no-store'})).json();
  const data=await (await fetch('./data/transport-network.json',{cache:'no-store'})).json();
  const point=(x,y,z=0)=>new THREE.Vector3((x-650)*3.4,z,(y-522.5)*3.4);
  const layers={roads:new THREE.Group(),rails:new THREE.Group()};
  const network=buildTransportNetwork({data,point,layers,siteRecords:catalog.sites});
  const site=catalog.sites.find(s=>s.id==='pad-23');
  const root=new THREE.Group();root.position.copy(point(site.x,site.y,17.45));
  root.scale.setScalar(.525);root.updateMatrixWorld(true);buildSaturnIP5(root);
  const external=layers.roads.getObjectByName('saturn-northwest-access-road');
  const internal=root.getObjectByName('northwest-gate-pavement');
  const p=external.geometry.getAttribute('position'),q=internal.geometry.getAttribute('position');
  const center=(a,i)=>new THREE.Vector3((a.getX(i)+a.getX(i+1))/2,
    (a.getY(i)+a.getY(i+1))/2,(a.getZ(i)+a.getZ(i+1))/2);
  const end=center(p,p.count-2),gate=root.localToWorld(center(q,0));
  const inside=root.localToWorld(center(q,q.count-2));
  const expected=root.localToWorld(new THREE.Vector3(-92,7.59,-29));
  const roads=network.routes.road.filter(r=>r.id==='r-site23-saturn-access');
  let finite=true,minNormalY=1;
  for(const obj of [external,internal]){
   for(const v of obj.geometry.attributes.position.array)finite&&=Number.isFinite(v);
   const normals=obj.geometry.attributes.normal;
   for(let i=0;i<normals.count;i++)minNormalY=Math.min(minNormalY,normals.getY(i));
  }
  let hill;
  root.traverse(obj=>{if(obj.userData.museumComponent==='murguduk-hill')hill=obj;});
  const hp=hill.geometry.attributes.position,hn=hill.geometry.attributes.normal;
  let maxSlope=0,peak=-Infinity,edge=-Infinity;
  for(let i=0;i<hp.count;i++){
    peak=Math.max(peak,hp.getY(i));
    maxSlope=Math.max(maxSlope,Math.hypot(hn.getX(i),hn.getZ(i))/Math.max(.001,hn.getY(i)));
    if(Math.abs(hp.getX(i))===500||Math.abs(hp.getZ(i))===500)edge=Math.max(edge,hp.getY(i));
  }
  let maxRoadGrade=0;
  for(let i=2;i<p.count;i+=2){const a=center(p,i-2),b=center(p,i);maxRoadGrade=Math.max(maxRoadGrade,Math.abs(b.y-a.y)/Math.hypot(b.x-a.x,b.z-a.z));}
  return {hillRaise:hill.userData.terrainElevationWorld,peak,edge,maxSlope,maxRoadGrade,
    gateGap:end.distanceTo(gate),internalGap:inside.distanceTo(expected),
    finite,minNormalY,routeCount:roads.length,corner:roads[0].entryCorner};
 });
 assert.ok(geometry.gateGap<.001,'Actual road meshes must meet at the NW gate');
 assert.ok(geometry.internalGap<.001,'New entry must join the existing internal lane');
 assert.equal(geometry.finite,true);assert.ok(geometry.minNormalY>0);
 assert.equal(geometry.hillRaise,20);
 assert.ok(Math.abs(geometry.peak-7.25)<.001,'The summit must remain level under the station');
 assert.ok(geometry.edge<-38,'The entire perimeter must meet the steppe');
 assert.ok(geometry.maxSlope<.42,'Hill slopes must stay below 23 degrees');
 assert.ok(geometry.maxRoadGrade<.35,'Approach must rise smoothly without a cliff');
 assert.equal(geometry.routeCount,1);assert.equal(geometry.corner,'north-west');
 console.log('SATURN NORTHWEST QA',JSON.stringify({access,geometry,errors}));
 const workshop=new URL('workshop/saturn.html',origin);
 await page.goto(workshop.toString(),{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__SATURN_PREVIEW__?.rendererReady===true,{timeout:60000});
 const preview=await page.evaluate(()=>window.__SATURN_PREVIEW__.stats());
 assert.equal(preview.antennas,2);assert.equal(preview.diameter,25);assert.ok(preview.meshCount>60);
 assert.equal(await page.locator('#error').isVisible(),false);
 await page.screenshot({path:'qa-saturn-workshop.png'});
 assert.deepEqual(errors,[]);
 console.log('SATURN northwest access: Chromium render and buffer geometry passed');
} finally {await browser.close();}
