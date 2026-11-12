import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {siteLabelVisibility,includeKrayniyCameraArea,MAP_LABEL_HEIGHTS,KRAYNIY_CAMERA_MARGIN} from '../src/map-view-policy.js';
const checks=[];function test(name,fn){fn();checks.push({name,passed:true});}
for(const [h,siteAlpha,detailAlpha]of [[1000,0,0],[301,0,0],[300.01,0,0],[300,1,0],[299.99,1,0],[200,1,0],[130.01,1,0],[130,0,1],[129.99,0,1],[100,0,1],[1,0,1]])test('HUD H='+h,()=>assert.deepEqual(siteLabelVisibility(h),{siteAlpha,detailAlpha}));
for(const h of [NaN,Infinity,-Infinity])test('Reject nonfinite altitude '+h,()=>assert.deepEqual(siteLabelVisibility(h),{siteAlpha:0,detailAlpha:0}));
test('No overlap or empty band inside range',()=>{for(let h=1;h<=300;h+=.25){const s=siteLabelVisibility(h);assert.equal(s.siteAlpha+s.detailAlpha,1);}});
const flank={minX:-100,maxX:100,minZ:-200,maxZ:200},box={min:{x:-280,z:450},max:{x:10,z:900}};
test('Include all airport corners and original flanks',()=>{const r=includeKrayniyCameraArea(flank,box);assert.deepEqual(r,{minX:-400,maxX:130,minZ:-200,maxZ:1020});assert.deepEqual(flank,{minX:-100,maxX:100,minZ:-200,maxZ:200});});
test('Airport camera area remains finite',()=>assert(Object.values(includeKrayniyCameraArea(flank,box)).every(Number.isFinite)));
test('Invalid extent is not silently accepted',()=>{assert.throws(()=>includeKrayniyCameraArea(flank,{min:{x:NaN,z:0},max:{x:1,z:1}}));assert.throws(()=>includeKrayniyCameraArea(flank,box,-1));});
for(const name of ['index.html','museum.html','workshop.html'])test(name+' uses one consistent policy',()=>{const s=readFileSync(name,'utf8');assert(s.includes('siteLabelVisibility(y)'));assert(s.includes('includeKrayniyCameraArea(flankCameraBounds,krayniyCameraBox)'));assert(!s.includes('smooth(225,365)'));assert(s.includes('constrainFreeCamera({camera,controls:ctl,bounds:activeBounds'));assert(s.includes('museumTerrainHeightAt(camera.position.x,camera.position.z)+7*MUSEUM_METRE'));assert(s.includes('el.classList.add("compact")'));});
mkdirSync('qa-delivery',{recursive:true});const report={passed:true,checks,thresholds:MAP_LABEL_HEIGHTS,cameraMargin:KRAYNIY_CAMERA_MARGIN};writeFileSync('qa-delivery/camera-labels-source.json',JSON.stringify(report,null,2));console.log('CAMERA_LABELS_SOURCE_PASS',checks.length);
