import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {SourceTextModule} from 'node:vm';
import {createHash} from 'node:crypto';
import {assertPublicPath} from '../scripts/publication/build.mjs';
const root=resolve(process.argv[2]||'dist-public'),manifest=JSON.parse(await readFile('scripts/publication/files.json','utf8')),expected=new Set([...manifest.files,'.nojekyll']),actual=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,entry.name);if(entry.isDirectory())await walk(p);else{assert(entry.isFile(),'Only regular files are publishable');actual.push(relative(root,p));}}}
await walk(root);assert.deepEqual(actual.sort(),[...expected].sort(),'Published tree must exactly equal the allowlist');
const imports=[],hashes={};
function dependency(spec,file){
 if(spec==='three')spec='src/vendor/three-r160/build/three.module.js';
 else if(spec.startsWith('three/addons/'))spec=spec.replace('three/addons/','src/vendor/three-r160/examples/jsm/');
 else if(spec.startsWith('.')){const path=spec.split(/[?#]/)[0];spec=relative(root,resolve(root,dirname(file),path,path.endsWith('/')?'index.html':''));}
 else if(/^(https?:|data:|blob:|#|mailto:)/.test(spec))return;
 else return;
 assert(expected.has(spec),'Missing published dependency: '+file+' -> '+spec);imports.push({from:file,to:spec});
}
function module(source,file){
 const parsed=new SourceTextModule(source,{identifier:file});
 for(const spec of parsed.dependencySpecifiers)dependency(spec,file);
 for(const match of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g))dependency(match[1],file);
}
for(const file of manifest.files){
 assertPublicPath(file);const bytes=await readFile(resolve(root,file));
 hashes[file]=createHash('sha256').update(bytes).digest('hex');
 assert.deepEqual(bytes,await readFile(file),'Build must preserve approved runtime bytes: '+file);
 if(/\.(?:m?js)$/.test(file))module(bytes.toString(),file);
 if(file.endsWith('.html')){
  const html=bytes.toString();for(const m of html.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g))module(m[1],file);
  for(const m of html.matchAll(/(?:src|href)=["'](\.[^"']+)["']/g))dependency(m[1],file);
 }
}
for(const file of ['src/model-catalog.js','src/model-facts.js'])assert(!/github\.com\/ifdiakov\/baikonur-3d\/blob\//.test(await readFile(resolve(root,file),'utf8')),'Visitor source link must survive repository privacy');
await mkdir('qa-publication',{recursive:true});await writeFile('qa-publication/artifact.json',JSON.stringify({passed:true,files:actual.length,imports:imports.length,hashes},null,2));
console.log('PUBLICATION_ARTIFACT_PASS',actual.length,imports.length);
