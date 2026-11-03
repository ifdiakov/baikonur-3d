import * as THREE from 'three';

// Finish each pavement material's *single unioned triangle surface*, not
// individual ribbons. Shared GPU vertices and the same grade are essential:
// little 3D T-vertices are otherwise visible as hairline cracks at turns.
export const ROAD_JUNCTION_REPAIR_VERSION='welded-junctions-and-microvoids-v1';
const planar=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const xzArea=(a,b,c)=>(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
const mapPoint=(p,step)=>Math.round(p[0]/step)+':'+Math.round(p[2]/step);
const edgeKey=(a,b)=>a<b?a+'|'+b:b+'|'+a;
const sq=v=>v*v;

export function repairRoadTriangleMesh(input,{snap=.003,gradeTolerance=.12,maxHoleArea=.95,maxHoleDiameter=2.1}={}){
 const attribute=input.getAttribute('position'),index=input.index,
  count=index?.count??attribute.count;
 const vertices=[],bins=new Map(),tris=[],splitReport={welded:0,gradeAligned:0,holesSealed:0,holesIgnored:0,triangleCount:0};
 const binSize=snap;
 const findNode=(p)=>{
  const xi=Math.round(p[0]/binSize),zi=Math.round(p[2]/binSize);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)
   for(const id of bins.get((xi+dx)+':'+(zi+dz))||[]){
    const q=vertices[id];
    if(planar(p,q)<=snap&&Math.abs(p[1]-q[1])<gradeTolerance){
     splitReport.welded++;
     return id;
    }
   }
  const id=vertices.length;
  vertices.push([...p]);
  const k=xi+':'+zi,ids=bins.get(k)||[];ids.push(id);bins.set(k,ids);
  return id;
 };
 for(let i=0;i<count;i+=3){
  const t=[0,1,2].map(k=>{const j=index?index.getX(i+k):i+k;return findNode([attribute.getX(j),attribute.getY(j),attribute.getZ(j)]);});
  if(new Set(t).size<3)continue;
  if(Math.abs(xzArea(...t.map(id=>vertices[id])))<1e-8)continue;
  if(xzArea(...t.map(id=>vertices[id]))>0)t.reverse();
  tris.push(t);
 }
 const cellSize=2,edges=new Map();
 const addEdge=(a,b)=>{
  const pa=vertices[a],pb=vertices[b],minX=Math.floor((Math.min(pa[0],pb[0])-snap)/cellSize),
   maxX=Math.floor((Math.max(pa[0],pb[0])+snap)/cellSize),
   minZ=Math.floor((Math.min(pa[2],pb[2])-snap)/cellSize),
   maxZ=Math.floor((Math.max(pa[2],pb[2])+snap)/cellSize);
  const edge={a,b};
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
   const key=x+':'+z,list=edges.get(key)||[];list.push(edge);edges.set(key,list);
  }
 };
 // Edges already appear twice for adjacent triangles: index only once.
 const seenEdges=new Set();
 for(const tri of tris)for(let i=0;i<3;i++){
  const a=tri[i],b=tri[(i+1)%3],key=edgeKey(a,b);
  if(seenEdges.has(key))continue;seenEdges.add(key);addEdge(a,b);
 }
 // Weld in-bounds T vertices onto the exact owner edge plane. Inserting
 // temporary points without matching Y was the reason for line-sized gaps.
 for(const v of vertices){
  const box=edges.get(Math.floor(v[0]/cellSize)+':'+Math.floor(v[2]/cellSize))||[];
  let best=null;
  for(const e of box){
   const a=vertices[e.a],b=vertices[e.b],dx=b[0]-a[0],dz=b[2]-a[2],len=dx*dx+dz*dz;
   if(len<1e-7)continue;
   const t=((v[0]-a[0])*dx+(v[2]-a[2])*dz)/len;
   if(t<1e-4||t>1-1e-4)continue;
   const x=a[0]+dx*t,z=a[2]+dz*t,d=Math.hypot(x-v[0],z-v[2]);
   if(d>snap)continue;
   const y=a[1]+(b[1]-a[1])*t,delta=Math.abs(y-v[1]);
   if(delta>=gradeTolerance)continue;
   if(!best||d<best.distance)best={distance:d,x,y,z};
  }
  if(best&&Math.abs(v[1]-best.y)>.0001){v[0]=best.x;v[1]=best.y;v[2]=best.z;splitReport.gradeAligned++;}
 }
 const sides=new Map();
 for(const tri of tris)for(let i=0;i<3;i++){
  const a=tri[i],b=tri[(i+1)%3],key=edgeKey(a,b),e=sides.get(key);
  if(e)e.count++;else sides.set(key,{a,b,count:1});
 }
 // Trace boundary edge loops: outward perimeter is clockwise in XZ (+Y
 // normals), actual internal voids are counterclockwise. Seal ONLY tiny
 // closed internal loops so an intentional missing/erased road stays erased.
 const boundary=[...sides.values()].filter(x=>x.count===1),depart=new Map();
 for(const e of boundary){
  const list=depart.get(e.a)||[];list.push(e.b);depart.set(e.a,list);
 }
 const used=new Set();
 const holes=[];
 for(const first of boundary){
  const origin=edgeKey(first.a,first.b);if(used.has(origin))continue;
  const loop=[first.a],trail=new Set(),initial=first.a;let current=first.b,previous=first.a,closed=false;
  used.add(origin);
  for(let k=0;k<1200;k++){
   if(current===initial){closed=true;break;}
   if(trail.has(current))break;
   trail.add(current);loop.push(current);
   const candidates=(depart.get(current)||[]).filter(next=>next!==previous&&!used.has(edgeKey(current,next)));
   if(candidates.length!==1)break;
   const next=candidates[0];used.add(edgeKey(current,next));previous=current;current=next;
  }
  if(!closed||loop.length<3||loop.length>180)continue;
  const points=loop.map(id=>vertices[id]),minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),
   minZ=Math.min(...points.map(p=>p[2])),maxZ=Math.max(...points.map(p=>p[2])),
   diameter=Math.hypot(maxX-minX,maxZ-minZ);
  let area=0;
  for(let i=0;i<points.length;i++){
   const p=points[i],q=points[(i+1)%points.length];area+=p[0]*q[2]-q[0]*p[2];
  }
  area/=2;
  if(area<=1e-5||area>maxHoleArea||diameter>maxHoleDiameter){splitReport.holesIgnored++;continue;}
  const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  if(maxY-minY>Math.min(.5,gradeTolerance*3)){splitReport.holesIgnored++;continue;}
  holes.push(points);
 }
 const positions=[];
 const emit=(a,b,c)=>{
  if(Math.abs(xzArea(a,b,c))<1e-8)return;
  for(const p of xzArea(a,b,c)<0?[a,b,c]:[a,c,b])positions.push(...p);
 };
 for(const [a,b,c]of tris)emit(vertices[a],vertices[b],vertices[c]);
 for(const hole of holes){
  // Tiny internal voids are normally triangular or convex after clipping.
  const centroid=[hole.reduce((s,p)=>s+p[0],0)/hole.length,
   hole.reduce((s,p)=>s+p[1],0)/hole.length,
   hole.reduce((s,p)=>s+p[2],0)/hole.length];
  for(let j=0;j<hole.length;j++)emit(centroid,hole[j],hole[(j+1)%hole.length]);
  splitReport.holesSealed++;
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.computeVertexNormals();geometry.computeBoundingSphere();
 splitReport.triangleCount=positions.length/9;
 return {geometry,stats:splitReport};
}
