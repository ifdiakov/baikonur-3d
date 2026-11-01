import {MODEL_CATALOG,MODEL_VIEWER_VERSION,resolveModelId} from './model-catalog.js?v=20261101-tu204-cpk-v1';
export function installModelInspector({onOpen=()=>{},onClose=()=>{}}={}){
 const dialog=document.createElement('dialog');dialog.id='modelInspector';dialog.className='model-inspector';dialog.setAttribute('aria-label','Просмотр техники в 3D');
 const close=document.createElement('button');close.type='button';close.className='model-inspector-close';close.setAttribute('aria-label','Закрыть просмотр и вернуться к объекту');close.textContent='×';
 const content=document.createElement('div');content.className='model-inspector-content';dialog.append(close,content);document.body.append(dialog);
 let frame=null,opener=null,active=null,ready=false,closed=true;
 function cleanup(){if(closed)return;closed=true;frame?.remove();frame=null;content.replaceChildren();active=null;ready=false;onClose();opener?.focus({preventScroll:true});}
 function hide(){if(dialog.open)dialog.close();cleanup();}
 close.addEventListener('click',hide);dialog.addEventListener('cancel',e=>{e.preventDefault();hide();});dialog.addEventListener('close',cleanup);
 dialog.addEventListener('click',e=>{if(e.target===dialog)hide();});
 // Keyboard input in the dialog must never feed the museum's flight controls.
 document.addEventListener('keydown',e=>{if(!dialog.open)return;if(e.key==='Escape'){e.preventDefault();hide();}e.stopImmediatePropagation();},true);
 document.addEventListener('keyup',e=>{if(dialog.open)e.stopImmediatePropagation();},true);
 window.addEventListener('message',event=>{
  if(!dialog.open||event.origin!==location.origin||event.source!==frame?.contentWindow)return;
  if(event.data?.type==='museum-model-close')hide();
  if(event.data?.type==='museum-model-ready'){ready=true;active=event.data.model;}
 });
 function open(ids,selected=ids?.[0]){
  const allowed=[...new Set((ids||[]).map(resolveModelId))].filter(id=>MODEL_CATALOG[id]);if(!allowed.length)return false;
  selected=resolveModelId(selected);if(!allowed.includes(selected))selected=allowed[0];
  if(!dialog.open){opener=document.activeElement;closed=false;onOpen();dialog.showModal();}
  frame?.remove();frame=document.createElement('iframe');frame.title='3D-модель · '+MODEL_CATALOG[selected].title;frame.setAttribute('allow','fullscreen');frame.className='model-inspector-frame';
  const url=new URL('./workshop/model.html',location.href);url.searchParams.set('v',MODEL_VIEWER_VERSION);url.searchParams.set('embed','1');url.searchParams.set('model',selected);url.searchParams.set('models',allowed.join(','));
  frame.src=url.href;content.replaceChildren(frame);active=selected;ready=false;close.focus();return true;
 }
 return {open,close:hide,isOpen:()=>dialog.open,stats:()=>({open:dialog.open,modelId:active,ready,frames:content.querySelectorAll('iframe').length})};
}
