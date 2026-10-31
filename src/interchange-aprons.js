import * as THREE from 'three';
import {HIGHWAY_ASPHALT_LIFT} from './highway-surface.js?v=20261031-road-markings-v1';

export const INTERCHANGE_APRON_VERSION='rounded-lower-junctions-v1';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const specifications=[
 {nodeId:'3734910038',rampWayId:'1082534311',connectorWayIds:['1082534307','1082534310']},
 {nodeId:'1833284265',rampWayId:'369722063',connectorWayIds:[]}
];
const other=(edge,node)=>edge.a===node?edge.b:edge.a;
const horizontal=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);

function follow(node,first,accept){
 const points=[node.position.clone()],ways=new Set(),seen=new Set();let edge=first,length=0;
 while(edge&&length<14&&!seen.has(edge)){
  seen.add(edge);ways.add(edge.wayId);
  const end=other(edge,node),source=edge.surfacePoints||[edge.a.position,edge.b.position],ps=edge.a===node?source:[...source].reverse();
  for(const p of ps.slice(1)){length+=horizontal(points.at(-1),p);points.push(p.clone());}
  const direction=end.position.clone().sub(node.position).setY(0).normalize();node=end;
  edge=node.edges.filter(e=>!seen.has(e)&&accept(e)).sort((a,b)=>
   other(b,node).position.clone().sub(node.position).setY(0).normalize().dot(direction)-
   other(a,node).position.clone().sub(node.position).setY(0).normalize().dot(direction))[0];
 }
 return {points,ways:[...ways]};
}

function sections(points,normalHint,coordinate){
 const out=[];let distance=0;
 for(let i=0;i<points.length;i++){
  if(i)distance+=horizontal(points[i-1],points[i]);
  const direction=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(i-1,0)]).setY(0).normalize();
  const normal=V(-direction.z,0,direction.x);if(normal.dot(normalHint)<0)normal.negate();
  out.push({p:points[i],normal,at:coordinate?coordinate(points[i]):distance});
 }
 return out;
}
function sample(sections,at){
 let i=1;while(i<sections.length-1&&sections[i].at<at)i++;
 const a=sections[i-1],b=sections[i],t=THREE.MathUtils.clamp((at-a.at)/(b.at-a.at||1),0,1);
 return {p:a.p.clone().lerp(b.p,t),normal:a.normal.clone().lerp(b.normal,t)};
}
function insideXZ(p,outline){
 let inside=false;
 for(let i=0,j=outline.length-1;i<outline.length;j=i++){
  const a=outline[i],b=outline[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
 }
 return inside;
}

/** Two display-only T junctions. Their existing road axes remain unchanged.
 * The far edge follows the lower road exactly; all widening faces the ramps,
 * away from the neighbouring railway. A short ribbon is never bent through
 * a right angle: a sampled surface fills the rounded junction instead. */
export function createInterchangeAprons(graph){
 const aprons=[];
 for(const spec of specifications){
  const node=graph.nodes.get(spec.nodeId),ramp=node?.edges.find(e=>e.wayId===spec.rampWayId),hosts=node?.edges.filter(e=>e.tags.highway==='primary');
  if(!ramp||hosts?.length!==2)continue;
  const width=ramp.width,half=width/2,hostHalf=Math.min(...hosts.map(e=>e.width))/2;
  const axis=other(hosts[0],node).position.clone().sub(other(hosts[1],node).position).setY(0).normalize();
  const approach=V(-axis.z,0,axis.x);if(approach.dot(other(ramp,node).position.clone().sub(node.position))<0)approach.negate();
  hosts.sort((a,b)=>other(b,node).position.clone().sub(node.position).dot(axis)-other(a,node).position.clone().sub(node.position).dot(axis));
  const hostPaths=hosts.map(e=>follow(node,e,q=>q.tags.highway==='primary'));
  const hostSections=hostPaths.map(path=>sections(path.points,approach));
  const rampPath=follow(node,ramp,e=>['trunk_link','motorway_link'].includes(e.tags.highway));
  const rampSections=sections(rampPath.points,axis,p=>p.clone().sub(node.position).dot(approach));
  // End at an existing rendered cross-section so the apron and ramp share
  // precisely the same two edge vertices at their ownership seam.
  const throat=rampSections.find(s=>s.at>=hostHalf+width*2/3);
  if(!throat)continue;
  const radius=throat.at-hostHalf,reach=half+radius;
  const hostAt=u=>sample(hostSections[u<0?1:0],Math.abs(u));
  const surface=(u,v,rowHalf)=>{
   const host=hostAt(u),hostPoint=host.p.addScaledVector(host.normal,v),rampAt=sample(rampSections,Math.max(0,v));
   const rampPoint=rampAt.p.addScaledVector(rampAt.normal,u);
   const boundary=THREE.MathUtils.smoothstep(v,hostHalf,throat.at),center=THREE.MathUtils.smoothstep(v,0,hostHalf*1.4);
   const interior=1-THREE.MathUtils.smoothstep(Math.abs(u),half*.65,rowHalf);
   return hostPoint.lerp(rampPoint,boundary+(center-boundary)*interior).add(V(0,HIGHWAY_ASPHALT_LIFT,0));
  };
  const rows=[];
  for(let i=0;i<=12;i++)rows.push({v:-hostHalf+2*hostHalf*i/12,half:reach});
  for(let i=1;i<=18;i++){const angle=Math.PI/2*(1-i/18);rows.push({v:throat.at-radius*Math.sin(angle),half:half+radius*(1-Math.cos(angle))});}
  const columns=24,grid=rows.map(row=>Array.from({length:columns+1},(_,i)=>surface(row.half*(2*i/columns-1),row.v,row.half))),triangles=[];
  for(let i=1;i<grid.length;i++)for(let j=1;j<=columns;j++)triangles.push([grid[i-1][j-1],grid[i][j-1],grid[i-1][j]],[grid[i-1][j],grid[i][j-1],grid[i][j]]);
  const outline=[...grid[0],...grid.slice(1).map(row=>row.at(-1)),...grid.at(-1).slice(0,-1).reverse(),...grid.slice(1,-1).reverse().map(row=>row[0])];
  const mask=THREE.ShapeUtils.triangulateShape(outline.map(p=>new THREE.Vector2(p.x,p.z)),[]).map(ids=>ids.map(i=>outline[i]));
  // These are X/Z ownership masks, not the graded rendering triangles. Use
  // the junction level for compatibility checks instead of extrapolating a
  // steep plane from a long, thin boundary triangle outside its interior.
  for(const polygon of mask)polygon.clipHeight=node.position.y+HIGHWAY_ASPHALT_LIFT;
  const bounds=new THREE.Box3().setFromPoints(outline);
  const contains=p=>p.x>=bounds.min.x&&p.x<=bounds.max.x&&p.z>=bounds.min.z&&p.z<=bounds.max.z&&Math.abs(p.y-node.position.y)<1.2&&insideXZ(p,outline);
  const curbs=[-1,1].map(side=>grid.slice(12).map(row=>row[side<0?0:columns]));
  const edgeLines=curbs.map((curve,k)=>{
   const normals=[],points=curve.map((p,i)=>{
   const direction=curve[Math.min(i+1,curve.length-1)].clone().sub(curve[Math.max(i-1,0)]).setY(0).normalize(),normal=V(-direction.z,0,direction.x);
   if(i===0)normal.copy(hostAt((k?1:-1)*reach).normal).negate();
   else if(i===curve.length-1)normal.copy(throat.normal).multiplyScalar(k?-1:1);
   else if(!contains(p.clone().addScaledVector(normal,.08)))normal.negate();
   normals.push(normal);return p.clone().addScaledVector(normal,.22).add(V(0,-HIGHWAY_ASPHALT_LIFT,0));
   });
   return {points,directionAt(p,fallback){
    const i=points.findIndex(q=>q.distanceToSquared(p)<1e-12);if(i<0)return fallback;
    const n=normals[i],d=V(n.z,0,-n.x);if(d.dot(fallback)<0)d.negate();return d;
   }};
  });
  aprons.push({spec,triangles,mask,outline,curbs,edgeLines,contains,grid,
   report:{nodeId:node.id,rampWayId:spec.rampWayId,hostWayIds:[...new Set(hosts.map(e=>e.wayId))],connectorWayIds:spec.connectorWayIds,
    center:node.position.toArray(),throat:throat.p.toArray(),radius,triangles:triangles.length,farCurbUnchanged:true,sourceTopologyPreserved:true}});
 }
 return aprons;
}
