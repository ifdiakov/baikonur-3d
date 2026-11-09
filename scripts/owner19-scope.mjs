import {readFileSync,appendFileSync} from 'node:fs';import {readChanges} from './ci/impact.mjs';
let owner19=process.env.GITHUB_REF_NAME==='fix/owner19-network-20261109';
try{const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));const changes=readChanges(event.before);owner19 ||= changes.some(c=>/^(src\/owner(?:-ad|-rail|19)|scripts\/(?:apply-owner19|prepare-owner19|build-owner19)|tests\/owner19|data\/road-edits-authoritative|data\/osm\/(?:transport-geometry-bake-v1|road-lod-authoritative-v1))/.test(c.path));}catch{}
appendFileSync(process.env.GITHUB_OUTPUT,`owner19=${owner19}\n`);console.log('OWNER19_ACCEPTANCE_SELECTED',owner19);
