import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {transform,targets} from '../scripts/apply-evening-navigation.mjs';
const baseline='c3f6a737dc5f9c78332c7db3806251b104bc6456';
const git=args=>execFileSync('git',args,{maxBuffer:64*1024*1024});
try{git(['cat-file','-e',baseline+'^{commit}']);}catch{git(['fetch','--no-tags','--depth=1','origin',baseline]);}
for(const path of targets)assert.equal(await readFile(path,'utf8'),transform(path,git(['show',baseline+':'+path]).toString()),'Unapproved changes in '+path);
const hash=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
let preserved=0;
for(const row of git(['ls-tree','-r',baseline,'--','src','data','assets']).toString().trim().split('\n')){
 const [meta,path]=row.split('\t');if(targets.includes(path))continue;assert.equal(hash(await readFile(path)),meta.split(' ')[2],'Unrelated model, surface, road, texture or module changed: '+path);preserved++;
}
assert((await readFile('index.html')).equals(await readFile('museum.html')));
await mkdir('qa-original-museum',{recursive:true});
await writeFile('qa-original-museum/source-parity.json',JSON.stringify({passed:true,baseline,requestedChangesOnly:true,transformedFiles:targets,preservedResources:preserved},null,2));
console.log('EVENING_NAVIGATION_SOURCE_PARITY_PASS',preserved);
