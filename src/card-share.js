// Object-specific public links. Copy only: no native/social sharing or tracking.
export const CARD_SHARE_VERSION='20261111-copy-v2';
export const SHARE_ICON='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 4H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-3"/><path d="M16 1v4C7 5 5.5 11 6.5 16c1.5-4.5 4.5-6 9.5-6v4l7-6.5L16 1Z"/></svg>';
const KINDS=new Set(['site','rocket','model','story','history','event','research','view','article']);
const ID=/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,99}$/u;
export const SHARE_EVENTS=Object.freeze({
 'soyuz-launch-1':{site:'pad-1',title:'Запуск «Союза» · Гагаринский старт',button:'soyuzLaunchStart'},
 'soyuz-launch-31':{site:'pad-31',title:'Запуск «Союза» · площадка №31',button:'soyuzLaunchStart'},
 'energia-launch':{site:'pad-250',title:'Запуск «Энергии — Полюса»',button:'energiaLaunchStart'},
 'buran-launch':{site:'pad-110',title:'Старт «Энергии — Бурана»',button:'buranLaunchStart'},
 'buran-loss':{site:'pad-112',title:'Гибель Бурана',button:'buranLossStart'},
 'buran-landing':{site:'pad-251',title:'Посадка «Бурана»',button:'buranLandingStart'},
 'pua-loading':{site:'pad-251',title:'Погрузка «Бурана» · ПУА-100',button:'puaLoadingStart'},
 'flight-cycle':{site:'airfield',title:'Рейс Москва — Крайний — Москва'},
 'next-launch':{site:'pad-31',title:'Следующий запуск'}
});
export function validShareTarget(value){return !!value&&KINDS.has(value.kind)&&typeof value.id==='string'&&ID.test(value.id);}
export function parseShareTarget(search){
 const values=new URLSearchParams(search).getAll('share');if(values.length!==1)return null;
 const raw=values[0];if(!raw||raw.length>120)return null;
 const i=raw.indexOf(':'),value={kind:raw.slice(0,i),id:raw.slice(i+1)};
 return validShareTarget(value)?value:null;
}
export function makeShareURL(target,base=new URL('../museum.html',import.meta.url)){
 if(!validShareTarget(target))throw new TypeError('Неизвестный объект для ссылки');
 const url=new URL(base);url.search='';url.hash='';url.username='';url.password='';
 if(!['http:','https:'].includes(url.protocol))throw new TypeError('Откройте музей по HTTP или HTTPS');
 // Resolve from this module, not the editor/model iframe: same deployed origin,
 // public entry only, and never a draft, old event or diagnostic query.
 if(target.kind==='article'){url.pathname=url.pathname.replace(/[^/]*$/,'encyclopedia.html');url.hash=target.id;}
 else{url.pathname=url.pathname.replace(/[^/]*$/,'museum.html');url.searchParams.set('share',target.kind+':'+target.id);url.searchParams.set('tour','0');}
 return url.href;
}
let toast=null,toastTimer=null,manual=null;
function announce(text){
 if(!toast){toast=document.createElement('div');toast.className='museum-share-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.setAttribute('aria-atomic','true');document.body.append(toast);}
 clearTimeout(toastTimer);toast.hidden=false;toast.textContent=text;
 toastTimer=setTimeout(()=>{toast.hidden=true;},3500);
}
export function legacyCopy(text,doc=globalThis.document){
 if(!doc?.body||typeof doc.execCommand!=='function')return false;
 const active=doc.activeElement,selection=doc.getSelection?.(),ranges=[];
 if(selection)for(let i=0;i<selection.rangeCount;i++)ranges.push(selection.getRangeAt(i).cloneRange());
 const input=doc.createElement('textarea');input.value=text;input.readOnly=true;input.setAttribute('aria-label','Ссылка для копирования');
 input.style.cssText='position:fixed;top:0;left:-9999px;width:1px;height:1px;font-size:16px';doc.body.append(input);
 try{input.focus({preventScroll:true});input.select();input.setSelectionRange(0,text.length);return doc.execCommand('copy')===true;}
 catch{return false;}
 finally{input.remove();try{active?.focus?.({preventScroll:true});if(selection){selection.removeAllRanges();for(const range of ranges)selection.addRange(range);}}catch{}}
}
function manualCopy(url,opener){
 manual?.close();manual?.remove();manual=document.createElement('dialog');manual.className='museum-share-dialog';manual.setAttribute('aria-label','Ссылка на объект');
 const title=document.createElement('h2');title.textContent='Ссылка на объект';
 const note=document.createElement('p');note.textContent='Браузер запретил автоматическое копирование. Выделите и скопируйте ссылку вручную.';
 const input=document.createElement('input');input.type='url';input.readOnly=true;input.value=url;input.setAttribute('aria-label','Ссылка для копирования');
 const close=document.createElement('button');close.type='button';close.textContent='Закрыть';close.onclick=()=>manual.close();
 manual.append(title,note,input,close);document.body.append(manual);
 manual.addEventListener('close',()=>opener?.focus?.({preventScroll:true}),{once:true});
 manual.addEventListener('keydown',event=>event.stopPropagation());manual.showModal();input.focus();input.select();
}
export async function shareTarget(target,{navigator:navigation=globalThis.navigator,base,onStatus=announce,onManual=manualCopy,copyFallback=legacyCopy,opener,timeoutMs=3000}={}){
 const url=makeShareURL(target,base);let copied=false,timer;
 try{
  if(typeof navigation?.clipboard?.writeText==='function'){
   // Invoke during the actual user gesture, before any timer or other await.
   const writing=navigation.clipboard.writeText(url);
   await Promise.race([writing,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('clipboard timeout')),timeoutMs);})]);copied=true;
  }
 }catch{/* Older/denied browsers get a real copy fallback, never a false success. */}
 finally{clearTimeout(timer);}
 if(!copied){try{copied=copyFallback(url)===true;}catch{}}
 if(copied){onStatus('Ссылка скопирована в буфер обмена');return {status:'copied',url};}
 onStatus('Не удалось скопировать автоматически');onManual(url,opener);return {status:'manual',url};
}
export function createShareButton(getTarget,{compact=false,base}={}){
 const button=document.createElement('button');button.type='button';button.className='museum-share-button'+(compact?' is-compact':'');
 button.title='Поделиться — скопировать ссылку';button.setAttribute('aria-label','Поделиться — скопировать ссылку');button.innerHTML=SHARE_ICON+'<span>Поделиться</span>';
 let pending=false;
 for(const type of ['pointerdown','pointerup','dblclick'])button.addEventListener(type,event=>event.stopPropagation());
 button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation();});
 button.addEventListener('click',async event=>{
  event.preventDefault();event.stopPropagation();if(pending)return;
  const target=typeof getTarget==='function'?getTarget():getTarget;if(!validShareTarget(target)){announce('Не удалось определить объект для ссылки');return;}
  pending=true;button.setAttribute('aria-busy','true');
  try{const result=await shareTarget(target,{base,opener:button});button.dataset.shareStatus=result.status;button.dispatchEvent(new CustomEvent('museum-shared',{bubbles:true,detail:result}));}
  catch{announce('Не удалось подготовить ссылку');}finally{pending=false;button.removeAttribute('aria-busy');}
 });return button;
}
const EVENT_PANELS={energiaLaunchPanel:'energia-launch',buranLaunchPanel:'buran-launch',buranLossPanel:'buran-loss',buranLandingPanel:'buran-landing',puaLoadingPanel:'pua-loading',arrivalPanel:'flight-cycle',nextLaunchPanel:'next-launch'};
export function installMuseumSharing({cardTarget,infoTarget,historyTarget,soyuzSite,openTarget}={}){
 for(const element of document.querySelectorAll('.site-label,.detail-card'))element.append(createShareButton(()=>cardTarget(Number(element.dataset.siteIndex)),{compact:true}));
 const info=document.getElementById('info'),share=createShareButton(infoTarget);share.id='infoShare';info.insertBefore(share,document.getElementById('detailMore'));
 function attachPanel(element){
  if(!(element instanceof Element)||element.querySelector(':scope > .museum-share-button'))return;
  let target;
  if(element.id==='soyuzLaunchPanel')target=()=>{const id=soyuzSite()==='pad-31'?'soyuz-launch-31':'soyuz-launch-1';return {kind:'event',id,title:SHARE_EVENTS[id].title};};
  else if(element.id==='complexHistoryPanel')target=historyTarget;
  else if(EVENT_PANELS[element.id]){const id=EVENT_PANELS[element.id];target=()=>({kind:'event',id,title:SHARE_EVENTS[id].title});}
  if(target)element.append(createShareButton(target));
 }
 const observer=new MutationObserver(records=>{for(const record of records){if(record.target.id==='nextLaunchPanel')attachPanel(record.target);for(const node of record.addedNodes)attachPanel(node);}});
 observer.observe(document.body,{childList:true});for(const child of document.body.children)attachPanel(child);
 for(const id of Object.keys(EVENT_PANELS))attachPanel(document.getElementById(id));
 const next=document.getElementById('nextLaunchPanel');if(next)observer.observe(next,{childList:true});
 const target=parseShareTarget(location.search),hasShare=new URLSearchParams(location.search).has('share');
 const ready=target?Promise.resolve().then(()=>openTarget(target)).then(ok=>{if(ok===false)announce('Объект по ссылке не найден');return ok!==false;}).catch(()=>{announce('Не удалось открыть объект по ссылке');return false;}):Promise.resolve(!hasShare);
 if(hasShare&&!target)announce('Некорректная ссылка на объект');
 window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
 return {ready,version:CARD_SHARE_VERSION,current:infoTarget,url:target=>makeShareURL(target),buttons:()=>document.querySelectorAll('.museum-share-button').length};
}
