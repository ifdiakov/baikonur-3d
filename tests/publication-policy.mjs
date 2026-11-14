import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,readdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build,assertPublicPath} from '../scripts/publication/build.mjs';
const checks=[];
for(const path of ['../secret','/tmp/secret','src/../../secret','src\\secret','src/%2e%2e/secret','.git/config','docs/CURRENT_WORK.md','scripts/export.py','tests/test.mjs','workshop.html','src/workshop-panel.js','assets/model.blend','assets/model.stl','assets/source.zip','assets/preloader/_source-04.webp','src/source.js.map']){
 assert.throws(()=>assertPublicPath(path),undefined,path);checks.push({path,denied:true});
}
for(const path of ['museum.html','workshop/model.html','src/model-viewer.js','assets/models/rockets/soyuz5.glb','src/vendor/three-r160/LICENSE'])assert.doesNotThrow(()=>assertPublicPath(path));
const dir=await mkdtemp(join(tmpdir(),'museum-publication-'));
try{
 const source=join(dir,'source'),destination=join(dir,'output'),manifest=join(dir,'manifest.json'),report=join(dir,'report.json');
 await mkdir(source);await writeFile(join(source,'museum.html'),'<h1>Museum</h1>');await writeFile(join(source,'NEW-PRIVATE-NOTES.txt'),'must never be published');
 await writeFile(manifest,JSON.stringify({version:1,files:['museum.html']}));
 await build({source,destination,manifest,report});
 assert.deepEqual((await readdir(destination)).sort(),['.nojekyll','museum.html']);
 assert.equal(await readFile(join(destination,'museum.html'),'utf8'),'<h1>Museum</h1>');checks.push({name:'Unlisted files stay private; published bytes are identical',passed:true});
 await assert.rejects(()=>build({source,destination,manifest,report}),/empty/);checks.push({name:'Stale destination cannot retain removed files',passed:true});
 await assert.rejects(()=>build({source,destination:dir,manifest,report}),/contain/);
 await symlink(join(source,'NEW-PRIVATE-NOTES.txt'),join(source,'link.txt'));
 await writeFile(manifest,JSON.stringify({version:1,files:['link.txt']}));
 await assert.rejects(()=>build({source,destination:join(dir,'symlink-output'),manifest,report}),/regular/);checks.push({name:'Symlink cannot escape the allowlist',passed:true});
 await writeFile(manifest,JSON.stringify({version:1,files:['missing.html']}));
 await assert.rejects(()=>build({source,destination:join(dir,'missing-output'),manifest,report}),/ENOENT/);checks.push({name:'Missing runtime input stops publication',passed:true});
 await writeFile(manifest,JSON.stringify({version:1,files:['museum.html','museum.html']}));
 await assert.rejects(()=>build({source,destination:join(dir,'duplicate-output'),manifest,report}),/Duplicate/);
}finally{await rm(dir,{recursive:true,force:true});}
const config=JSON.parse(await readFile('scripts/publication/files.json','utf8'));
for(const path of config.files)assertPublicPath(path);
for(const path of ['index.html','museum.html','model-sources.html','credits.html','workshop/model.html','src/transport-detail-worker.bundle.js','data/osm/transport-geometry-bake-v1.json.gz','assets/models/rockets/soyuz5.glb','src/vendor/three-r160/LICENSE'])assert(config.files.includes(path),'Missing visitor requirement '+path);
await mkdir('qa-publication',{recursive:true});await writeFile('qa-publication/policy.json',JSON.stringify({passed:true,checks},null,2));
console.log('PUBLICATION_POLICY_PASS',checks.length);
