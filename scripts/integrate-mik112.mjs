// Idempotent integration of the new photo-based Site 112 module.
// Run on a fresh checkout; retain unrelated UI, Saturn, KAZ and lighting edits.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>readFileSync(p,'utf8');
let model=read('src/mik112.js');
model=model.replace('const mat=palette.materials;','const mat=palette;');
writeFileSync('src/mik112.js',model);
let h=read('index.html');
function replaceOnce(a,b){assert.ok(h.includes(a),'Missing integration anchor: '+a.slice(0,100));h=h.replace(a,b);}
if(!h.includes('MIK112_INTEGRATION_V1')){
 replaceOnce("try{\n// Common display scale", "import {MIK112,buildMik112,connectMik112Rails} from './src/mik112.js?v=112-photo-v1';\ntry{\n// Common display scale");
 replaceOnce('sites.forEach(makeSite);',`sites.forEach(makeSite);
// MIK112_INTEGRATION_V1: replace only Site 112; do not move adjacent 112A.
const mik112Index=objects.findIndex(o=>o.record.id==='pad-112');
let mik112Exhibit=null,mik112Rail=null;
if(mik112Index>=0){
 const entry=objects[mik112Index],group=entry.g;group.clear();
 for(let i=clickable.length-1;i>=0;i--)if(clickable[i].userData.idx===mik112Index)clickable.splice(i,1);
 group.scale.setScalar(MIK112.scale);group.rotation.y=MIK112.yaw;
 mik112Exhibit=buildMik112(group,{year:2026});entry.type='mik112-photo';
 group.traverse(o=>{if(o.isMesh){o.userData.idx=mik112Index;clickable.push(o);}});
 mik112Rail=connectMik112Rails(group,{data:transportData,point,parent:layers.rails});
}
function focusMik112(view='all'){
 if(!mik112Exhibit)return;
 const root=objects[mik112Index].g;root.updateWorldMatrix(true,true);
 const target=view==='tua'?new THREE.Vector3(-45,18,183):mik112Exhibit.focusTarget.clone();
 const offset=view==='tua'?new THREE.Vector3(108,76,133):view==='top'?new THREE.Vector3(0,510,.1):mik112Exhibit.focusOffset.clone();
 const damping=ctl.enableDamping;ctl.enableDamping=false;ctl.update();
 ctl.target.copy(root.localToWorld(target.clone()));
 camera.position.copy(root.localToWorld(target.add(offset)));ctl.update();camera.updateMatrixWorld(true);ctl.enableDamping=damping;
}
`);
 replaceOnce(' }else if(i===saturnIndex){'," }else if(i===mik112Index){\n  focusMik112(new URLSearchParams(location.search).get('view')==='tua'?'tua':'all');\n }else if(i===saturnIndex){");
 replaceOnce(" document.getElementById('yearVal').textContent=String(val);"," document.getElementById('yearVal').textContent=String(val);\n mik112Exhibit?.setYear(val);\n if(mik112Rail?.group)mik112Rail.group.visible=val>=1967;");
 replaceOnce('l.i===saturnIndex?72*SATURN_SCALE:', 'l.i===mik112Index?78*MIK112.scale:l.i===saturnIndex?72*SATURN_SCALE:');
 replaceOnce('d.i===saturnIndex?85*SATURN_SCALE:', 'd.i===mik112Index?84*MIK112.scale:d.i===saturnIndex?85*SATURN_SCALE:');
 replaceOnce('stats(){return{uiRevision:', "inspectMik112:focusMik112,stats(){return{mik112:mik112Exhibit?.stats(),mik112Index,mik112Placement:objects[mik112Index]?[objects[mik112Index].record.x,objects[mik112Index].record.y]:null,mik112Rail:mik112Rail?{connected:mik112Rail.connected,sourceRoute:mik112Rail.sourceRoute,tracks:mik112Rail.tracks}:null,uiRevision:");
 replaceOnce('<button class="info-more" id="detailMore">', '<div id="mik112Controls" class="buttons" hidden style="margin:10px 0"><button id="mik112All" type="button">МИК целиком</button><button id="mik112Tua" type="button">Кузнечики</button><button id="mik112Top" type="button">Сверху</button></div><button class="info-more" id="detailMore">');
 replaceOnce(' document.getElementById("title").textContent=displaySiteName(o);',' document.getElementById("mik112Controls").hidden=i!==mik112Index;\n document.getElementById("title").textContent=displaySiteName(o);');
 replaceOnce("document.getElementById('close').onclick=", "document.getElementById('mik112All').onclick=()=>focusMik112('all');\ndocument.getElementById('mik112Tua').onclick=()=>focusMik112('tua');\ndocument.getElementById('mik112Top').onclick=()=>focusMik112('top');\ndocument.getElementById('close').onclick=");
 writeFileSync('index.html',h);
}
const c=JSON.parse(read('data/catalog.json')),s=c.sites.find(s=>s.id==='pad-112');assert.ok(s);
s.name='Площадка № 112 — МИК и «Кузнечики»';s.titleShort='МИК и «Кузнечики»';
s.titleFull='пл. №112 · МИК и транспортно-установочные агрегаты';
s.model='mik112-photo-v1';s.firstYear=1967;
s.purposeShort='Монтажно-испытательный корпус и два ТУА «Энергии»';
s.purposeLong='МИК площадки №112 и два транспортно-установочных агрегата «Кузнечики». Модель по фотографиям RocketTrip: высокий корпус с тремя раскрытыми пролётами, сохранившийся низкий корпус, ворота, пристройки, подъездные рельсы и детализированные транспортёры. Состояние кровли меняется на временной шкале: до 2002 года — реконструкция целой кровли; с 2002 года — разрушенные пролёты.';
s.modelStatus='Фотографическая реконструкция видимой архитектуры и механизмов. Пропорции, расстановка и присоединение к схематической железнодорожной сети ориентировочные; не обмерная модель.';
s.photoFolder={id:'1XTQD9tVRTeWIUVF-uzdAMIXLXh5SuVTk',name:'пл. №112 МИК',url:'https://drive.google.com/drive/folders/1XTQD9tVRTeWIUVF-uzdAMIXLXh5SuVTk'};
s.photoArchive=[
 {fileName:'Снимок экрана 10.37.32.png',driveId:'1LlDda6xlcYGUjflfVtu7SBEe1RfRW-Ud',subject:'Схема кровли и взаимное положение корпусов'},
 {fileName:'6983077E.jpeg',driveId:'145QNZxiY6xccOT95iSq-HjA76Ntu6iX3',subject:'Фасад, остекление и лестничная башня'},
 {fileName:'IMG_2149.JPG',driveId:'14jTNN_uO4bq_AoN4mfRZri9smAORe-o2',subject:'ТУА сверху: ходовые тележки, фермы, поперечные балки'},
 {fileName:'IMG_2148.JPG',driveId:'1cr82R9HGJagOoiQlVf3VrP5q5YkV4Q67',subject:'Боковой силуэт четырёх пар подъёмных механизмов'},
 {fileName:'0708.jpg',driveId:'1QzsORM0GgE25wYL56-7SFg7XLOy4nz3a',subject:'Два агрегата перед МИК'},
 {fileName:'0718.jpg',driveId:'1dS5JTB2Ot5xs3q-FOO-6qFaCL6J3Z_6G',subject:'Перфорированные стойки, площадки и ограждения'}
];
s.modelSourceFolders=[s.photoFolder.url,'https://drive.google.com/drive/folders/1y-yzVIkCtzPMEaksDM70qWyD8K8PZnE3'];
s.publicReferences=[...new Set([...(s.publicReferences||[]),'https://www.buran.ru/htm/transp.htm','https://www.buran.ru/htm/sk.htm'])];
writeFileSync('data/catalog.json',JSON.stringify(c,null,2)+'\n');
mkdirSync('/tmp/mik112-check',{recursive:true});
const source=h.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];assert.ok(source);
writeFileSync('/tmp/mik112-check/main.mjs',source);
console.log('MIK112 integration: existing placement retained at',s.x,s.y,'; north-east 112A unchanged.');
