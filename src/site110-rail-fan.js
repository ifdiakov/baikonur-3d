import * as THREE from 'three';
import {createPairedRailApproach} from './paired-rail-approach.js?v=20261031-facilities-rails-lighting-v4';

const V=(...p)=>new THREE.Vector3(...p),horizontal=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const STARTS=['1834612466','1834612469','1834612466','1834612469'];
const IDS=['site110-left-west','site110-left-east','site110-right-west','site110-right-east'];
const LINKS=[
 {id:'site110-west-source-entry',wayId:'37546649',from:'1834612445',to:'1834612476',visible:true},
 {id:'site110-source-crossover-316',wayId:'172571316',from:'1834612515',to:'1834612542',visible:true},
 {id:'site110-source-crossover-347',wayId:'172571347',from:'1834612638',to:'1834612748',visible:true},
 {id:'site110-hidden-siding-37546649',wayId:'37546649',from:'1834612628',to:'1834612955',visible:false},
 {id:'site110-hidden-siding-347',wayId:'172571347',from:'1834612748',to:'1834613005',visible:false},
 {id:'site110-hidden-siding-273',wayId:'172571273',from:'1834612607',to:'1834612641',visible:false}
];

function segmentCross(a,b,c,d){
 const rx=b.x-a.x,rz=b.z-a.z,sx=d.x-c.x,sz=d.z-c.z,den=rx*sz-rz*sx;
 if(Math.abs(den)<1e-12)return null;
 const dx=c.x-a.x,dz=c.z-a.z,t=(dx*sz-dz*sx)/den,u=(dx*rz-dz*rx)/den;
 return t>1e-8&&t<1-1e-8&&u>1e-8&&u<1-1e-8?{t,u,position:a.clone().lerp(b,t)}:null;
}
function sample(track,station){
 let lo=0,hi=track.stations.length-1;
 while(lo+1<hi){const mid=(lo+hi)>>1;if(track.stations[mid]<station)lo=mid;else hi=mid;}
 const t=THREE.MathUtils.clamp((station-track.stations[lo])/(track.stations[hi]-track.stations[lo]),0,1);
 return track.points[lo].clone().lerp(track.points[hi],t);
}
const frame=(track,station)=>sample(track,Math.min(track.stations.at(-1),station+.025)).sub(sample(track,Math.max(0,station-.025))).normalize();
function insert(track,station,position){
 const at=track.stations.findIndex(s=>s>=station-1e-10);
 if(at>=0&&Math.abs(track.stations[at]-station)<1e-9){track.points[at].copy(position);return;}
 track.stations.splice(at,0,station);track.points.splice(at,0,position.clone());
}
function hermite(y0,y1,m0,m1,length,t){
 return (2*t*t*t-3*t*t+1)*y0+(t*t*t-2*t*t+t)*m0*length+(-2*t*t*t+3*t*t)*y1+(t*t*t-t*t)*m1*length;
}
function profile(start,junction,end,at,total,halfFlat){
 const before=at-halfFlat,after=at+halfFlat;
 // Integrate a smooth ramp in grade: both grade and its derivative reach
 // zero at the source, the level crossing and the model gate.
 const gradeEase=t=>{
  const ramp=.25;if(t>1-ramp)return 1-gradeEase(1-t);
  if(t>=ramp)return (t-ramp/2)/(1-ramp);
  const u=t/ramp;return ramp*(u*u*u-.5*u*u*u*u)/(1-ramp);
 };
 return s=>s<before?THREE.MathUtils.lerp(start,junction,gradeEase(s/before)):s<=after?junction:THREE.MathUtils.lerp(junction,end,gradeEase((s-after)/(total-after)));
}
function cumulative(points){const result=[0];for(let i=1;i<points.length;i++)result.push(result.at(-1)+horizontal(points[i-1],points[i]));return result;}
function mapStation(value,anchors){
 for(let i=1;i<anchors.length;i++)if(value<=anchors[i][0]+1e-9){const [a,x]=anchors[i-1],[b,y]=anchors[i];return THREE.MathUtils.lerp(x,y,(value-a)/(b-a));}
 return anchors.at(-1)[1];
}
function section(graph,wayId,from,to){
 const way=graph.ways.find(way=>String(way.osmId)===wayId);if(!way)throw new Error('Missing Site110 source way '+wayId);
 const nodes=[way.segments[0].a,...way.segments.map(edge=>edge.b)],a=nodes.findIndex(n=>n.id===from),b=nodes.findIndex(n=>n.id===to);
 if(a<0||b<0)throw new Error('Missing Site110 source interval '+from+'/'+to);
 const edges=way.segments.slice(Math.min(a,b),Math.max(a,b));
 return {nodes:a<b?nodes.slice(a,b+1):nodes.slice(b,a+1).reverse(),edges};
}

export function railPolylineMetrics(points){
 let length=0,minRadius=Infinity,maxGrade=0,maxTurn=0,maxGradeChange=0,previousGrade=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],ab=horizontal(a,b),grade=(b.y-a.y)/ab;
  length+=ab;maxGrade=Math.max(maxGrade,Math.abs(grade));
  if(i>1)maxGradeChange=Math.max(maxGradeChange,Math.abs(grade-previousGrade));previousGrade=grade;
  if(i+1===points.length)continue;
  const c=points[i+1],bc=horizontal(b,c);
  const dot=((b.x-a.x)*(c.x-b.x)+(b.z-a.z)*(c.z-b.z))/(ab*bc);
  maxTurn=Math.max(maxTurn,Math.acos(THREE.MathUtils.clamp(dot,-1,1)));
 }
 // Source-node inserts can divide an existing chord into arbitrarily tiny
 // collinear pieces. Measure bend radius over a fixed physical window, so
 // it describes the displayed curve instead of those bookkeeping splits.
 const track={points,stations:cumulative(points)},window=.24;
 for(let s=window;s<length-window;s+=.12){
  const a=sample(track,s-window),b=sample(track,s),c=sample(track,s+window),ab=horizontal(a,b),bc=horizontal(b,c),ac=horizontal(a,c),cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
  if(cross>1e-12)minRadius=Math.min(minRadius,ab*bc*ac/(2*cross));
 }
 return {length,minRadius:Number.isFinite(minRadius)?minRadius:null,radiusWindow:window*2,maxGrade,maxGradeChange,maxTurnDegrees:maxTurn*180/Math.PI};
}

/** The four original source routes share one displayed fan. Source graph
 * identities/positions stay immutable; this table explicitly maps the short
 * museum approach tails into the fixed enlarged model's four head ports. */
export function createSite110RailFan({railGraph,sourcePlan,ports,sampleStep=.12}){
 if(ports.length!==4)throw new Error('Site110 needs four fixed model rail ports');
 const routes=IDS.map(id=>sourcePlan.destinationRoutes.find(route=>route.id===id));
 const replacedEdges=new Set(),tails=routes.map((route,i)=>{
  const index=route.nodeIds.indexOf(STARTS[i]);if(index<1)throw new Error('Site110 source entry is missing');
  const points=route.points.slice(index),nodeIds=route.nodeIds.slice(index),edges=route.edges.slice(index);
  edges.forEach(edge=>replacedEdges.add(edge));
  return {route,points,nodeIds,edges,distances:cumulative(points),incoming:route.points[index].clone().sub(route.points[index-1]).setY(0).normalize()};
 });
 const rows=tails.map((tail,i)=>({id:IDS[i],start:tail.points[0],startTangent:tail.incoming,end:ports.find(p=>p.id===IDS[i]).end,endTangent:ports.find(p=>p.id===IDS[i]).inward}));
 const pairs=[createPairedRailApproach(rows.slice(0,2),{sampleStep,innerRadius:8,entryBlend:3}),createPairedRailApproach(rows.slice(2),{sampleStep,innerRadius:5,entryBlend:3})];
 const tracks=pairs.flatMap(pair=>pair.tracks),crosses=[];
 for(const track of tracks){track.corridorStations=track.stations;track.stations=cumulative(track.points);}
 for(let i=1;i<tracks[1].points.length;i++)for(let j=1;j<tracks[2].points.length;j++){
  const hit=segmentCross(tracks[1].points[i-1],tracks[1].points[i],tracks[2].points[j-1],tracks[2].points[j]);
  if(hit)crosses.push({...hit,leftStation:THREE.MathUtils.lerp(tracks[1].stations[i-1],tracks[1].stations[i],hit.t),rightStation:THREE.MathUtils.lerp(tracks[2].stations[j-1],tracks[2].stations[j],hit.u),
   leftCorridor:THREE.MathUtils.lerp(tracks[1].corridorStations[i-1],tracks[1].corridorStations[i],hit.t),rightCorridor:THREE.MathUtils.lerp(tracks[2].corridorStations[j-1],tracks[2].corridorStations[j],hit.u)});
 }
 if(crosses.length!==1)throw new Error('Site110 fan must have one declared source crossing (1834612534), found '+crosses.length);
 const crossing=crosses[0],halfFlat=.75;
 const junctionStations=tracks.map((track,i)=>mapStation(i<2?crossing.leftCorridor:crossing.rightCorridor,track.corridorStations.map((s,j)=>[s,track.stations[j]])));
 const before=Math.min(...junctionStations.map(s=>s-halfFlat)),after=Math.min(...tracks.map((track,i)=>track.stations.at(-1)-junctionStations[i]-halfFlat));
 const junctionY=THREE.MathUtils.lerp(rows[2].start.y,rows[2].end.y,before/(before+after));
 crossing.position.y=junctionY;
 for(let i=0;i<tracks.length;i++){
  const track=tracks[i],at=junctionStations[i],y=profile(rows[i].start.y,junctionY,rows[i].end.y,at,track.stations.at(-1),halfFlat);
  for(const station of [at-halfFlat,at+halfFlat])insert(track,station,sample(track,station));
  track.points.forEach((p,j)=>p.y=y(track.stations[j]));
  track.points[0].copy(rows[i].start);track.points.at(-1).copy(rows[i].end);
  delete track.corridorStations;
 }
 insert(tracks[1],crossing.leftStation,crossing.position);insert(tracks[2],crossing.rightStation,crossing.position);

 const rawDistance=(i,id)=>tails[i].distances[tails[i].nodeIds.indexOf(id)],total=i=>tracks[i].stations.at(-1);
 const anchors=tails.map((tail,i)=>[[0,0],[tail.distances.at(-1),total(i)]]);
 anchors[1].splice(1,0,[rawDistance(1,'1834612534'),crossing.leftStation]);
 anchors[2].splice(1,0,[rawDistance(2,'1834612534'),crossing.rightStation]);
 // The two genuine crossovers need enough longitudinal room to enter the
 // paired corridor smoothly. Their source order and incident ways persist.
 const west2515=mapStation(rawDistance(0,'1834612515'),anchors[0]),east2542=west2515+6,east2638=east2542+4.5,west2748=east2638+7;
 anchors[0].splice(1,0,[rawDistance(0,'1834612515'),west2515],[rawDistance(0,'1834612748'),west2748]);
 anchors[1].splice(2,0,[rawDistance(1,'1834612542'),east2542],[rawDistance(1,'1834612607'),east2542+2.5],[rawDistance(1,'1834612638'),east2638]);
 const mapped=new Map();
 for(let i=0;i<tracks.length;i++){
  const track=tracks[i],tail=tails[i];track.nodeStations=[];
  for(let j=0;j<tail.nodeIds.length;j++){
   const sourceNodeId=tail.nodeIds[j],station=mapStation(tail.distances[j],anchors[i]);
   const position=sourceNodeId==='1834612534'?crossing.position.clone():sample(track,station),existing=mapped.get(sourceNodeId);
   if(existing&&existing.position.distanceTo(position)>1e-7)throw new Error('Site110 shared displayed node mismatch '+sourceNodeId);
   const node=railGraph.nodes.get(sourceNodeId),record=existing??{sourceNodeId,sourcePosition:node.position.toArray(),position,trackIds:[],incidentSourceWays:[...new Set(node.edges.map(edge=>edge.wayId))]};
   if(!existing)mapped.set(sourceNodeId,record);record.trackIds.push(track.id);
   insert(track,station,record.position);track.nodeStations.push({sourceNodeId,station});
  }
  Object.assign(track,{sourceRouteId:tail.route.id,sourceNodeId:tail.route.nodeIds.at(-1),displaySourceNodeId:STARTS[i],sourceWayId:tail.edges[0].wayId,
   originalDestination:tail.points.at(-1).toArray(),sourcePoint:tail.points[0].toArray(),sourceTangent:tail.incoming.toArray(),gateInward:rows[i].endTangent.toArray()});
 }
 const atNode=id=>mapped.get(id)?.position.clone()??railGraph.nodes.get(id).position.clone();
 const nodeFrame=id=>{
  for(const track of tracks){const row=track.nodeStations.find(row=>row.sourceNodeId===id);if(row)return frame(track,row.station);}
  return null;
 };
 const joinedLinks=[],hiddenLinks=[];
 for(const spec of LINKS){
  const raw=section(railGraph,spec.wayId,spec.from,spec.to),metadata={...spec,sourceNodeIds:raw.nodes.map(n=>n.id),sourcePoints:raw.nodes.map(n=>n.position.toArray()),sourceGraphPreserved:true};
  if(!spec.visible){hiddenLinks.push({...metadata,visibility:'hidden-by-existing-pad110-mask',mappedStart:atNode(spec.from).toArray()});continue;}
  raw.edges.forEach(edge=>replacedEdges.add(edge));
  const start=atNode(spec.from),end=atNode(spec.to),startTangent=nodeFrame(spec.from)??raw.nodes[1].position.clone().sub(raw.nodes[0].position).normalize(),endTangent=nodeFrame(spec.to),length=horizontal(start,end),reach=length*.38;
  const d0=startTangent.clone().setY(0).normalize(),d1=endTangent.clone().setY(0).normalize();
  const curve=new THREE.CubicBezierCurve3(start.clone().setY(0),start.clone().setY(0).addScaledVector(d0,reach),end.clone().setY(0).addScaledVector(d1,-reach),end.clone().setY(0));
  const count=Math.max(24,Math.ceil(curve.getLength()/sampleStep));let points=Array.from({length:count+1},(_,i)=>curve.getPoint(i/count));
  if(spec.id==='site110-west-source-entry'){
   // This real outside entry lies on the inside of the left-hand turn. An
   // independent cubic crossed that host twice. Follow its signed offset
   // instead, easing the offset to zero only at the declared source switch.
   const host=tracks[0],origin=host.points[0],direction=host.startTangent.clone(),n=V(-direction.z,0,direction.x),delta=start.clone().sub(origin),from=delta.dot(direction),to=host.nodeStations.find(row=>row.sourceNodeId===spec.to).station;
   const lateral=delta.dot(n),slope=d0.dot(n)/d0.dot(direction),steps=Math.max(24,Math.ceil((to-from)/sampleStep));
   points=Array.from({length:steps+1},(_,i)=>{
    const t=i/steps,s=THREE.MathUtils.lerp(from,to,t),p=s<0?origin.clone().addScaledVector(direction,s):sample(host,s),d=s<0?direction:frame(host,s).setY(0).normalize();
    return p.addScaledVector(V(-d.z,0,d.x),hermite(lateral,0,slope,0,to-from,t));
   });
  }
  const stations=cumulative(points),run=stations.at(-1),secant=(end.y-start.y)/run;
  const slope=v=>{const s=v.y/Math.hypot(v.x,v.z);return s*secant>0?Math.sign(s)*Math.min(Math.abs(s),3*Math.abs(secant)):0;};
  points.forEach((p,i)=>p.y=hermite(start.y,end.y,slope(startTangent),slope(endTangent),run,stations[i]/run));
  points[0].copy(start);points.at(-1).copy(end);
  joinedLinks.push({...metadata,points,startTangent,endTangent,metrics:railPolylineMetrics(points)});
 }
 const mappedNodes=[...mapped.values()].map(({position,...row})=>({...row,displayPosition:position.toArray()}));
 const declaredJunctions=mappedNodes.filter(row=>railGraph.nodes.get(row.sourceNodeId).edges.length>2);
 for(const track of tracks)track.metrics=railPolylineMetrics(track.points);
 return {version:'site110-four-track-source-fan-v1',tracks,joinedLinks,hiddenLinks,mappedNodes,declaredJunctions,replacedEdges,
  stats:{version:'site110-four-track-source-fan-v1',tracks:tracks.map(({id,metrics,sourceRouteId,displaySourceNodeId,sourceNodeId})=>({id,metrics,sourceRouteId,displaySourceNodeId,sourceNodeId})),
   sourceNodesPreserved:true,sourceRoutesPreserved:true,sourceEntryNodes:[...new Set(STARTS)],declaredCrossingNode:'1834612534',crossingPosition:crossing.position.toArray(),junctionLevel:{sourceNodeId:'1834612534',datumY:junctionY,halfLength:halfFlat},
   replacedDisplayEdges:replacedEdges.size,mappedNodes:mappedNodes.length,joinedLinks:joinedLinks.map(({id,wayId,from,to,metrics})=>({id,wayId,from,to,metrics})),hiddenSourceLinks:hiddenLinks.length,pairs:pairs.map(pair=>pair.stats)}};
}
