import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
execFileSync(process.execPath,['scripts/prepare-pantsirs.mjs'],{stdio:'inherit'});
execFileSync('node_modules/.bin/esbuild',['src/transport-detail-worker-entry.js','--bundle','--platform=browser','--format=esm','--minify','--outfile=src/transport-detail-worker.bundle.js'],{stdio:'inherit',timeout:60000});
if(!readFileSync('src/transport-detail-worker.bundle.js','utf8').includes('rail-building-footprints-site92-v2'))throw Error('Missing Site92 clearance in generated worker');
execFileSync(process.execPath,['scripts/build-owner19-caches.mjs'],{stdio:'inherit',timeout:240000});
console.log('PANTSIR_CANDIDATE_INPUTS_BUILT');
