import {build} from 'esbuild';import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {MODEL_CATALOG} from '../src/model-catalog.js';
await rm('public-app',{recursive:true,force:true});await mkdir('public-app',{recursive:true});
const result=await build({entryPoints:['src/public-museum.js'],outdir:'public-app',entryNames:'museum-[hash]',chunkNames:'chunk-[hash]',bundle:true,minify:true,splitting:true,format:'esm',target:['es2022'],metafile:true,legalComments:'linked'});
const entry=Object.keys(result.metafile.outputs).find(p=>result.metafile.outputs[p].entryPoint==='src/public-museum.js');if(!entry)throw Error('Missing runtime bundle');
await writeFile('museum.html',(await readFile('src/public-shell.html','utf8')).replace('__PUBLIC_ENTRY__','./'+entry));
await mkdir('public-data',{recursive:true});await writeFile('public-data/models.json',JSON.stringify(Object.values(MODEL_CATALOG).map(({id,title})=>({id,title}))));
console.log('PUBLIC_APP_BUILT',entry);
