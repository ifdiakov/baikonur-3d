import assert from 'node:assert/strict';
import * as THREE from 'three';
import {pruneTerminalBranches} from '../src/transport-pruning.js';

function fixture(definitions){
 const nodes=new Map(),edges=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,position:new THREE.Vector3(nodes.size,0,0)});return nodes.get(id);};
 for(const [id,a,b,length,wayId=id] of definitions)edges.push({id,a:node(a),b:node(b),length,wayId});
 return {nodes,edges};
}
const trunk=[['left','west','join',80],['right','join','east',80]];
const run=(definitions,options={})=>{
 const graph=fixture(definitions),before=graph.edges.slice();
 const result=pruneTerminalBranches(graph,{maxLength:40,protectedEdges:new Set(graph.edges.filter(e=>['left','right'].includes(e.id))),...options});
 assert.deepEqual(graph.edges,before,'Filtering must not mutate routing data');
 return new Set([...result.removed].map(e=>e.id));
};
// A branch can occupy just the tail of a way that also carries through traffic.
assert.deepEqual(run([...trunk,['a','join','bend',8,'shared-way'],['b','bend','tip',12,'shared-way']]),new Set(['a','b']));
// The limit is for the complete branch, regardless of source-way boundaries.
assert.equal(run([...trunk,['a','join','bend',25],['b','bend','tip',25]]).size,0);
assert.equal(run([...trunk,['a','join','bend',8],['b','bend','facility',12]],{protectedNode:n=>n.id==='facility'}).size,0);
assert.equal(run([...trunk,['a','join','station',15]],{eligible:e=>e.id!=='a'}).size,0);
// Loops and links between two junctions are never terminal branches.
assert.equal(run([...trunk,['a','join','x',5],['b','x','y',5],['c','y','join',5]]).size,0);
assert.equal(run([...trunk,['a','west','x',5],['b','x','east',5]]).size,0);
// Multiple twigs must not expose and consume a long approach in small pieces.
const tree=[...trunk,['stem','join','fork',35],['a','fork','tip1',8],['b','fork','tip2',8]];
assert.deepEqual(run(tree),new Set(['a','b']));
// A short isolated fragment and a short terminal tree can be removed completely.
assert.deepEqual(run([...trunk,['a','loose1','loose2',9]]),new Set(['a']));
assert.deepEqual(run([...trunk,['stem','join','fork',10],['a','fork','tip1',8],['b','fork','tip2',8]]),new Set(['a','b','stem']));
// Adjacent protected edges remain intact even at an otherwise degree-two node.
assert.deepEqual(run([['left','west','join',80],['a','join','tip',6]]),new Set(['a']));
const twigs=Array.from({length:7},(_,i)=>['twig'+i,'join','tip'+i,10]);
assert.deepEqual(run([...trunk,...twigs]),new Set(twigs.map(t=>t[0])),'Independent short spurs at the same junction should all disappear');
console.log('TRANSPORT_PRUNING_PASS');
