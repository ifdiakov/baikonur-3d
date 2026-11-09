import {packGeometry,unpackGeometry,unpackTransportLayers,transferBuffers} from './transport-detail-codec.js';
export function createTransportDetailJob(){
 let worker=null,serial=0;const waiting=new Map(),report={mode:'worker',state:'idle',builds:0,buildMs:0,cutMs:0,error:null};
 const fail=error=>{for(const p of waiting.values()){clearTimeout(p.timer);p.reject(error);}waiting.clear();report.error=String(error.message||error);report.state='error';worker?.terminate();worker=null;};
 function request(action,input){
  if(!worker){worker=new Worker(new URL('./transport-detail-worker.bundle.js?v=20261109-nonblocking-v1',import.meta.url),{type:'module'});
   worker.onerror=e=>{e.preventDefault();fail(Error(e.message||'Transport worker failed'));};
   worker.onmessage=({data})=>{const p=waiting.get(data.id);if(!p)return;waiting.delete(data.id);clearTimeout(p.timer);if(data.error){p.reject(Error(data.error));return;}report[p.action==='cut'?'cutMs':'buildMs']=data.elapsedMs;p.resolve(data.value);};
  }
  const id=++serial;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>fail(Error('Transport preparation timed out')),180000);waiting.set(id,{resolve,reject,timer,action});worker.postMessage({id,action,input},transferBuffers(input));});
 }
 return {async build(input){report.state='building';report.builds++;const result=await request('build',input);report.state='installing';return{...result,roots:unpackTransportLayers(result.packet)};},
  async cut({meshes,...spec}){const rows=meshes.map(mesh=>({name:mesh.name,geometry:packGeometry(mesh.geometry,{copy:true})}));const result=await request('cut',{rows,...spec});return{geometries:result.rows.map(row=>row?unpackGeometry(row):null),stats:result.stats};},
  finish(){worker?.terminate();worker=null;report.state='ready';},dispose(error=Error('Transport job disposed')){fail(error);},stats:()=>({...report})};
}
