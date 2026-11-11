import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {protonHalls} from '../src/archive-buildings.js';
import {buildSite82,SITE82_PROFILE} from '../src/site82.js';
import {createMuseumGeography,MUSEUM_DISPLAY_OFFSETS} from '../src/osm-geography.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
const catalog=JSON.parse(fs.readFileSync('data/catalog.json')),matches=JSON.parse(fs.readFileSync('data/osm/catalog-matches.json'));
const g=createMuseumGeography({catalog,matches}),a=g.sites.find(s=>s.id==='pad-92'),b=g.sites.find(s=>s.id==='pad-95'),c=g.sites.find(s=>s.id==='pad-82');
assert.deepEqual(MUSEUM_DISPLAY_OFFSETS['pad-92'],[-5,-2.5]);
const oldDistance=Math.hypot(a.x+5-b.x,a.y+2.5-b.y),newDistance=Math.hypot(a.x-b.x,a.y-b.y);assert(newDistance>oldDistance+5);
assert.equal(b.x,167.60756141902908);assert.equal(c.x,195.41370879187576);
const stats={passed:true,shiftMap:[-5,-2.5],distanceBefore:oldDistance,distanceAfter:newDistance,models:{}};
for(const [id,build]of [['92',protonHalls],['82',buildSite82]]){
 const root=new THREE.Group(),result=build(root);root.updateWorldMatrix(true);let draws=0,triangles=0;
 root.traverse(m=>{if(!m.isMesh)return;draws++;for(const v of m.geometry.attributes.position.array)assert(Number.isFinite(v));triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3*(m.isInstancedMesh?m.count:1);});
 stats.models[id]={draws,triangles};
 if(id==='92'){assert.equal(root.userData.site92Model.retainedBuildings,10);assert(result.features['site92-upper-window']>0);assert.equal(root.userData.archiveRailPaths.length,5);assert(triangles<70000);}
 else{assert(root.userData.site82Model.buried);assert(SITE82_PROFILE.floor<0&&SITE82_PROFILE.roof<SITE82_PROFILE.cover);assert.equal(root.userData.archiveCutouts.length,1);assert.equal(ARCHIVE_MAP.filter(s=>s.id==='pad-82').length,1);assert.equal(ARCHIVE_MAP.find(s=>s.id==='pad-82').kind,'buried82');assert(triangles<7000);const ray=new THREE.Raycaster(new THREE.Vector3(0,20,50),new THREE.Vector3(0,-1,0));const hits=ray.intersectObject(root,true);assert(hits.length&&hits[0].point.y<-3,'Approach is recessed, not buried under a flat fake ground plane');}
}
fs.mkdirSync('qa-site92-82',{recursive:true});fs.writeFileSync('qa-site92-82/source.json',JSON.stringify(stats,null,2));console.log('SITE92_82_SOURCE_PASS',JSON.stringify(stats));
