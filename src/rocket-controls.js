import {ROCKET_MODELS,TUA_ROCKET_CHOICES} from './rocket-exhibits.js?v=20261031-rocket-exhibits-v1';

export function createTuaRocketControls({container,exhibits,keys,onSelect}){
  const panel=document.createElement('section');panel.id='tuaRocketControls';panel.className='tua-rocket-controls';panel.hidden=true;
  const title=document.createElement('h3');title.textContent='Кузнечики · ракета-экспонат';
  const note=document.createElement('p');note.textContent='Выберите компоновку для двух транспортно-установочных агрегатов.';
  const label=document.createElement('label');label.textContent='Ракета на транспортёрах';label.htmlFor='tuaRocketChoice';
  const select=document.createElement('select');select.id='tuaRocketChoice';
  for(const id of TUA_ROCKET_CHOICES){const option=document.createElement('option');option.value=id;option.textContent=ROCKET_MODELS[id].title;select.append(option);}
  select.value='energia-buran';
  const place=document.createElement('button');place.type='button';place.id='tuaPlaceRocket';place.textContent='ПОМЕСТИТЬ РАКЕТУ-ЭКСПОНАТ';
  const toggle=document.createElement('button');toggle.type='button';toggle.id='tuaHideRocket';toggle.className='tua-rocket-secondary';
  const status=document.createElement('p');status.id='tuaRocketStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  panel.append(title,note,label,select,place,toggle,status);container.append(panel);
  const style=document.createElement('style');style.textContent=`
    .tua-rocket-controls{margin:12px 0;padding:13px;border:1px solid #799a9b55;border-radius:7px;background:#28454a38}
    .tua-rocket-controls[hidden]{display:none!important}.tua-rocket-controls h3{font-size:13px;margin:0 0 6px;color:#e8e6da}
    .tua-rocket-controls p{font-size:11px;line-height:1.5;color:#b7c9c9;margin:7px 0}
    .tua-rocket-controls label{display:block;font-size:10px;margin:10px 0 5px;color:#b7c9c9}
    .tua-rocket-controls select{display:block;width:100%;box-sizing:border-box;padding:9px;color:#f2f1e8;background:#19323b;border:1px solid #638184;border-radius:4px;font:inherit;font-size:12px}
    .tua-rocket-controls button{display:block;width:100%;margin-top:8px;padding:9px;border:1px solid #9fb5a98a;border-radius:4px;background:#365b51;color:#f2f1e8;font-size:10px;line-height:1.5;cursor:pointer}
    .tua-rocket-controls button:disabled{opacity:.6;cursor:wait}.tua-rocket-controls .tua-rocket-secondary{background:transparent;border-color:#6c85834d}
    .tua-rocket-controls :focus-visible{outline:2px solid #e7b78c;outline-offset:2px}
  `;document.head.append(style);
  function sync(){
    const states=keys.map(key=>exhibits.get(key)).filter(Boolean),loading=states.some(e=>e.status==='loading'),failed=states.find(e=>e.status==='error');
    place.disabled=loading;place.textContent=loading?'ЗАГРУЖАЕМ ЭКСПОНАТ…':failed?'ПОВТОРИТЬ ЗАГРУЗКУ':'ПОМЕСТИТЬ РАКЕТУ-ЭКСПОНАТ';
    const visible=states.some(e=>e.holder.visible);toggle.textContent=visible?'УБРАТЬ ЭКСПОНАТ С ТРАНСПОРТЁРОВ':'ПОКАЗАТЬ ЭКСПОНАТ НА ТРАНСПОРТЁРАХ';
    toggle.disabled=!states.length;toggle.setAttribute('aria-pressed',String(visible));
    status.textContent=failed?'Не удалось загрузить модель. '+failed.error:loading?'Загружаем выбранный экспонат…':states.length&&visible?'На транспортёрах: '+ROCKET_MODELS[states[0].modelId].title+'.':'Транспортёры без ракеты-экспоната.';
  }
  async function choose(id){
    if(!TUA_ROCKET_CHOICES.includes(id))return false;select.value=id;
    for(const key of keys)exhibits.setVisible(key,true);
    const result=await Promise.all(keys.map(key=>exhibits.setModel(key,id)));sync();onSelect?.(id);return result.every(Boolean);
  }
  place.onclick=()=>choose(select.value);
  toggle.onclick=()=>{const next=!keys.some(key=>exhibits.get(key)?.holder.visible);keys.forEach(key=>exhibits.setVisible(key,next));sync();};
  return {panel,sync,choose,setActive(value){panel.hidden=!value;if(value)sync();}};
}
