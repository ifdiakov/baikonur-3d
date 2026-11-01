import assert from 'node:assert/strict';
import {Box3,Vector3,Raycaster} from 'three';
import {createProtonRocket} from '../src/proton-rocket.js';
const model=createProtonRocket(),root=model.root;root.updateMatrixWorld(true);const bounds=new Box3().setFromObject(root),size=bounds.getSize(new Vector3());
assert(Math.abs(size.y-58.2)<.1);assert(size.x>7&&size.x<7.5);let triangles=0,draws=0;
root.traverse(o=>{if(o.isMesh){draws++;triangles+=o.geometry.index.count/3;for(const name of ['position','normal','uv'])for(const n of o.geometry.attributes[name].array)assert(Number.isFinite(n));}});assert(draws<=16);assert(triangles<60000);
for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*2.75,z=Math.sin(a)*2.75;const nozzle=new Raycaster(new Vector3(x,-1,z),new Vector3(0,1,0),0,5).intersectObject(root,true)[0];assert(nozzle&&nozzle.point.y>1.3,'The nozzle opens into its throat, without a solid disc across the exit');const tank=new Raycaster(new Vector3(x,25,z),new Vector3(0,-1,0),0,25).intersectObject(root,true)[0];assert(tank&&tank.point.y>20,'Every peripheral tank has its own tapered top');}
const gap=new Raycaster(new Vector3(0,21.3,0),new Vector3(0,1,0),0,5).intersectObject(root,true)[0];assert(gap&&gap.point.y>23.4,'The centre of the interstage truss is open');
model.setExploded(true);root.updateMatrixWorld(true);assert(new Box3().setFromObject(root).max.y>bounds.max.y+14.9);model.setExploded(false);root.updateMatrixWorld(true);assert.deepEqual(new Box3().setFromObject(root),bounds);model.dispose();console.log('PROTON_GEOMETRY_OK',{draws,triangles,size:size.toArray(),openNozzles:6,openTruss:true});
