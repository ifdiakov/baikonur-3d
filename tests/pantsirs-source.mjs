import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import * as THREE from 'three';
import {buildEarthCoveredShelter,PANTSIR_PROFILES} from '../src/earth-covered-shelters.js';
import {buildSite92} from '../src/site92.js';
import {SITE92_HALLS,SITE92_SHIFT,site92Point,site92HallPosition} from '../src/site92-layout.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {RAIL_SITE_FOOTPRINTS} from '../src/rail-site-clearance.js';
import {createTerrainVoids} from '../src/terrain-voids.js';
import {createMuseumGeography} from '../src/osm-geography.js';
const checks=[],stats={};function test(name,fn){fn();checks.push({name,passed:true});}
for(const id of ['pad-82','pad-83']){
 const root=new THREE.Group(),result=buildEarthCoveredShelter(root,id),p=root.userData.pantsirModel;root.updateMatrixWorld(true);
 const hit=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0)).intersectObject(root,true)[0];
 test(id+': registered exactly once, below-grade type',()=>{const records=ARCHIVE_MAP.filter(s=>s.id===id);assert.equal(records.length,1);assert.equal(records[0].kind,'pantsir');assert(p.buried);assert.equal(records[0].scale,.14);assert.equal(p.dimensionsSurveyed,false);});
 test(id+': open excavated entrance, not covered by earth',()=>{for(const z of [p.front+.2,p.front+2,p.front+5,p.landing-.1])assert(hit(0,z).point.y<-5);});
 test(id+': continuous ramp reaches ground without step',()=>{let last=p.floor-1;for(let i=0;i<=10;i++){const z=p.landing+.1+(p.end-p.landing-.2)*i/10,y=hit(0,z).point.y;assert(y>last);assert(y<=.01);last=y;}assert(Math.abs(hit(0,p.end+4).point.y-.025)<.001);});
 test(id+': separate recessed stairs',()=>{assert.equal(result.features['pantsir-stair'],p.steps);assert(hit(6.7,p.landing+.3).point.y< -4.7);assert(hit(6.7,p.end-.1).point.y<.01);});
 test(id+': sealed retaining fascia above entrance',()=>{for(const y of [0,.5,1]){const ray=new THREE.Raycaster(new THREE.Vector3(0,y,p.front+2),new THREE.Vector3(0,0,-1),0,5);assert(ray.intersectObject(root,true).length>0);}});
 test(id+': low earth vault, not an above-ground hall',()=>{assert.equal(result.features['pantsir-vault'],32);assert.equal(result.features['pantsir-vent'],2);assert(hit(0,0).point.y<3);assert(hit(0,0).point.y>1);});
 test(id+': excavation reaches shader and follows moved object',()=>{const v=createTerrainVoids();v.add(root,root.userData.archiveCutouts[0]);const m=new THREE.MeshStandardMaterial();v.mask(m);const sh={uniforms:{},vertexShader:'#include <common>\n#include <project_vertex>',fragmentShader:'#include <common>\n#include <clipping_planes_fragment>'};m.onBeforeCompile(sh);assert(sh.fragmentShader.includes('discard'));const old=[...v.stats().items[0].bounds];root.position.x=10;v.update();assert(Math.abs(v.stats().items[0].bounds[0]-old[0]-10)<1e-6);root.position.x=0;});
 let triangles=0,draws=0;root.traverse(o=>{assert(!o.isLight);if(!o.isMesh)return;draws++;for(const n of o.geometry.attributes.position.array)assert(Number.isFinite(n));triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});
 test(id+': bounded geometry and no new lights',()=>{assert(triangles<10000);assert(draws<=12);});stats[id]={draws,triangles,profile:p};
}
test('82 and83 use distinct proportions',()=>assert.notEqual(PANTSIR_PROFILES['pad-82'].depth,PANTSIR_PROFILES['pad-83'].depth));
const root92=new THREE.Group(),built=buildSite92(root92),catalog=JSON.parse(readFileSync('data/catalog.json')),matches=JSON.parse(readFileSync('data/osm/catalog-matches.json'));
const sites=createMuseumGeography({catalog,matches}).sites,a=sites.find(s=>s.id==='pad-92'),b=sites.find(s=>s.id==='pad-95'),near=[(b.x-a.x)*3.4/.14,(b.y-a.y)*3.4/.14];
test('92 moves away from95; other five buildings unchanged',()=>{for(let i=0;i<10;i++){const before=site92Point(SITE92_HALLS[i]),after=site92HallPosition(i);if(i<5){assert(Math.hypot(after[0]-near[0],after[1]-near[1])>Math.hypot(before[0]-near[0],before[1]-near[1]));assert(Math.abs(Math.hypot(after[0]-before[0],after[1]-before[1])-60)<1e-8);}else assert.deepEqual(before,after);}});
test('92 facades and five approaches retained',()=>{assert.equal(built.site92.buildings.length,10);assert.equal(built.features['site92-yellow-gate'],2);assert.equal(root92.userData.archiveRailPaths.length,5);});
test('92 railway clearance shares the model placement',()=>{const shapes=RAIL_SITE_FOOTPRINTS.find(s=>s.siteId==='pad-92').footprints;for(let i=0;i<10;i++){const p=site92HallPosition(i),sh=shapes.find(s=>s.id==='hall-'+i);assert(Math.hypot(sh.x-p[0],sh.z-p[1])<5);}});
test('82 and83 cards state type without claiming measured geometry',()=>{for(const id of ['pad-82','pad-83']){const r=catalog.sites.find(s=>s.id===id);assert(r.titleFull.includes('Панцирь'));assert(r.modelStatus.includes('интерпретация'));}});
if(process.env.REQUIRE_BUILT==='1')test('Worker matches updated92 clearance',()=>assert(readFileSync('src/transport-detail-worker.bundle.js','utf8').includes('rail-building-footprints-site92-v2')));
mkdirSync('qa-pantsirs',{recursive:true});writeFileSync('qa-pantsirs/source-report.json',JSON.stringify({passed:true,checks,stats,site92Shift:SITE92_SHIFT},null,2));console.log('PANTSIRS_SOURCE_PASS',checks.length,JSON.stringify(Object.fromEntries(Object.entries(stats).map(([id,s])=>[id,{draws:s.draws,triangles:s.triangles}]))));
