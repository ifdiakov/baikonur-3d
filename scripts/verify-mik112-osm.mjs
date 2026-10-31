import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MIK112_OSM_WAY_IDS} from '../src/mik112-rail-plan.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),outputFlag=args.indexOf('--output');
const output=path.resolve(outputFlag>=0?args[outputFlag+1]:'qa-mik112-osm/current-source.json');
const started=new Date().toISOString(),timeoutMs=25000;
const archived=JSON.parse(await fs.readFile(path.join(root,'data/osm/railways.geojson'),'utf8'));
const archiveWays=new Map(archived.features.map(feature=>[String(feature.properties.osmId),feature]));
const url='https://api.openstreetmap.org/api/0.6/ways.json?ways='+MIK112_OSM_WAY_IDS.join(',');
const report={version:'mik112-live-osm-topology-v1',status:'pending',requestedAt:started,fetchedAt:null,
 sourceUrl:url,source:'OpenStreetMap API 0.6',archiveTimestamp:archived.osmBaseTimestamp??'2026-10-28T17:10:51Z',
 checkedWayIds:[...MIK112_OSM_WAY_IDS],timeoutMs,checks:[],
 scope:'Railway way node chains and railway tags; no OSM writes. Source coordinates and building facade measurements are not certified by this check.'};

let failure=null;
try{
 for(const id of MIK112_OSM_WAY_IDS)if(!archiveWays.has(id))throw new Error('Archived required OSM railway way is missing: '+id);
 const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'BaikonurMuseum-SourceVerification/1.0'},signal:AbortSignal.timeout(timeoutMs)});
 if(!response.ok)throw new Error('OpenStreetMap API HTTP '+response.status+' '+response.statusText);
 const live=await response.json();report.fetchedAt=new Date().toISOString();report.generator=live.generator??null;
 if(!Array.isArray(live.elements))throw new Error('OpenStreetMap returned no element list');
 const ways=new Map(live.elements.filter(element=>element.type==='way').map(element=>[String(element.id),element]));
 for(const id of MIK112_OSM_WAY_IDS){
  const before=archiveWays.get(id).properties,after=ways.get(id),sourceIds=before.sourceNodeIds.map(String),nodeIds=after?.nodes?.map(String)??[];
  const equal=(a,b)=>a.length===b.length&&a.every((value,i)=>value===b[i]);
  const same=equal(sourceIds,nodeIds),reversed=!same&&equal(sourceIds,[...nodeIds].reverse());
  const railwayType=after?.tags?.railway??null,railwayUnchanged=railwayType===before.tags?.railway;
  report.checks.push({wayId:id,url:'https://www.openstreetmap.org/way/'+id,present:!!after,visible:after?.visible!==false,
   liveVersion:after?.version??null,liveTimestamp:after?.timestamp??null,
   archivedNodeCount:sourceIds.length,liveNodeCount:nodeIds.length,nodeChain:same?'identical':reversed?'reversed-same-topology':'changed',
   archivedRailway:before.tags?.railway??null,liveRailway:railwayType,
   passed:!!after&&after.visible!==false&&(same||reversed)&&railwayUnchanged,
   ...((!after||!same&&!reversed)?{archivedNodeIds:sourceIds,liveNodeIds:nodeIds}:{})});
 }
 const changed=report.checks.filter(check=>!check.passed);
 report.status=changed.length?'changed-topology':'verified';
 if(changed.length)throw new Error('Current OpenStreetMap differs from the reviewed MIK railway topology on ways '+changed.map(check=>check.wayId).join(', '));
}catch(error){
 if(report.status!=='changed-topology')report.status='network-error';
 failure=error;report.error={name:error?.name??'Error',message:String(error?.message??error),cause:error?.cause?.message??null};
}finally{
 report.completedAt=new Date().toISOString();
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
}
if(failure){
 console.error('MIK112_OSM_VERIFY_FAILED',JSON.stringify({status:report.status,message:report.error.message,cause:report.error.cause,output}));process.exitCode=1;
}else console.log('MIK112_OSM_VERIFY_PASS',JSON.stringify({ways:report.checks.length,fetchedAt:report.fetchedAt,output}));
