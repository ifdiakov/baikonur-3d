const INDEX_URL=new URL('../data/knowledge-index.json?v=public-20261117',import.meta.url);
let indexPromise;
const loadIndex=()=>indexPromise||(indexPromise=fetch(INDEX_URL).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).catch(e=>{indexPromise=null;throw e;}));
const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
function targetValue(getTarget){try{return typeof getTarget==='function'?getTarget():getTarget;}catch{return null;}}
export function knowledgeURL(target){
 const url=new URL('../encyclopedia.html',import.meta.url);
 if(target?.kind==='site')url.searchParams.set('site',target.id);
 else if(['event','story','history'].includes(target?.kind))url.searchParams.set('scenario',target.kind+':'+target.id);
 else if(['article','rocket','model'].includes(target?.kind))url.hash=target.id;
 return url.href;
}
function style(){if(document.getElementById('museum-reading-style'))return;const s=el('style');s.id='museum-reading-style';s.textContent='.museum-reading-links{clear:both;margin:14px 0;padding:12px 0;border-top:1px solid #58707a;color:inherit;font:inherit}.museum-reading-links>summary{cursor:pointer;padding:10px 0;font-weight:650;list-style:revert}.museum-reading-links a{display:block!important;color:#e9c78d!important;padding:10px 6px;line-height:1.5;text-decoration:underline;overflow-wrap:anywhere}.museum-reading-links p{font-size:12px;line-height:1.5;color:inherit}.museum-reading-links button{font:inherit;color:inherit;background:transparent;border:1px solid #718991;padding:9px;border-radius:5px}';document.head.append(s);}
/** Only a compact index is fetched, and only when a visitor expands the reading list. */
export function createReadingLinks(getTarget){
 style();const box=el('details');box.className='museum-reading-links';const summary=el('summary','История, люди и связанные статьи');box.append(summary);
 const body=el('div');box.append(body);let token=0,selectionObserver=null;
 box.addEventListener('toggle',async()=>{
  selectionObserver?.disconnect();const request=++token;if(!box.open)return;
  const target=targetValue(getTarget);body.replaceChildren(el('p','Подбираем материалы…'));
  const key=target?.kind+':'+target?.id;
  selectionObserver=new MutationObserver(()=>{const next=targetValue(getTarget);if(next?.kind+':'+next?.id!==key){box.open=false;token++;selectionObserver.disconnect();body.replaceChildren();}});
  if(box.parentElement)selectionObserver.observe(box.parentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style']});
  try{const index=await loadIndex();if(request!==token||!box.open||!box.isConnected)return;
   let ids=[];
   if(target?.kind==='site')ids=index.sites[target.id]||[];
   else if(['event','story','history'].includes(target?.kind))ids=index.scenarios[target.kind+':'+target.id]||[];
   else if(index.items[target?.id])ids=[target.id];
   body.replaceChildren();
   if(!ids.length)body.append(el('p','Для этого объекта отдельная подборка ещё не составлена. Начните с тематических маршрутов музея.'));
   for(const id of ids.slice(0,6)){const item=index.items[id];if(!item)continue;const a=el('a',item.name);a.href=knowledgeURL({kind:'article',id});a.dataset.knowledgeArticle=id;body.append(a);}
   const all=el('a',ids.length?'Все материалы по теме →':'Открыть маршруты и энциклопедию →');all.href=ids.length?knowledgeURL(target):knowledgeURL(null);body.append(all);
  }catch{if(request!==token)return;body.replaceChildren(el('p','Подборка временно недоступна.'));const a=el('a','Открыть энциклопедию →');a.href=knowledgeURL(target);body.append(a);}
 });
 // The enclosing card is reused for different objects; close the previous selection.
 const refresh=()=>{selectionObserver?.disconnect();if(box.open){box.open=false;token++;}body.replaceChildren();};
 box.resetReading=refresh;
 window.addEventListener('pagehide',()=>selectionObserver?.disconnect(),{once:true});
 return box;
}
