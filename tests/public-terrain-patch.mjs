import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildSurfacePatch} from '../src/public-terrain-patch.js';
const bounds=[1.3,2.1,8.7,9.4],worldBounds=[0,0,10,10],segments=2,heights=[0,1,2,2,4,3,1,5,6];
const texture=new THREE.Texture(),mesh=buildSurfacePatch({bounds,worldBounds,segments,heights,texture,night:false});
const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;assert(p.count>0);
for(let i=0;i<p.count;i++){
 const x=p.getX(i),z=p.getZ(i);
 assert(x>=bounds[0]-1e-5&&x<=bounds[2]+1e-5);assert(z>=bounds[1]-1e-5&&z<=bounds[3]+1e-5);
 assert(uv.getX(i)>=-1e-5&&uv.getX(i)<=1.00001);assert(uv.getY(i)>=-1e-5&&uv.getY(i)<=1.00001);
 const ix=Math.min(1,Math.floor(x/5)),iz=Math.min(1,Math.floor(z/5)),fx=x/5-ix,fz=z/5-iz,k=iz*3+ix,h=heights;
 const expected=fx+fz<=1?h[k]+(h[k+1]-h[k])*fx+(h[k+3]-h[k])*fz:h[k+4]+(h[k+3]-h[k+4])*(1-fx)+(h[k+1]-h[k+4])*(1-fz);
 assert(Math.abs(p.getY(i)-expected)<1e-5,'Road ink must lie on the SAME terrain triangles, without vertical road lift');
}
assert.equal(mesh.position.y,0);console.log('PUBLIC_TERRAIN_PATCH_PASS',p.count/3);
mesh.geometry.dispose();mesh.material.dispose();texture.dispose();
