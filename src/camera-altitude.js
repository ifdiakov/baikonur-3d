// H uses the same normalized scene units as the map hierarchy. The schematic
// geography and exhibit metres have different scales, so H is not in metres.
const LEVEL_NAMES={overview:'Обзор',flanks:'Фланги',sites:'Площадки'};
const decimal=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1});
const integer=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});

function rulerStep(height){
 const h=Math.abs(height);
 if(h<100)return 10;
 if(h<600)return 50;
 if(h<2000)return 200;
 if(h<8000)return 1000;
 const magnitude=10**Math.floor(Math.log10(h/4));
 return [1,2,5,10].find(n=>n*magnitude>=h/4)*magnitude;
}

export function createCameraAltitude({enabled=false}={}){
 const root=document.createElement('aside');
 root.id='cameraAltitude';root.className='camera-altitude';
 // Owner request 2026-11-09: keep technical telemetry, not a visible HUD.
 root.hidden=true;root.style.display='none';root.setAttribute('aria-hidden','true');
 root.setAttribute('aria-label','Техническая шкала высоты камеры');
 root.setAttribute('aria-describedby','cameraAltitudeUnits');
 root.setAttribute('aria-live','off');
 root.innerHTML=`<div class="camera-altitude__heading">Высота камеры</div>
  <div class="camera-altitude__reading"><span class="camera-altitude__symbol">H</span><span class="camera-altitude__value">—</span><span class="camera-altitude__units">усл. ед.</span></div>
  <div class="camera-altitude__ruler" aria-hidden="true"><span class="camera-altitude__needle"></span></div>
  <div class="camera-altitude__meta"><span>Уровень карты</span><strong class="camera-altitude__level">—</strong></div>
  <div class="camera-altitude__meta camera-altitude__world"><span>Y сцены</span><span class="camera-altitude__y">—</span></div>
  <span id="cameraAltitudeUnits" class="camera-altitude__description">H — высота камеры в условных единицах переключения уровней карты: Y сцены, делённая на масштаб сцены. Это не географические метры и не высота над местным рельефом.</span>`;
 const value=root.querySelector('.camera-altitude__value');
 const levelName=root.querySelector('.camera-altitude__level');
 const worldY=root.querySelector('.camera-altitude__y');
 const ruler=root.querySelector('.camera-altitude__ruler');
 const ticks=Array.from({length:7},()=>{
  const tick=document.createElement('span');tick.className='camera-altitude__tick';
  const label=document.createElement('span');tick.append(label);ruler.append(tick);
  return {tick,label};
 });
 document.body.append(root);
 let last='';
 function setEnabled(value){
  enabled=Boolean(value);root.hidden=!enabled;root.style.display=enabled?'':'none';
  root.setAttribute('aria-hidden',String(!enabled));last='';
 }
 setEnabled(enabled);
 return {setEnabled,isEnabled:()=>enabled,update(height,y,level){
  if(!Number.isFinite(height)||!Number.isFinite(y))return;
  const key=`${height.toFixed(1)}|${y.toFixed(1)}|${level}`;
  if(key===last)return;last=key;
  value.textContent=decimal.format(height);worldY.textContent=decimal.format(y);
  levelName.textContent=LEVEL_NAMES[level]||level;
  root.dataset.height=height.toFixed(1);root.dataset.worldY=y.toFixed(1);root.dataset.level=level;
  const step=rulerStep(height),base=Math.floor(height/step);
  for(let i=0;i<ticks.length;i++){
   const mark=(base+i-3)*step,position=.5+(mark-height)/(step*4.5);
   const {tick,label}=ticks[i];tick.hidden=position<0||position>1;
   tick.classList.toggle('camera-altitude__tick--major',(base+i-3)%2===0);
   tick.style.left=`${(position*100).toFixed(3)}%`;
   label.textContent=integer.format(mark);
  }
 }};
}
