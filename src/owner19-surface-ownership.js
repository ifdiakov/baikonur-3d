import * as THREE from 'three';
import {unionRoadSurfacePolygons} from './road-surface.js';
const centres=[[538.7,440.9],[543.4,446.2]].map(([x,z])=>[(x-650)*3.4,(z-522.5)*3.4]);
function selected(poly){return centres.some(([x,z])=>poly.some(p=>Math.abs(p.x-x)<12&&Math.abs(p.z-z)<12));}
function polygons(mesh){const g=mesh.geometry,p=g.attributes.position,ix=g.index,out=[];for(let i=0;i<(ix?.count??p.count);i+=3)out.push([0,1,2].map(k=>{const j=ix?ix.getX(i+k):i+k;return{x:p.getX(j),y:p.getY(j),z:p.getZ(j)};}));return out;}
function install(mesh,polys){const pos=[];for(const p of polys)for(let i=1;i<p.length-1;i++){let tri=[p[0],p[i],p[i+1]];const[a,b,c]=tri;if((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x)>0)tri.reverse();for(const v of tri)pos.push(v.x,v.y,v.z);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(Array.from({length:pos.length/3},(_,i)=>i));g.computeVertexNormals();g.computeBoundingSphere();mesh.geometry.dispose();mesh.geometry=g;}
export function applyOwnerRampOwnership(asphalt,ground,shoulder){
 const asphaltNear=asphalt?polygons(asphalt).filter(selected):[];
 for(const[mesh,exclusive]of [[asphalt,[]],[ground,asphaltNear],[shoulder,[]]]){
  if(!mesh)continue;const all=polygons(mesh),near=all.filter(selected),far=all.filter(p=>!selected(p));
  if(!near.length)continue;const union=unionRoadSurfacePolygons(near,exclusive);install(mesh,[...far,...union.polygons]);mesh.userData.owner19RampUnion={input:near.length,output:union.polygons.length,clipped:union.clipped};
 }
}
