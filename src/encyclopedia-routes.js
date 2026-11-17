const KEY='baikonur-reading-v1';
const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text)e.textContent=text;return e;};
export function createReadingRoutes(data,{open}){
 const routes=data.routes||[],map=new Map(data.items.map(a=>[a.id,a]));
 let read=new Set();try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(value))read=new Set(value.filter(id=>map.has(id)));}catch{}
 const current=routes.find(r=>r.id===new URLSearchParams(location.search).get('route'));
 const host=document.getElementById('reading-routes');
 host.append(node('h2','','Выберите маршрут по музею'),node('p','small','Читайте по порядку, открывайте площадки на макете и возвращайтесь к связанным историям.'));
 const grid=node('div','reading-route-grid');
 for(const route of routes){const card=node('a','reading-route-card');card.href='./encyclopedia.html?route='+encodeURIComponent(route.id)+'#'+route.articles[0];card.dataset.routeId=route.id;card.append(node('span','meta',route.minutes+' минут · '+route.articles.length+' остановок'),node('h3','',route.title),node('p','small',route.description));grid.append(card);}host.append(grid);
 const context=document.getElementById('reading-context');
 const query=new URLSearchParams(location.search);
 if(query.has('site')||query.has('scenario')){const all=node('a','reading-all','← Все статьи и маршруты');all.href='./encyclopedia.html';context.append(all);}
 if(query.has('route')&&!current)context.append(node('p','article-note','Такого маршрута нет. Выберите один из маршрутов выше.'));
 function persist(){try{localStorage.setItem(KEY,JSON.stringify([...read]));return true;}catch{return false;}}
 function progress(){if(!current)return;let section=context.querySelector('.reading-progress');if(!section){section=node('section','reading-progress');context.append(section);}section.replaceChildren();section.append(node('span','meta','МАРШРУТ'),node('h2','',current.title));
  const done=current.articles.filter(id=>read.has(id)).length;
  section.append(node('p','reading-progress-label','Прочитано '+done+' из '+current.articles.length));
  const meter=node('progress');meter.max=current.articles.length;meter.value=done;meter.setAttribute('aria-label','Прогресс маршрута');section.append(meter);
  const list=node('ol','reading-steps');for(const id of current.articles){const li=node('li'),button=node('button','', (read.has(id)?'✓ ':'')+map.get(id).name);button.type='button';button.dataset.routeArticle=id;button.onclick=()=>open(id);li.append(button);list.append(li);}section.append(list);
  const reset=node('button','back-to-list','Сбросить отметки маршрута');reset.type='button';reset.onclick=()=>{current.articles.forEach(id=>read.delete(id));persist();progress();document.querySelectorAll('[data-mark-read]').forEach(b=>{b.textContent='Отметить как прочитанное';b.setAttribute('aria-pressed','false');});};section.append(reset);
 }
 progress();
 function article(detail,a){
  detail.append(node('p','small','Чтение: около '+(a.readingMinutes||1)+' мин.'));
  const mark=node('button','back-to-list',read.has(a.id)?'✓ Прочитано':'Отметить как прочитанное');mark.type='button';mark.dataset.markRead=a.id;mark.setAttribute('aria-pressed',String(read.has(a.id)));
  const status=node('span','small');status.setAttribute('role','status');
  mark.onclick=()=>{if(read.has(a.id))read.delete(a.id);else read.add(a.id);const saved=persist();mark.textContent=read.has(a.id)?'✓ Прочитано':'Отметить как прочитанное';mark.setAttribute('aria-pressed',String(read.has(a.id)));status.textContent=saved?'Отметка сохранена в этом браузере':'Отметка действует до закрытия страницы';progress();};detail.append(mark,status);
  if(!current)return;
  const i=current.articles.indexOf(a.id);if(i<0){detail.append(node('p','small','Вы открыли связанную статью. Остановки маршрута доступны выше.'));return;}
  const nav=node('nav','reading-next');nav.setAttribute('aria-label','Переходы по маршруту');
  const step=node('p','small','Остановка '+(i+1)+' из '+current.articles.length);detail.append(step);
  for(const [n,label] of [[i-1,'← Предыдущая'],[i+1,'Следующая →']])if(current.articles[n]){const b=node('button','back-to-list',label);b.type='button';b.dataset.routeNext=current.articles[n];b.onclick=()=>open(current.articles[n]);nav.append(b);}
  detail.append(nav);
  if(i===current.articles.length-1)detail.append(node('p','article-note',current.question));
 }
 return {article,current,defaultId:current?.articles[0]||null};
}
