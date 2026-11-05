import {pruneTerminalBranches} from './transport-pruning.js?v=20261029-transport-cleanup-v2';

export const RAIL_TERMINAL_AUDIT_VERSION='site-matched-rail-ends-v1';
// Radius in museum world units. Only rail-service compounds own a destination
// envelope; an unrelated nearby catalogue pin cannot preserve spare sidings.
export const RAIL_TERMINAL_SITES=Object.freeze({
 'pad-1':17,'pad-31':17,'pad-45':17,'pad-81':28,
 'pad-90':20,'pad-92':23,'pad-92а':23,'pad-110':19,
 'pad-112':20,'pad-112a':18,'pad-200':29,'pad-250':22,
 'pad-251':23,'pad-254':18,'pad-42':17,'pad-41':18,
 'pad-113':17,'pad-114б':17
});
const distanceSquared=(a,b)=>(a.x-b.x)**2+(a.z-b.z)**2;
const isStation=f=>f?.geometry?.type==='Point'&&['station','halt'].includes(f.properties?.tags?.railway);
function nearest(node,targets){
 let best=null,distance=Infinity;
 for(const target of targets){const d=distanceSquared(node.position,target.position);if(d<distance){distance=d;best=target;}}
 return best?{...best,distance:Math.sqrt(distance)}:null;
}
/** Match real OSM terminal nodes, not visual crossings, with site and station anchors. */
export function matchRailTermini({graph,siteRecords=[],railPoints=[],schemeStations=[],geography,point,
 siteRadiusById=RAIL_TERMINAL_SITES,stationRadius=15}={}){
 if(!graph?.nodes||!Array.isArray(siteRecords)||typeof point!=='function')throw Error('Rail audit needs an OSM graph and registered site anchors');
 const sites=siteRecords.filter(s=>Number.isFinite(siteRadiusById[s.id])&&!s.aliasOf&&s.render!==false)
  .map(s=>({id:s.id,name:s.name??s.titleShort??s.id,kind:'site',radius:siteRadiusById[s.id],position:point(s.x,s.y,0)}));
 const stations=railPoints.filter(isStation).map(f=>({id:'station-'+f.properties.osmId,
  name:f.properties.name||f.properties.tags?.name||'Станция',kind:'station',radius:stationRadius,
  position:point(...geography.project(...f.geometry.coordinates),0)}));
 for(const s of schemeStations)if(s?.position)stations.push({id:s.id,name:s.name,kind:'scheme-station',radius:stationRadius,position:s.position});
 const records=[];
 for(const node of graph.nodes.values()){
  if(node.edges.length!==1)continue;
  const site=nearest(node,sites),station=nearest(node,stations);
  const matchedStation=station&&station.distance<=station.radius?station:null;
  const matchedSite=site&&site.distance<=site.radius?site:null,match=matchedStation||matchedSite;
  records.push({nodeId:node.id,coordinates:[...node.coord],
   match:match?{id:match.id,name:match.name,kind:match.kind,distance:+match.distance.toFixed(3)}:null,
   nearestSite:site?{id:site.id,distance:+site.distance.toFixed(3)}:null,
   nearestStation:station?{id:station.id,distance:+station.distance.toFixed(3)}:null,
   sourceWayId:node.edges[0].wayId,edge:node.edges[0]});
 }
 return {records,sites,stations,protectedNode:n=>n.id.startsWith('clip:')||
  sites.some(s=>distanceSquared(n.position,s.position)<s.radius*s.radius)||
  stations.some(s=>distanceSquared(n.position,s.position)<s.radius*s.radius)};
}
/** Remove unassigned short terminal spurs without altering real OSM topology.
 * Full source routes, protected model sockets, schematic yards and stations
 * are supplied as protected edges before this display-only filtering step. */
export function pruneUnassignedRailTermini({graph,protectedEdges=new Set(),siteRecords=[],
 railPoints=[],schemeStations=[],geography,point,eligible=()=>true,maxLength=85}={}){
 const audit=matchRailTermini({graph,siteRecords,railPoints,schemeStations,geography,point});
 const result=pruneTerminalBranches(graph,{maxLength,protectedEdges,protectedNode:audit.protectedNode,
  eligible:e=>!e.abandoned&&e.tags?.usage!=='main'&&e.tags?.usage!=='branch'&&e.tags?.service!=='crossover'&&
   !e.tags?.name&&!e.tags?.ref&&!e.tags?.destination&&!(e.tags?.bridge&&e.tags.bridge!=='no')&&
   !(e.tags?.tunnel&&e.tags.tunnel!=='no')&&eligible(e)});
 for(const edge of protectedEdges)if(result.removed.has(edge))throw Error('A protected rail connection was pruned');
 const termini=audit.records.filter(n=>n.coordinates[1]>=45.70&&n.coordinates[1]<=46.135);
 const removedEnds=termini.filter(n=>result.removed.has(n.edge));
 const bySite=new Map();
 for(const n of termini.filter(n=>n.match?.kind==='site')){
  const key=n.match.id,entry=bySite.get(key)||{id:key,name:n.match.name,sourceEnds:0,removed:0};
  entry.sourceEnds++;if(result.removed.has(n.edge))entry.removed++;bySite.set(key,entry);
 }
 const assignments={site:0,station:0,unmatched:0};
 for(const n of termini)assignments[n.match?.kind==='site'?'site':n.match?'station':'unmatched']++;
 return {...result,stats:{...result.stats,matchingVersion:RAIL_TERMINAL_AUDIT_VERSION,
  sourceGraphUnchanged:true,siteMatching:'source-ends-to-rail-site-and-station-anchors',
  auditedEndNodes:termini.length,terminalAssignments:assignments,
  siteReferences:audit.sites.length,stationReferences:audit.stations.length,
  removedTerminalEnds:removedEnds.length,removedTerminalWayIds:[...new Set(removedEnds.map(n=>n.sourceWayId))],
  keptMatchedSiteEnds:termini.filter(n=>n.match?.kind==='site'&&!result.removed.has(n.edge)).length,
  keptMatchedStationEnds:termini.filter(n=>n.match&&n.match.kind!=='site'&&!result.removed.has(n.edge)).length,
  siteEndMatches:[...bySite.values()].sort((a,b)=>b.sourceEnds-a.sourceEnds),
  removedEndSamples:removedEnds.slice(0,80).map(n=>({nodeId:n.nodeId,coordinates:n.coordinates,
   sourceWayId:n.sourceWayId,nearestSite:n.nearestSite,nearestStation:n.nearestStation}))
 }};
}
