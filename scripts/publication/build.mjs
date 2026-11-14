import {readFile,writeFile,mkdir,readdir,lstat,realpath,copyFile} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// This is an explicit release list, never a recursive copy of the checkout.
export function assertPublicPath(path){
 if(typeof path!=='string'||!path||path.startsWith('/')||path.includes('\\')||/[\0?#%]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')))
  throw new Error('Unsafe publication path: '+path);
 if(/^(?:docs|scripts|tests|previews|node_modules|qa-[^/]+)\//i.test(path)||/^(?:AGENTS\.md|PROJECT_CONTEXT\.md|README\.md|package(?:-lock)?\.json|workshop\.html)$/i.test(path)||/^src\/workshop-/i.test(path)||/\.(?:blend\d*|stl|fbx|obj|psd|zip|tar|tgz|map|log)$/i.test(path)||/(?:^|\/)_source-/i.test(path))
  throw new Error('Authoring or production file cannot be published: '+path);
}
async function physicalPath(path){
 path=resolve(path);
 try{return await realpath(path);}catch(e){if(e.code!=='ENOENT')throw e;}
 return resolve(await physicalPath(dirname(path)),relative(dirname(path),path));
}
export async function build({source=process.cwd(),destination=resolve(source,'dist-public'),manifest=resolve(source,'scripts/publication/files.json'),report=resolve(source,'qa-publication/build.json')}={}){
 source=await realpath(source);destination=await physicalPath(destination);
 if(destination===source||relative(destination,source).split(sep)[0]!=='..')throw new Error('Destination must not contain the source');
 try{if((await readdir(destination)).length)throw new Error('Destination must be empty: '+destination);}catch(e){if(e.code!=='ENOENT')throw e;}
 const config=JSON.parse(await readFile(manifest,'utf8'));
 if(config.version!==1||!Array.isArray(config.files)||!config.files.length)throw new Error('Invalid publication manifest');
 if(new Set(config.files).size!==config.files.length)throw new Error('Duplicate publication paths');
 const entries=[];
 // Validate every input before writing any output. Symlinks are not deployable.
 for(const path of config.files){
  assertPublicPath(path);
  const from=resolve(source,path),physical=await realpath(from);
  if(physical!==from||!physical.startsWith(source+sep)||(await lstat(from)).isFile()!==true)throw new Error('Not a regular source file: '+path);
  entries.push({path,from});
 }
 await mkdir(destination,{recursive:true});
 for(const entry of entries){
  const to=resolve(destination,entry.path);await mkdir(dirname(to),{recursive:true});await copyFile(entry.from,to);
  const bytes=await readFile(to);entry.bytes=bytes.length;entry.sha256=createHash('sha256').update(bytes).digest('hex');delete entry.from;
 }
 await writeFile(resolve(destination,'.nojekyll'),'\n');
 const result={passed:true,files:entries.length+1,bytes:entries.reduce((n,e)=>n+e.bytes,1),entries,generated:['.nojekyll'],note:'Only listed visitor files. Browser-delivered JS and GLB remain downloadable.'};
 await mkdir(dirname(report),{recursive:true});await writeFile(report,JSON.stringify(result,null,2)+'\n');
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=await build({destination:resolve(process.argv[2]||'dist-public')});
 console.log('PUBLICATION_BUILD_PASS',JSON.stringify({files:result.files,bytes:result.bytes}));
}
