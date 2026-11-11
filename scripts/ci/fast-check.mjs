import {readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {SourceTextModule} from 'node:vm';
import {execFileSync} from 'node:child_process';
const started=performance.now(),errors=[],files=[];
function walk(dir){for(const f of readdirSync(dir,{withFileTypes:true})){const p=join(dir,f.name);if(f.isDirectory())walk(p);else if(p.endsWith('.js')||p.endsWith('.mjs'))files.push(p);}}
walk('src');
function parse(source,file){try{const module=new SourceTextModule(source,{identifier:file});for(const spec of module.dependencySpecifiers){if(!spec.startsWith('.'))continue;const target=resolve(dirname(file),spec.split(/[?#]/)[0]);if(!existsSync(target))errors.push(file+': missing import '+spec);}}catch(e){errors.push(file+': '+e.message);}}
for(const file of files)parse(readFileSync(file,'utf8'),file);
for(const file of ['index.html','museum.html','workshop.html']){const text=readFileSync(file,'utf8');for(const m of text.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g))parse(m[1],file);for(const m of text.matchAll(/(?:src|href)=["'](\.\/[^"'?#]+)(?:[?#][^"']*)?["']/g))if(!existsSync(resolve(dirname(file),m[1])))errors.push(file+': missing resource '+m[1]);}
if(readFileSync('index.html','utf8')!==readFileSync('museum.html','utf8'))errors.push('Public entrypoints diverge.');
const report={passed:errors.length===0,checkedModules:files.length,checkedEntrypoints:3,elapsedMs:Math.round(performance.now()-started),errors,coverage:'Syntax, static local imports and entrypoint resources. Not visual acceptance.'};mkdirSync('qa-delivery',{recursive:true});writeFileSync('qa-delivery/static.json',JSON.stringify(report,null,2));console.log('FAST_SOURCE_CHECK',JSON.stringify(report));if(errors.length)process.exitCode=1;
