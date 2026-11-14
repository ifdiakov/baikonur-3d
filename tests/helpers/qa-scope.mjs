import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';

// Explicit owner instruction on 2026-11-14: mobile layout is outside this acceptance.
// Keep the scenarios available for a separately requested mobile repair.
export const mobileEnabled=process.env.QA_SKIP_MOBILE!=='1';
export const mobileCoverage=mobileEnabled?'requested':'not_run: excluded by owner';
if(!mobileEnabled){
 mkdirSync('qa-ci',{recursive:true});
 const path='qa-ci/mobile-exclusions.json';let report={status:'not_run',reason:'Owner excluded mobile layout on 2026-11-14',scripts:[]};
 try{report=JSON.parse(readFileSync(path,'utf8'));}catch{}
 report.scripts=[...new Set([...report.scripts,process.argv[1]])];
 writeFileSync(path,JSON.stringify(report,null,2));
 console.log('QA_MOBILE_NOT_RUN',report.reason);
}
