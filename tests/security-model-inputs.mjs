import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {MODEL_CATALOG,modelsForKnowledge,modelsForObject,resolveModelId} from '../src/model-catalog.js';

const cases=[];
function check(name,fn){fn();cases.push({name,passed:true});}
check('Inherited property names never identify an exhibit',()=>{
 for(const id of ['constructor','toString','__proto__','hasOwnProperty','valueOf','prototype','../../data/catalog.json','<img src=x>','unknown-model']){
  assert.equal(MODEL_CATALOG[id],undefined,id);
  assert.equal(Object.hasOwn(MODEL_CATALOG,id),false,id);
  assert.deepEqual(modelsForKnowledge(id),[],id);
  assert.deepEqual(modelsForObject({id}),[],id);
 }
});
check('Every real exhibit retains its title and factual record',()=>{
 assert(Object.keys(MODEL_CATALOG).length>20);
 for(const [id,spec] of Object.entries(MODEL_CATALOG)){
  assert.equal(spec.id,id);assert(spec.title);assert(spec.facts.summary);
  assert(modelsForKnowledge(id).includes(id),id);
 }
});
check('Existing model aliases and multi-model links are preserved',()=>{
 assert.equal(resolveModelId('mig25ru'),'mig25');
 assert.deepEqual(modelsForKnowledge('mig25ru'),['mig25']);
 assert.deepEqual(modelsForKnowledge('zenit'),['zenit-land','zenit-sea']);
 assert.deepEqual(modelsForKnowledge('buran'),['buran','energia-buran','mriya']);
 assert.deepEqual(modelsForObject({id:'pad-45'}),['zenit-land','soyuz5','site45','zenit-sea']);
 assert.deepEqual(modelsForObject({id:'rail-station-test'}),['train','coach']);
 assert.deepEqual(modelsForObject(),[]);
});
check('Callers cannot mutate a site model list',()=>{
 const models=modelsForObject({id:'pad-45'});models.length=0;
 assert.equal(modelsForObject({id:'pad-45'}).length,4);
});
await mkdir('qa-delivery',{recursive:true});
await writeFile('qa-delivery/security-model-inputs.json',JSON.stringify({passed:true,cases},null,2));
console.log('SECURITY_MODEL_INPUTS_PASS',cases.length);
