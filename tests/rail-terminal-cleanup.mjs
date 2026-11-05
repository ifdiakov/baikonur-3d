import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildOsmGraph} from '../src/osm-transport.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createRailSchemePlan} from '../src/rail-scheme.js';
import {matchRailTermini,pruneUnassignedRailTermini,RAIL_TERMINAL_AUDIT_VERSION} from '../src/rail-terminal-cleanup.js';
const V=(x,z)=>new THREE.Vector3(x,0,z),nodes=new Map(),edges=[];
const node=(id,x,z)=>{const n={id,coord:[63+x/77400,45.9+z/111200],position:V(x,z),edges:[]};nodes.set(id,n);return n;};
const join=(a,b,id,tags={})=>{const e={a,b,wayId:id,length:a.position.distanceTo(b.position),tags};a.edges.push(e);b.edges.push(e);edges.push(e);return e;};
const j=node('j',0,0),left=node('l',-100,0),right=node('r',100,0),unknown=node('unknown',0,24),
 site=node('site',20,24),station=node('station',45,24),protectedEnd=node('protected',-20,24);
join(j,left,'main-west',{usage:'main'});join(j,right,'main-east',{usage:'main'});
const orphan=join(j,unknown,'stray',{service:'siding'}),siteEdge=join(j,site,'gate',{service:'spur'}),
 stationEdge=join(j,station,'platform',{service:'yard'}),protectedEdge=join(j,protectedEnd,'scheme');
const graph={nodes,edges},snapshot=JSON.stringify([...nodes.values()].map(n=>[n.id,n.edges.length,n.position.toArray()]));
const params={graph,protectedEdges:new Set([protectedEdge]),siteRecords:[{id:'pad-110',x:20,y:24}],
 railPoints:[{properties:{osmId:1,name:'Станция',tags:{railway:'station'}},geometry:{type:'Point',coordinates:[45,24]}}],
 geography:{project:(x,y)=>[x,y]},point:(x,y,h=0)=>new THREE.Vector3(x,h,y)};
const matched=matchRailTermini(params);
assert.equal(matched.records.find(n=>n.nodeId==='site').match?.id,'pad-110');
assert.equal(matched.records.find(n=>n.nodeId==='station').match?.kind,'station');
assert.equal(matched.records.find(n=>n.nodeId==='unknown').match,null);
const filter=pruneUnassignedRailTermini(params);
assert(filter.removed.has(orphan),'Unnamed orphan siding should disappear');
for(const e of [siteEdge,stationEdge,protectedEdge])assert(!filter.removed.has(e),'A station, launch site or protected route was erased');
assert.equal(filter.stats.removedTerminalEnds,1);
assert.equal(JSON.stringify([...nodes.values()].map(n=>[n.id,n.edges.length,n.position.toArray()])),snapshot);
const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const raw=read('data/osm/railways.geojson'),sourceBefore=JSON.stringify(raw);
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const source=buildOsmGraph(raw.features,{geography,point,rail:true}),scheme=createRailSchemePlan(source);
const actual=pruneUnassignedRailTermini({graph:source,protectedEdges:scheme.protectedEdges,
 siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false),
 railPoints:read('data/osm/rail-points.geojson').features,schemeStations:scheme.stations,geography,point,
 eligible:e=>e.a.coord[1]>=45.70&&e.b.coord[1]>=45.70});
assert.equal(actual.stats.matchingVersion,RAIL_TERMINAL_AUDIT_VERSION);
assert(actual.stats.auditedEndNodes>200&&actual.stats.siteReferences>=12&&actual.stats.stationReferences>30);
assert(actual.stats.terminalAssignments.site>10&&actual.stats.removedTerminalEnds>0);
assert(actual.stats.keptMatchedSiteEnds>15);
for(const e of scheme.protectedEdges)assert(!actual.removed.has(e),'The named railway scheme must remain connected');
assert.equal(JSON.stringify(raw),sourceBefore);
console.log('RAIL_TERMINAL_MATCH_PASS',JSON.stringify({audited:actual.stats.auditedEndNodes,assigned:actual.stats.terminalAssignments,
 siteEndMatches:actual.stats.siteEndMatches,removedEnds:actual.stats.removedTerminalEnds,
 removedEdges:actual.stats.removedSegments,removedLength:actual.stats.removedLength,
 removedWayIds:actual.stats.removedTerminalWayIds.slice(0,40)}));
