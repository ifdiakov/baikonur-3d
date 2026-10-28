import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
let h=readFileSync('index.html','utf8');
if(!h.includes('SCENE_SELECTION_NO_TERRAIN_JUMP_V1')){
 const entry='try{\n// Common display scale';assert.ok(h.includes(entry));
 h=h.replace(entry,"import {installSceneSelection} from './src/scene-selection.js?v=no-terrain-jump-v1';\n"+entry);
 const start=h.indexOf('const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();renderer.domElement.addEventListener(\'click\'');
 const end=h.indexOf('window.__BAIKONUR_QA=',start);
 assert.ok(start>=0&&end>start&&end-start<1200,'Expected one legacy canvas selector');
 h=h.slice(0,start)+`// SCENE_SELECTION_NO_TERRAIN_JUMP_V1: do not interpret navigation as a click.
const sceneSelection=installSceneSelection({element:renderer.domElement,camera,controls:ctl,
 getObjects:()=>clickable,onSelect:focus,blocked:()=>Boolean(lightingEditor?.active),
 onNavigate:()=>{if(fly){fly=false;document.getElementById('fly').textContent='Облёт';}}
});
`+h.slice(end);
 h=h.replace('window.__BAIKONUR_QA={setAltitude','window.__BAIKONUR_QA={selection:sceneSelection,selectionState(){return {...sceneSelection.snapshot(),currentObject,title:document.getElementById("title").textContent}},setAltitude');
 const site=' if(o.isMesh){o.userData.idx=saturnIndex;clickable.push(o)}';
 assert.ok(h.includes(site));h=h.replace(site,' if(o.isMesh){o.userData.idx=saturnIndex;if(o.userData.museumComponent===\'murguduk-hill\')o.userData.pickable=false;clickable.push(o)}');
 writeFileSync('index.html',h);
}
mkdirSync('/tmp/museum-selection',{recursive:true});
writeFileSync('/tmp/museum-selection/main.mjs',h.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
console.log('SCENE_SELECTION_NO_TERRAIN_JUMP_V1 integrated; lighting and explicit site links retained.');
