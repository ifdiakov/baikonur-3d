import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
import {projectOsm} from './osm-geography.js';
import {SITE94_STREETS} from './site94-streets.js?v=20261112-site94-94a-photo-v1';
export function connectSite94(root,roads=[]){
 const data=root.userData.site94Model;if(!data)return;root.updateWorldMatrix(true,true);
 const road=roads.find(r=>r.osmWayIds?.some(id=>String(id)==='172710451')||r.id==='osm-road-172710451');
 const source=road?.points?.[0],join=projectOsm(62.8602042,46.0641567),world=new THREE.Vector3((join[0]-650)*3.4,source?(Array.isArray(source)?source[1]:source.y):.72,(join[1]-522.5)*3.4),local=root.worldToLocal(world);
 const grade=(x,z)=>.045+(local.y-.045)*(1-THREE.MathUtils.smoothstep(Math.hypot(x-local.x,z-local.z),0,160));
 const boundary=SITE94_STREETS.boundary.flatMap(p=>[p.outer,...p.holes]);
 const distance=(x,z)=>{let best=Infinity;for(const ring of boundary)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1],len=dx*dx+dz*dz,t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(len||1),0,1);best=Math.min(best,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}return best;};
 const k=archiveKit(root);k.mat.asphalt.color.setHex(0x555751);k.mat.soil.side=THREE.DoubleSide;
 const sample=(x,z,type)=>type==='earth'?Math.max(.002,(grade(x,z)-.015)*(1-THREE.MathUtils.smoothstep(distance(x,z),0,35))):grade(x,z)-(type==='shoulder'?.008:0);
 let triangles=0,maxEdge=0;
 function area(polygons,type,material){const vertices=[];
  function tri(a,b,c,depth=0){
   const pts=[a,b,c],edges=pts.map((p,i)=>Math.hypot(p[0]-pts[(i+1)%3][0],p[1]-pts[(i+1)%3][1])),e=edges.indexOf(Math.max(...edges));
   if(edges[e]>12&&depth<18){const p=pts[e],q=pts[(e+1)%3],r=pts[(e+2)%3],mid=[(p[0]+q[0])/2,(p[1]+q[1])/2];tri(p,mid,r,depth+1);tri(mid,q,r,depth+1);return;}
   for(const [x,z]of pts)vertices.push(x,sample(x,z,type),z);triangles++;maxEdge=Math.max(maxEdge,...edges);
  }
  for(const polygon of polygons){const shape=new THREE.Shape(polygon.outer.map(([x,z])=>new THREE.Vector2(x,-z)));for(const ring of polygon.holes)shape.holes.push(new THREE.Path(ring.map(([x,z])=>new THREE.Vector2(x,-z))));
   const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);const p=g.attributes.position,idx=g.index;
   for(let i=0;i<(idx?.count||p.count);i+=3)tri(...[0,1,2].map(j=>{const v=idx?idx.getX(i+j):i+j;return[p.getX(v),p.getZ(v)];}));g.dispose();
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();k.direct(g,material,'site94-'+type);
 }
 area(SITE94_STREETS.roads,'roads','asphalt');area(SITE94_STREETS.shoulders,'shoulder','soil');area(SITE94_STREETS.earth,'earth','soil');
 const result=k.finish(),gateHeights=data.ports.map(([x,y,z])=>({x,z,grade:grade(x,z),difference:grade(x,z)-y}));
 data.serviceRoads={sourceWayCount:SITE94_STREETS.ids.length,meshCount:result.meshCount,unioned:true,source:'existing project OSM snapshot',join:local.toArray(),matchedMainRoad:!!road,triangles,maxEdge,gateHeights,slopingEarth:true,mainRoadClipped:true};
}
