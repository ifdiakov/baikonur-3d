import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {buildEditedRoadMeshes} from '../src/road-editor-mesh.js';
// First three owner roads with the actual inherited OSM profiles reproduce
// the startup stall. Unprofiled roads do not expose the fragment explosion.
if(!process.argv.includes('--worker')){
 const entry=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(entry.indexOf('const saturnCameraSample=')<entry.indexOf('roadEditor=createRoadEditor('),'Real terrain sampler must be initialized before synchronous saved-road construction');
 const output=execFileSync(process.execPath,[fileURLToPath(import.meta.url),'--worker'],{timeout:5000,encoding:'utf8'});
 console.log(output.trim());
}else{
 const roads=JSON.parse(readFileSync(new URL('./fixtures/road-editor-startup.json',import.meta.url)));
 const start=performance.now(),built=buildEditedRoadMeshes(roads,{terrainHeightAt:()=>-2.72});
 assert.equal(built.paths.length,3);assert(built.stats.markedRoads>0);
 const meshes=['asphalt','ground','highway'].map(k=>new THREE.Mesh(built.geometries[k],new THREE.MeshBasicMaterial({side:THREE.DoubleSide})));
 let probes=0;
 for(const path of built.paths)for(let i=1;i<path.points.length;i++){
  const a=path.points[i-1],b=path.points[i],ray=new THREE.Raycaster(new THREE.Vector3((a[0]+b[0])/2,100,(a[2]+b[2])/2),new THREE.Vector3(0,-1,0));
  assert(ray.intersectObjects(meshes,false).length,'Source-profiled road has no hole');probes++;
 }
 for(const g of Object.values(built.geometries))assert([...g.attributes.position.array].every(Number.isFinite));
 console.log('ROAD_EDITOR_STARTUP_PASS',JSON.stringify({roads:roads.length,probes,milliseconds:performance.now()-start,overlaps:built.stats.overlaps}));
}
