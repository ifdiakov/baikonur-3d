import {MUSEUM_KNOWLEDGE_INDEX as index} from './museum-knowledge-index.js?v=20261102-progressive-v1';

const TASK_KEY='museum-knowledge';
const METHODS={site:'renderSite',rocket:'renderRocket',story:'renderStory'};
const GROUPS={site:'sites',rocket:'rockets',story:'stories'};

/** Keep catalogue descriptions available immediately, while full articles
 * join the bounded background queue. A selected article can promote that job.
 * Pending DOM belongs to its exact placeholder, never to a recycled card. */
export function createDeferredKnowledge({startup,onNavigate}={}){
 if(typeof startup?.defer!=='function'||typeof startup?.fetchJSON!=='function')
  throw new Error('Deferred knowledge requires the museum startup queue');
 let content=null,pending=null,state='queued',lastError=null;
 const asset=new URL('../data/buran-knowledge.json',import.meta.url);
 asset.searchParams.set('v',index.sourceRevision);

 function schedule(priority=30){
  if(content)return Promise.resolve(content);
  if(pending&&state!=='error'){
   startup.promote?.(TASK_KEY,priority);
   return pending;
  }
  state='queued';lastError=null;
  pending=startup.defer(async()=>{
   state='loading';
   const [data,module]=await Promise.all([
    startup.fetchJSON(asset.href),
    import('./museum-knowledge.js?v=20261102-progressive-v1')
   ]);
   if(!data||data.edition!==index.edition||!data.sites||!data.rockets||!data.stories)
    throw new Error('Не удалось прочитать материалы музея.');
   content=module.createMuseumKnowledge(data,{onNavigate});state='ready';
   return content;
  },{key:TASK_KEY,priority}).catch(error=>{
   // Article failure is local to its card; the map and camera remain usable.
   state='error';lastError=String(error?.message||error);return null;
  });
  return pending;
 }

 function render(kind,id,container,options){
  const method=METHODS[kind];
  if(content)return content[method](id,container,options);
  const record=index[GROUPS[kind]][id];
  if(!record||!container?.append)return null;
  const doc=container.ownerDocument||globalThis.document;
  if(!doc)return null;
  const placeholder=doc.createElement('section');
  placeholder.className='museum-knowledge museum-knowledge-pending';
  placeholder.dataset.knowledgeKind=kind;placeholder.dataset.knowledgeId=id;
  placeholder.setAttribute('aria-label',record.title);
  placeholder.style.cssText='margin:16px 0 6px;padding-top:15px;font-size:13px;line-height:1.6';
  const message=doc.createElement('p');message.setAttribute('role','status');
  placeholder.append(message);container.append(placeholder);
  function load(){
   message.textContent='Загружаем материал…';placeholder.setAttribute('aria-busy','true');
   schedule(100).then(api=>{
    if(placeholder.parentNode!==container)return;
    if(api){
     const target=doc.createElement('div'),section=api[method](id,target,options);
     if(section)placeholder.replaceWith(section);else placeholder.remove();
     return;
    }
    placeholder.removeAttribute('aria-busy');message.textContent='Материал не загрузился.';
    const retry=doc.createElement('button');retry.type='button';retry.textContent='Повторить';
    retry.addEventListener('click',()=>{retry.remove();load();});placeholder.append(retry);
   });
  }
  load();return placeholder;
 }

 schedule();
 return Object.freeze({
  renderSite:(id,container,options)=>render('site',id,container,options),
  renderRocket:(id,container,options)=>render('rocket',id,container,options),
  renderStory:(id,container,options)=>render('story',id,container,options),
  getSite:id=>content?content.getSite(id):index.sites[id]||null,
  getRocket:id=>content?content.getRocket(id):index.rockets[id]||null,
  getStory:id=>content?content.getStory(id):index.stories[id]||null,
  siteSummary:id=>content?content.siteSummary(id):index.sites[id]?.summary||'',
  rocketSummary:id=>content?content.rocketSummary(id):index.rockets[id]?.summary||'',
  storiesMenu:()=>content?content.storiesMenu():Object.values(index.stories).map(story=>({
   action:'story:'+story.id,title:story.title,
   description:(index.evidenceTypes[story.evidenceType]?.label||'История')+' · '+story.subtitle
  })),
  stats:()=>({...content?content.stats():{version:index.version,edition:index.edition,
   sites:Object.keys(index.sites).length,rockets:Object.keys(index.rockets).length,
   stories:Object.keys(index.stories).length,sources:index.sourceCount,sourceConflicts:index.sourceConflictCount},
   contentLoaded:Boolean(content),loadingState:state,error:lastError}),
  get ready(){return pending;},prioritize:(priority=100)=>schedule(priority)
 });
}
