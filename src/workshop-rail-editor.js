import * as THREE from 'three';
import {RAIL_PROFILE as R} from './rail-profile.js';
import {subtractRoadPolygon} from './road-surface.js?v=20261103-road-mesh-v2';
import {validateRailEdits,emptyRailEdits,visibleNetwork,createNetworkIndex,dist,pathLength,pathStations,pointAt,xyz} from './workshop-network-core.js';

// The same metric cross section as existing steel, sleepers and ballast.
export function smoothRail(points,terrainHeightAt){
 const p=points.map(xyz),length=pathLength(p);if(length>2400)throw Error('Проложите длинный путь несколькими ветками (до 2400 единиц каждая).');
 const curve=new THREE.CatmullRomCurve3(p.map(v=>new THREE.Vector3(...v)),false,'centripetal');
 const samples=curve.getSpacedPoints(Math.max(2,Math.ceil(length/.32))).map(v=>v.toArray());
 for(const v of samples){const h=terrainHeightAt(v[0],v[2]);if(Number.isFinite(h))v[1]=Math.max(v[1],h+.04);}
 samples[0]=[...p[0]];samples[samples.length-1]=[...p.at(-1)];return samples;
}
export function buildRailModel(row,{materials=null}={}){
 const root=new THREE.Group();root.name='ЖД редактора · '+row.id;root.userData.networkRail=row.id;
 const m=materials||{ballast:new THREE.MeshStandardMaterial({color:0x988b78,roughness:.96,side:THREE.DoubleSide}),ties:new THREE.MeshStandardMaterial({color:0x766c5c,roughness:.96}),steel:new THREE.MeshStandardMaterial({color:0x707773,roughness:.51,metalness:.62})};
 function strip(width,offset,y,depth=0){
  const pos=[],idx=[],p=row.points;
  for(let i=0;i<p.length;i++){const prev=p[Math.max(0,i-1)],next=p[Math.min(p.length-1,i+1)],len=dist(prev,next)||1,nx=-(next[2]-prev[2])/len,nz=(next[0]-prev[0])/len;
   const top=[p[i][0]+nx*(offset-width/2),p[i][1]+y,p[i][2]+nz*(offset-width/2),p[i][0]+nx*(offset+width/2),p[i][1]+y,p[i][2]+nz*(offset+width/2)];pos.push(...top);
   if(depth)pos.push(top[0],top[1]-depth,top[2],top[3],top[4]-depth,top[5]);
   if(i){const n=depth?4:2,a=(i-1)*n,b=i*n;idx.push(a,b,a+1,a+1,b,b+1);if(depth)idx.push(a,a+2,b,a+2,b+2,b,a+1,b+1,a+3,a+3,b+1,b+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();g.computeBoundingSphere();return g;
 }
 const ballast=new THREE.Mesh(strip(R.ballastWidth,0,R.ballastY),m.ballast);ballast.name='Новый балласт';ballast.receiveShadow=true;root.add(ballast);
 for(const sign of [-1,1]){const steel=new THREE.Mesh(strip(R.headWidth,sign*R.gauge/2,R.headY,R.railHeight),m.steel);steel.name='Новый рельс';steel.receiveShadow=true;root.add(steel);}
 const distances=pathStations(row.points),length=distances.at(-1),count=Math.max(1,Math.floor(length/R.sleeperStep));
 const ties=new THREE.InstancedMesh(new THREE.BoxGeometry(R.sleeperLength,R.sleeperHeight,R.sleeperWidth),m.ties,count),dummy=new THREE.Object3D();ties.name='Новые шпалы';
 for(let i=0;i<count;i++){const d=(i+.5)*length/count,p=pointAt(row.points,d,distances),a=pointAt(row.points,Math.max(0,d-.03),distances),b=pointAt(row.points,Math.min(length,d+.03),distances);dummy.position.set(p[0],p[1]+R.sleeperY,p[2]);dummy.rotation.y=Math.atan2(b[0]-a[0],b[2]-a[2]);dummy.updateMatrix();ties.setMatrixAt(i,dummy.matrix);}
 ties.instanceMatrix.needsUpdate=true;ties.computeBoundingSphere();ties.receiveShadow=true;root.add(ties);
 root.userData.sleepers=count;return root;
}
const bbox=points=>({minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))});
function corridor(a,b,width){const len=dist(a,b);if(len<1e-7)return null;const nx=-(b[2]-a[2])/len*width/2,nz=(b[0]-a[0])/len*width/2;
 return [{x:a[0]-nx,y:a[1],z:a[2]-nz},{x:b[0]-nx,y:b[1],z:b[2]-nz},{x:b[0]+nx,y:b[1],z:b[2]+nz},{x:a[0]+nx,y:a[1],z:a[2]+nz}];}
export function makeRailCuts(hidden,base){
 const survivors=visibleNetwork(base,{added:[],hidden},'rail'),index=createNetworkIndex(survivors,{tolerance:.045}),grid=new Map(),cell=12;let count=0;
 const add=clip=>{clip.bounds=bbox(clip.points);const b=clip.bounds;for(let x=Math.floor(b.minX/cell);x<=Math.floor(b.maxX/cell);x++)for(let z=Math.floor(b.minZ/cell);z<=Math.floor(b.maxZ/cell);z++){const k=x+':'+z;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(clip);}count++;};
 for(const h of hidden)for(let i=1;i<h.points.length;i++){
  const a=h.points[i-1],b=h.points[i],poly=corridor(a,b,h.width+.035);if(!poly)continue;
  let parts=[poly];
  // Protect surviving track beds at a switch, including their full gauge.
  for(const end of [a,b]){
   const hit=index.nearest(end,Math.max(.25,h.width));if(!hit||hit.road.originId===h.sourceId||Math.abs(hit.point[1]-end[1])>.35)continue;
   const ds=Math.min(hit.road.points.length-1,hit.segment),c=hit.road.points[ds-1],d=hit.road.points[ds],vx=d[0]-c[0],vz=d[2]-c[2],l=dist(c,d)||1;
   const cosine=Math.abs(((b[0]-a[0])*vx+(b[2]-a[2])*vz)/((dist(a,b)||1)*l));if(cosine>.995)continue;
   const span=(h.width+hit.road.width+1)/Math.max(.08,Math.sqrt(1-cosine*cosine)),p=hit.point;
   const keep=corridor([p[0]-vx/l*span,p[1],p[2]-vz/l*span],[p[0]+vx/l*span,p[1],p[2]+vz/l*span],hit.road.width+.012);
   parts=parts.flatMap(poly=>subtractRoadPolygon(poly,keep));
  }
  for(const points of parts)if(points.length>=3)add({points,a,b});
 }
 return {count,at(bounds){const found=new Set();for(let x=Math.floor(bounds.minX/cell);x<=Math.floor(bounds.maxX/cell);x++)for(let z=Math.floor(bounds.minZ/cell);z<=Math.floor(bounds.maxZ/cell);z++)for(const clip of grid.get(x+':'+z)||[])if(clip.bounds.minX<=bounds.maxX&&clip.bounds.maxX>=bounds.minX&&clip.bounds.minZ<=bounds.maxZ&&clip.bounds.maxZ>=bounds.minZ)found.add(clip);return [...found];}};
}
// Preserve ALL vertex attributes and vertical rail faces. The road-only cutter
// drops triangles with zero XZ area, which is invalid for 3D steel and sleepers.
export function cutRailGeometry(geometry,cuts,{gradeTolerance=.16}={}){
 const attrs=Object.entries(geometry.attributes),p=geometry.attributes.position,ix=geometry.index,indices=[],extra=Object.fromEntries(attrs.map(([n])=>[n,[]]));let appended=0,changed=0;
 const offsets={};let stride=0;for(const [name,a]of attrs){offsets[name]=stride;stride+=a.itemSize;}const pi=offsets.position;
 const vertex=id=>{const v=[];for(const [,a]of attrs)for(let k=0;k<a.itemSize;k++)v.push(a.array[id*a.itemSize+k]);return v;};
 const pos=v=>({x:v[pi],y:v[pi+1],z:v[pi+2]});
 function half(poly,a,b,inside){const out=[],side=v=>(b.x-a.x)*(v[pi+2]-a.z)-(b.z-a.z)*(v[pi]-a.x);for(let i=0;i<poly.length;i++){const u=poly[i],v=poly[(i+1)%poly.length],du=side(u),dv=side(v),iu=inside?du>=-1e-9:du<=1e-9,iv=inside?dv>=-1e-9:dv<=1e-9;if(iu)out.push(u);if(iu!==iv){const t=du/(du-dv);out.push(u.map((n,k)=>n+(v[k]-n)*t));}}return out;}
 function subtract(poly,c){
  const center=poly.reduce((s,v)=>[s[0]+v[pi]/poly.length,s[1]+v[pi+1]/poly.length,s[2]+v[pi+2]/poly.length],[0,0,0]),dx=c.b[0]-c.a[0],dz=c.b[2]-c.a[2],t=Math.max(0,Math.min(1,((center[0]-c.a[0])*dx+(center[2]-c.a[2])*dz)/(dx*dx+dz*dz||1))),y=c.a[1]+(c.b[1]-c.a[1])*t;
  if(Math.abs(center[1]-y)>gradeTolerance)return [poly];let rem=poly,outer=[];
  for(let i=0;i<c.points.length&&rem.length;i++){const a=c.points[i],b=c.points[(i+1)%c.points.length],o=half(rem,a,b,false);if(o.length>=3)outer.push(o);rem=half(rem,a,b,true);}return outer;
 }
 const area3=(a,b,c)=>{const ab=[b[pi]-a[pi],b[pi+1]-a[pi+1],b[pi+2]-a[pi+2]],ac=[c[pi]-a[pi],c[pi+1]-a[pi+1],c[pi+2]-a[pi+2]];return Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]);};
 const append=v=>{for(const [name,a]of attrs)for(let k=0;k<a.itemSize;k++)extra[name].push(v[offsets[name]+k]);return p.count+appended++;};
 const n=ix?.count??p.count;for(let i=0;i<n;i+=3){const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k),bp=ids.map(id=>({x:p.getX(id),y:p.getY(id),z:p.getZ(id)})),near=cuts.at(bbox(bp));if(!near.length){indices.push(...ids);continue;}
  const tri=ids.map(vertex);let pieces=[tri];for(const c of near){pieces=pieces.flatMap(poly=>subtract(poly,c));if(!pieces.length)break;}
  if(pieces.length===1&&pieces[0].length===3&&pieces[0].every((v,k)=>v===tri[k])){indices.push(...ids);continue;}changed++;
  for(const poly of pieces)for(let j=1;j<poly.length-1;j++)if(area3(poly[0],poly[j],poly[j+1])>1e-11)indices.push(append(poly[0]),append(poly[j]),append(poly[j+1]));
 }
 if(!changed)return {geometry:null,changed:0};
 const result=new THREE.BufferGeometry();for(const [name,a]of attrs){const data=new a.array.constructor(a.array.length+extra[name].length);data.set(a.array);data.set(extra[name],a.array.length);result.setAttribute(name,new THREE.BufferAttribute(data,a.itemSize,a.normalized));}
 result.setIndex(indices);result.computeBoundingSphere();result.userData={...geometry.userData};return {geometry:result,changed};
}
export function createRailEditor({scene,base}){
 let state=emptyRailEdits(),signature='',lastCuts=null;const originals=new Map();const root=new THREE.Group();root.name='Железные дороги мастерской';root.userData.workshopOnly=true;scene.add(root);
 const materials={ballast:new THREE.MeshStandardMaterial({color:0x988b78,roughness:.96,side:THREE.DoubleSide}),ties:new THREE.MeshStandardMaterial({color:0x766c5c,roughness:.96}),steel:new THREE.MeshStandardMaterial({color:0x707773,roughness:.51,metalness:.62})};
 let cutTriangles=0;
 function eligible(m){return m.isMesh&&!m.isInstancedMesh&&(['OSM · балласт','OSM · шпалы','OSM · рельсы','OSM · бывшие пути'].includes(m.name)||m.userData.roadKind==='rails');}
 function apply(m,original){
  if(m.geometry!==original){m.geometry.dispose();m.geometry=original;}if(!state.hidden.length)return;
  m.updateWorldMatrix(true,false);const world=original.clone().applyMatrix4(m.matrixWorld),result=cutRailGeometry(world,lastCuts,{gradeTolerance:m.userData.roadKind==='rails'?.30:.20});world.dispose();
  if(result.geometry){result.geometry.applyMatrix4(m.matrixWorld.clone().invert());m.geometry=result.geometry;cutTriangles+=result.changed;}
 }
 function attach(applyNow=true){const added=[];scene.traverse(m=>{if(eligible(m)&&!originals.has(m)){originals.set(m,m.geometry);added.push(m);const k={'OSM · балласт':'ballast','OSM · шпалы':'ties','OSM · рельсы':'steel'}[m.name];if(k&&m.material?.color)materials[k].color.copy(m.material.color);}});if(applyNow&&lastCuts)for(const m of added)apply(m,originals.get(m));return added.length;}
 function replace(value){const valid=validateRailEdits(value),sig=JSON.stringify(valid);if(sig===signature){attach();return;}
  state=valid;signature=sig;cutTriangles=0;lastCuts=state.hidden.length?makeRailCuts(state.hidden,base):null;attach(false);
  for(const [mesh,original]of originals)apply(mesh,original);
  for(const c of [...root.children]){root.remove(c);c.traverse(m=>m.geometry?.dispose());}for(const r of state.added)root.add(buildRailModel(r,{materials}));
 }
 attach();return {replace,attach,snapshot:()=>structuredClone(state),stats:()=>({added:state.added.length,hidden:state.hidden.length,sourceMeshes:originals.size,cutTriangles,newMeshes:root.children.reduce((n,r)=>n+r.children.length,0),gauge:R.gauge,ballastWidth:R.ballastWidth})};
}
