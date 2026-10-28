import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>readFileSync(p,'utf8'),write=(p,v)=>writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');
// Screenshot review: the old sector marker was on the river and railway.
// Keep the traced city grid, but register the first pass on the northern bank.
// This is a museum-map fit, not a surveyed georeference.
const cat=JSON.parse(read('data/catalog.json')),city=cat.sites.find(s=>s.id==='city');assert.ok(city);
city.x=710;city.y=924;city.positionVerified=false;
city.positionBasis='provisional-northern-bank-fit-after-browser-review';
city.note='Первый проход по спутниковому снимку город.jpg: основные жилые группы, улицы и стадион. Размещён севернее схематического русла и восточнее железнодорожного коридора. Глобальная геопривязка и высоты предварительные; не все здания отрисованы.';
city.purposeLong=city.note;
for(const id of['pad-1','pad-112a','pad-42','pad-45']){const p=cat.sites.find(s=>s.id===id);p.organisation.role='';if(id==='pad-42'||id==='pad-45')p.organisation.org='АО СП «Байтерек»';}
write('data/catalog.json',cat);
const network=JSON.parse(read('data/transport-network.json'));
network.routes.road=network.routes.road.filter(r=>r.id!=='r-city-photo-access');
network.routes.road.push({id:'r-city-photo-access',class:'service',points:[[668,911],[675,911],[683,911],[686.35,911]],confidence:'schematic connection to photo-grid western street; northern-bank placement provisional'});
write('data/transport-network.json',network);
const register=JSON.parse(read('data/portal-source-register.json'));
register.map.find(m=>m.id==='city').mapPosition=[city.x,city.y];register.map.find(m=>m.id==='city').positionVerified=false;
write('data/portal-source-register.json',register);
write('src/organisation-logos.js',read('src/organisation-logos.js').replaceAll('АО «СП «Байтерек»','АО СП «Байтерек»'));
let h=read('index.html');
if(!h.includes('inspectGagarinExcavation(){')){
 const a='inspectMik112:focusMik112,stats(){return{';assert.ok(h.includes(a));
 h=h.replace(a,`inspectGagarinExcavation(){
 const t=new THREE.Vector3(0,10,-135),p=t.clone().add(new THREE.Vector3(260,170,-180));
 padGroup.updateWorldMatrix(true,false);ctl.target.copy(padGroup.localToWorld(t));camera.position.copy(padGroup.localToWorld(p));ctl.update();camera.updateMatrixWorld(true);updateLabels();
},`+a);
}
write('index.html',h);
console.log('Visual review corrections: city off river/rail; clean partner labels; excavation inspection view.');
