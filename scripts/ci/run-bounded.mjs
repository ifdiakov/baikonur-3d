import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,createWriteStream} from 'node:fs';
import {resolve} from 'node:path';
export async function runBounded(command,args,{seconds=300,name='step',out='qa-ci'}={}){
 if(!(seconds>0&&seconds<=1800))throw Error('Invalid test deadline');mkdirSync(out,{recursive:true});const start=Date.now(),log=createWriteStream(`${out}/${name}.log`);let timedOut=false;
 const child=spawn(command,args,{env:process.env,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
 for(const [stream,sink]of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',b=>{log.write(b);sink.write(b);});
 const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},2000).unref();},seconds*1000);
 const result=await new Promise(resolve=>{child.once('error',e=>resolve({code:1,error:e.message}));child.once('close',(code,signal)=>resolve({code:code??1,signal}));});clearTimeout(timer);log.end();
 const report={command,args,name,seconds,elapsedMs:Date.now()-start,timedOut,...result,passed:!timedOut&&result.code===0};writeFileSync(`${out}/${name}.json`,JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){const [sec,name,command,...args]=process.argv.slice(2);const r=await runBounded(command,args,{seconds:Number(sec),name});if(!r.passed)process.exitCode=r.timedOut?124:r.code||1;}
