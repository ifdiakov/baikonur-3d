export const LAUNCH_COUNTDOWN_VERSION='next-launch-dock-v2';

// A date without an explicit zone is not an instant. In particular, do not
// turn a published launch day into a fictitious midnight launch countdown.
function instantMilliseconds(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value))return null;
 const time=Date.parse(value);return Number.isFinite(time)?time:null;
}

/** Return null for an unknown instant; otherwise all parts are nonnegative.
 * A fractional second still remaining is displayed as one second, so zero
 * is reached at the deadline rather than up to a second before it.
 */
export function countdownParts(launchAt,nowMs){
 const deadline=instantMilliseconds(launchAt);
 if(deadline===null||!Number.isFinite(nowMs))return null;
 const remainingMs=Math.max(0,deadline-nowMs),totalSeconds=Math.ceil(remainingMs/1000);
 return {days:Math.floor(totalSeconds/86400),hours:Math.floor(totalSeconds/3600)%24,
  minutes:Math.floor(totalSeconds/60)%60,seconds:totalSeconds%60,
  totalSeconds,remainingMs,expired:deadline<=nowMs};
}

const instances=new WeakMap();
const units=[['days','ДНЕЙ'],['hours','Ч'],['minutes','МИН'],['seconds','СЕК']];
const plurals={days:['день','дня','дней'],hours:['час','часа','часов'],minutes:['минута','минуты','минут'],seconds:['секунда','секунды','секунд']};
const pluralRule=new Intl.PluralRules('ru-RU');
let nextId=0;
function spokenUnit(value,key){
 const form=pluralRule.select(value),words=plurals[key];
 return value+' '+words[form==='one'?0:form==='few'?1:2];
}
function sourceUrl(source){
 try{const url=new URL(source?.url);return /^https?:$/.test(url.protocol)?url.href:null;}catch{return null;}
}
function formattedInstant(value){
 const time=instantMilliseconds(value);
 return time===null?'':new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(time)+' МСК';
}

/** Mount in the supplied host. Startup visibility and layout belong to the
 * museum shell, so the host's hidden/inert/ARIA state is never changed here.
 * `launch` is data supplied by the caller; this module makes no requests.
 */
export function createLaunchCountdown({element,launch,onOpenSite,now=Date.now}){
 if(!element?.ownerDocument||typeof element.replaceChildren!=='function')throw new Error('A next-launch panel host is required');
 if(!launch||typeof launch!=='object')throw new Error('Next-launch data is required');
 if(typeof now!=='function')throw new Error('The launch clock must be a function');
 instances.get(element)?.dispose();
 const doc=element.ownerDocument,clock=doc.defaultView||globalThis;
 const make=(tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;};
 const section=make('section','next-launch'),headingId='nextLaunchHeading'+(++nextId);
 section.setAttribute('aria-labelledby',headingId);
 const head=make('div','next-launch__head');
 const eyebrow=make('p','next-launch__eyebrow','СЛЕДУЮЩИЙ ЗАПУСК');
 const mission=make('h2','next-launch__name',launch.name||'ПРОГРЕСС МС-36');mission.id=headingId;
 head.append(eyebrow,mission);
 const countdownClock=make('div','next-launch__clock');
 const countdownLabel=make('p','next-launch__countdown-label','ДО СТАРТА');
 const counter=make('div','next-launch__countdown');counter.setAttribute('role','timer');counter.setAttribute('aria-live','off');
 const values={};
 for(const [key,label]of units){
  const cell=make('div','next-launch__unit'),value=make('strong','next-launch__value','—');
  value.dataset.countdownUnit=key;values[key]=value;
  const caption=make('span','next-launch__unit-label',label);
  cell.append(value,caption);counter.append(cell);
 }
 const meta=make('div','next-launch__meta'),time=make('time','next-launch__time');
 const status=make('p','next-launch__status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
 meta.append(time,status);
 const footer=make('div','next-launch__footer');
 const site=make('button','next-launch__site');site.type='button';
 const siteLabel=make('span','next-launch__site-label',launch.siteLabel||'ПЛ 31');
 const arrow=make('span','next-launch__site-arrow','↗');arrow.setAttribute('aria-hidden','true');
 site.append(siteLabel,arrow);site.setAttribute('aria-label','Показать '+(launch.siteLabel||'площадку 31')+' на карте');
 site.disabled=typeof onOpenSite!=='function';
 const openSite=()=>{if(typeof onOpenSite==='function')onOpenSite(launch.siteId||'pad-31');};
 site.addEventListener('click',openSite);footer.append(site);
 const scheduleUrl=sourceUrl(launch.schedule)||'https://rockettrip.space/raspisanie';
 const schedule=make('a','next-launch__schedule','Расписание запусков');
 schedule.href=scheduleUrl;schedule.target='_blank';schedule.rel='noopener noreferrer';
 schedule.setAttribute('aria-label','Открыть расписание запусков в новой вкладке');
 footer.append(schedule);countdownClock.append(countdownLabel,counter);
 section.append(head,countdownClock,meta,footer);element.replaceChildren(section);
 let disposed=false,interval=null,lastParts=null,lastMode='unknown',lastStatus='';
 const stopTimer=()=>{if(interval!==null){clock.clearInterval(interval);interval=null;}};
 const stats=()=>({version:LAUNCH_COUNTDOWN_VERSION,id:launch.id||null,name:launch.name||'ПРОГРЕСС МС-36',
  siteId:launch.siteId||'pad-31',precision:launch.precision||'unknown',status:launch.status||'planned',
  launchAt:launch.launchAt||null,updatedAt:launch.updatedAt||null,scheduleUrl,mode:lastMode,
  countdown:lastParts?{...lastParts}:null,message:lastStatus,timerActive:interval!==null,disposed});
 function refresh(){
  if(disposed)return stats();
  const precision=launch.precision||'unknown';
  lastParts=precision==='instant'?countdownParts(launch.launchAt,now()):null;
  lastMode=lastParts?(lastParts.expired?'elapsed':'countdown'):precision==='date'?'date':'unknown';
  section.dataset.state=lastMode;section.dataset.launchStatus=launch.status||'planned';
  lastStatus=lastParts?(lastParts.expired?'Ожидаем подтверждения':launch.status==='confirmed'?'Подтверждено':'Предварительно')
   :precision==='date'||precision==='instant'?'Время старта уточняется':'Дата старта уточняется';
  for(const [key]of units){
   const text=lastParts?String(lastParts[key]).padStart(key==='days'?3:2,'0'):'—';
   if(values[key].textContent!==text)values[key].textContent=text;
  }
  const spoken=lastParts?'До старта: '+units.map(([key])=>spokenUnit(lastParts[key],key)).join(', '):lastStatus;
  if(counter.getAttribute('aria-label')!==spoken)counter.setAttribute('aria-label',spoken);
  const label=launch.dateLabel||(precision==='instant'?formattedInstant(launch.launchAt):'');
  if(time.textContent!==label)time.textContent=label;time.hidden=!label;
  if(precision==='instant'&&instantMilliseconds(launch.launchAt)!==null)time.dateTime=launch.launchAt;
  else time.removeAttribute('datetime');
  if(status.textContent!==lastStatus)status.textContent=lastStatus;
  if(!doc.hidden&&lastParts&&!lastParts.expired){if(interval===null)interval=clock.setInterval(refresh,1000);}
  else stopTimer();
  return stats();
 }
 const onVisibility=()=>{if(doc.hidden)stopTimer();else refresh();};
 function dispose(){
  if(disposed)return;disposed=true;stopTimer();
  doc.removeEventListener('visibilitychange',onVisibility);site.removeEventListener('click',openSite);
  if(instances.get(element)===api)instances.delete(element);
 }
 const api={refresh,stats,dispose};instances.set(element,api);
 doc.addEventListener('visibilitychange',onVisibility);refresh();return api;
}
