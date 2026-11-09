import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,appendFileSync,cpSync,existsSync,mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';import {tmpdir} from 'node:os';
// Reuse only the exact application and generated acceptance script already
// checked by run 42682815383. Its publish failed AFTER all browser checks passed.
// Any changed byte => a new full candidate run, never a relaxed acceptance.
const source='c9d4540d104223a507920342b4f9e41478147232',runId=42682815383;
const evidence='qa-ci/prior-owner19',sha=b=>createHash('sha256').update(b).digest('hex');
const proof={reused:false,priorRunId:runId,priorSource:source,checkedFiles:0};
try{
 const browser=JSON.parse(readFileSync(evidence+'/qa-freeze/local/report.json'));
 const runner=JSON.parse(readFileSync(evidence+'/qa-ci/candidate-owner19.json'));
 const geometry=JSON.parse(readFileSync(evidence+'/qa-owner19/source-report.json'));
 assert(browser.passed&&runner.passed&&runner.code===0&&!runner.timedOut&&geometry.passed);
 assert.equal(browser.revision,'20261109-owner19-v2');assert.equal(geometry.checks.length,19);assert(geometry.checks.every(c=>c.passed));
 assert.deepEqual(browser.checks.map(c=>c.mode).sort(),['desktop','mobile','workshop']);
 for(const c of browser.checks){assert.equal(c.errors.length,0);assert.equal(c.collisions.length,0);assert(c.shaders);assert(c.lodPalettes.every(m=>m.type==='MeshStandardMaterial'&&m.color==='555751'));}
 execFileSync('git',['fetch','--no-tags','--depth=1','origin',source],{stdio:'inherit',timeout:30000});
 const temp=mkdtempSync(join(tmpdir(),'owner19-proven-source-'));
 const archive=execFileSync('git',['archive',source],{maxBuffer:220*1024*1024,timeout:30000});
 execFileSync('tar',['-xf','-','-C',temp],{input:archive,timeout:30000});
 // This is exactly the deterministic preparation executed in the saved run.
 execFileSync(process.execPath,['scripts/prepare-owner19-release.mjs'],{cwd:temp,stdio:'inherit',timeout:30000});
 const git=(...a)=>execFileSync('git',a,{encoding:'utf8',maxBuffer:4*1024*1024}).trim();
 const runtime=p=>/^(?:src|assets|data|workshop)\//.test(p)||/\.html$/.test(p)||p==='tests/owner19-browser.mjs'||p==='tests/owner19-source.mjs';
 const expected=git('ls-tree','-r','--name-only',source).split('\n').filter(runtime).sort();
 const current=git('ls-files').split('\n').filter(runtime).sort();assert.deepEqual(current,expected,'Application file set changed');
 const mismatches=[];for(const f of expected){if(!existsSync(join(temp,f))||sha(readFileSync(f))!==sha(readFileSync(join(temp,f))))mismatches.push(f);else proof.checkedFiles++;}
 assert.deepEqual(mismatches,[],'Application differs from already-tested source');
 mkdirSync('qa-freeze',{recursive:true});cpSync(evidence+'/qa-freeze/local','qa-freeze/local',{recursive:true});
 proof.reused=true;proof.reason='All application assets, entrypoints, caches, worker and acceptance scripts are byte-identical to prepared, passed run';
 writeFileSync('qa-freeze/local/reused-acceptance.json',JSON.stringify(proof,null,2));
}catch(e){proof.reason=e.message;console.log('ACCEPTANCE_NOT_REUSED: full candidate checks will run',e.message);}
mkdirSync('qa-ci',{recursive:true});writeFileSync('qa-ci/acceptance-reuse.json',JSON.stringify(proof,null,2));
appendFileSync(process.env.GITHUB_OUTPUT,`reused=${proof.reused}\n`);console.log('OWNER19_ACCEPTANCE_REUSE',JSON.stringify(proof));
