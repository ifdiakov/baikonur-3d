import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'meshoptimizer';
import {planRailStations,stationGeometry,createRailStations,metricStationGeometry} from '../src/rail-stations.js';
const bytes=await readFile('assets/models/rail-station/model-v1.glb'),manifest=JSON.parse(await readFile('assets/models/rail-station/manifest-v1.json'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.asset.sha256);assert(bytes.length<20000);assert.equal(manifest.asset.textures,0);assert.equal(manifest.asset.primitives,1);assert(manifest.asset.triangles<2000);assert(manifest.removed.includes('Station building'));assert(manifest.removed.includes('Station windows'));assert(manifest.removed.includes('Track rails'));
const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');scene.updateMatrixWorld(true);let mesh;scene.traverse(o=>{if(o.isMesh)mesh=o;});
const geometry=metricStationGeometry(mesh);geometry.computeBoundingBox();assert(geometry.boundingBox.max.z<10.1);assert(geometry.boundingBox.min.z> -10.1);assert.equal(mesh.material.map,null);
const bake=JSON.parse(gunzipSync(await readFile('data/osm/transport-geometry-bake-v1.json.gz'))),stations=bake.stations.map(s=>({...s,group:{position:new THREE.Vector3(...s.position)}}));
const plans=planRailStations(stations,bake.terrain.rails);assert.equal(plans.length,bake.stations.length);assert(plans.every(p=>p.skipped||Number.isFinite(p.yaw)&&p.innerMetres>=2));assert(plans.filter(p=>!p.skipped).length>=30);
for(const p of plans)if(!p.skipped){assert(p.innerMetres*.14-p.trackSpan/2>=.28);const g=stationGeometry(geometry,p.innerMetres);g.computeBoundingBox();assert(Math.abs(g.boundingBox.max.z-(p.innerMetres+4.95))<.03);g.dispose();}
// No displayed rail may pass through either platform anywhere along its length.
for(const p of plans){if(p.skipped)continue;const c=Math.cos(p.yaw),s=Math.sin(p.yaw),near=p.innerMetres*.14-.1064,far=(p.innerMetres+4.95)*.14+.1064;
 for(const path of bake.terrain.rails){if(Math.abs(path.width-.448)>.05)continue;for(let i=1;i<path.points.length;i++){
  const local=a=>{const x=a[0]-p.position[0],z=a[2]-p.position[2];return [x*c-z*s,x*s+z*c];},a=local(path.points[i-1]),b=local(path.points[i]);
  if(Math.min(a[0],b[0])>7.7||Math.max(a[0],b[0])< -7.7)continue;
  const clamp=t=>Math.max(0,Math.min(1,t)),dx=b[0]-a[0],t0=clamp((-7.7-a[0])/(dx||1)),t1=clamp((7.7-a[0])/(dx||1)),z0=a[1]+(b[1]-a[1])*t0,z1=a[1]+(b[1]-a[1])*t1,lo=Math.min(z0,z1),hi=Math.max(z0,z1);
  assert(!((lo<far&&hi>near)||(lo< -near&&hi> -far)),'Platform overlaps a rail: '+JSON.stringify({name:p.name,inner:p.innerMetres,position:p.position,lo,hi,a,b}));
 }}
}
let attempts=0;const clickable=[],view=createRailStations({stations,paths:bake.terrain.rails,parent:new THREE.Group(),clickable,firstIndex:100,loadSource:async()=>{if(!attempts++)throw Error('simulated offline');return {geometry,material:mesh.material,bytes:bytes.length};}});
assert.equal(await view.load(),false);assert.equal(view.stats().status,'error');assert.equal(await view.load(),true);assert.equal(await view.load(),true);assert.equal(attempts,2);assert.equal(clickable.length,plans.filter(p=>!p.skipped).length);assert(clickable.every(m=>m.userData.railStation));
const camera=new THREE.PerspectiveCamera();camera.position.set(0,3000,0);view.update(camera);assert.equal(view.stats().visible,0);camera.position.fromArray(plans.find(p=>!p.skipped).position).add(new THREE.Vector3(10,10,10));view.update(camera);assert(view.stats().visible>0);
await mkdir('qa-rail-station',{recursive:true});await writeFile('qa-rail-station/placements.json',JSON.stringify(plans,null,2));console.log('RAIL_STATION_SOURCE_PASS',JSON.stringify({bytes:bytes.length,triangles:manifest.asset.triangles,count:plans.length,skipped:plans.filter(p=>p.skipped),maxOffset:Math.max(...plans.map(p=>p.nearestRailDistance||0)),maxInner:Math.max(...plans.map(p=>p.innerMetres||0))}));
