import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const reference='dfdeed5a331773275c412068f801d25ef9737baf',authoring='403e3c5fbe8776f751988b475d5b040928437a62';
const git=args=>execFileSync('git',args,{maxBuffer:20*1024*1024});
const hash=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
for(const commit of [reference,authoring]){try{git(['cat-file','-e',commit+'^{commit}']);}catch{git(['fetch','--no-tags','--depth=1','origin',commit]);}}
const original=git(['show',reference+':index.html']);
for(const entry of ['index.html','museum.html'])assert((await readFile(entry)).equals(original),entry+' must be the exact full original entrypoint');
const files=git(['ls-tree','-r',reference,'--','src','data','assets']).toString().trim().split('\n');
for(const row of files){const [meta,path]=row.split('\t');const expected=meta.split(' ')[2];assert.equal(hash(await readFile(path)),expected,'Original visual resource changed: '+path);}
const workshop=await readFile('workshop.html','utf8');
const normalized=workshop.replaceAll('./src/workshop-road-editor.js?','./src/road-editor.js?').replaceAll('./src/workshop-terrain-voids.js?','./src/terrain-voids.js?');
assert.equal(normalized,git(['show',authoring+':workshop.html']).toString(),'Workshop must be preserved, except isolated module paths');
for(const [copy,source]of [['src/workshop-road-editor.js','src/road-editor.js'],['src/workshop-terrain-voids.js','src/terrain-voids.js']])assert((await readFile(copy)).equals(git(['show',authoring+':'+source])),'Authoring API lost: '+copy);
assert(!(await readFile('.github/workflows/museum-workshop-split.yml','utf8')).includes('deploy-pages'),'Rejected replacement must not deploy');
await mkdir('qa-original-museum',{recursive:true});
await writeFile('qa-original-museum/source-parity.json',JSON.stringify({passed:true,reference,entrypoints:['index.html','museum.html'],originalResourcesCompared:files.length,workshopPreserved:true},null,2));
console.log('ORIGINAL_MUSEUM_SOURCE_PARITY_PASS',files.length);
