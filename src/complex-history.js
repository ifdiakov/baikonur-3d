import {COMPLEX_HISTORY_CHAPTERS} from './complex-history-content.js?v=20261103-foundation-v1';

// An independent, keyboard-accessible guide. It does not freeze the 3D camera;
// the panel occupies the former right hero area and never blocks map gestures.
export function createComplexHistoryPanel({onMap,onYear}={}){
 const shell=document.createElement('section');
 shell.id='complexHistoryPanel';shell.className='complex-history';shell.hidden=true;
 shell.setAttribute('role','dialog');shell.setAttribute('aria-modal','false');
 shell.setAttribute('aria-label','История создания Байконура');
 const header=document.createElement('div');header.className='complex-history__header';
 const identity=document.createElement('div');identity.className='complex-history__identity';
 const kicker=document.createElement('span');kicker.textContent='ЦИФРОВОЙ МУЗЕЙ · РАКЕТТРИП';
 const title=document.createElement('h2');title.textContent='ИСТОРИЯ БАЙКОНУРА';
 identity.append(kicker,title);
 const close=document.createElement('button');close.type='button';close.className='complex-history__close';
 close.textContent='✕';close.setAttribute('aria-label','Закрыть историю космодрома');close.title='Закрыть';
 header.append(identity,close);
 const navigation=document.createElement('nav');navigation.className='complex-history__nav';navigation.setAttribute('aria-label','Главы истории космодрома');
 const chapter=document.createElement('article');chapter.className='complex-history__article';
 const year=document.createElement('span');year.className='complex-history__date';
 const badge=document.createElement('span');badge.className='complex-history__badge';
 const heading=document.createElement('h3');heading.className='complex-history__title';
 const subtitle=document.createElement('p');subtitle.className='complex-history__subtitle';
 const lead=document.createElement('p');lead.className='complex-history__lead';
 const paragraphs=document.createElement('div');paragraphs.className='complex-history__paragraphs';
 const fact=document.createElement('div');fact.className='complex-history__fact';
 const sourceTitle=document.createElement('h4');sourceTitle.textContent='ИСТОЧНИКИ И ДОКУМЕНТЫ';
 const sources=document.createElement('div');sources.className='complex-history__sources';
 const controls=document.createElement('div');controls.className='complex-history__controls';
 const map=document.createElement('button');map.type='button';map.className='complex-history__button';
 map.textContent='ПОКАЗАТЬ ОБЪЕКТ НА КАРТЕ';
 const timeline=document.createElement('button');timeline.type='button';timeline.className='complex-history__button complex-history__button--ghost';
 timeline.textContent='ГОД НА ШКАЛЕ';
 controls.append(map,timeline);
 const footer=document.createElement('div');footer.className='complex-history__footer';
 const back=document.createElement('button');back.type='button';back.textContent='← НАЗАД';
 const count=document.createElement('span');
 const next=document.createElement('button');next.type='button';next.textContent='ДАЛЕЕ →';
 footer.append(back,count,next);
 chapter.append(year,badge,heading,subtitle,lead,paragraphs,fact,controls,sourceTitle,sources);
 shell.append(header,navigation,chapter,footer);document.body.append(shell);
 let selected=0,lastFocus=null;
 const tabs=COMPLEX_HISTORY_CHAPTERS.map((entry,i)=>{
  const button=document.createElement('button');button.type='button';button.className='complex-history__tab';
  button.textContent=entry.period+' · '+entry.title;
  button.addEventListener('click',()=>render(i));
  navigation.append(button);return button;
 });
 function render(i){
  selected=Math.max(0,Math.min(COMPLEX_HISTORY_CHAPTERS.length-1,i));
  const item=COMPLEX_HISTORY_CHAPTERS[selected];
  for(let j=0;j<tabs.length;j++)tabs[j].classList.toggle('is-current',j===selected);
  tabs[selected].setAttribute('aria-current','step');
  for(let j=0;j<tabs.length;j++)if(j!==selected)tabs[j].removeAttribute('aria-current');
  tabs[selected].scrollIntoView({block:'nearest',inline:'nearest'});
  year.textContent=item.period;badge.textContent=item.tag;
  heading.textContent=item.title;subtitle.textContent=item.subtitle;lead.textContent=item.lead;
  paragraphs.replaceChildren();
  for(const text of item.paragraphs){const p=document.createElement('p');p.textContent=text;paragraphs.append(p);}
  fact.textContent='КЛЮЧЕВОЙ ФАКТ · '+item.fact;
  sources.replaceChildren();
  for(const [name,url] of item.sources){
   const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';
   a.textContent=name+' ↗';sources.append(a);
  }
  map.hidden=!item.map;
  timeline.disabled=item.year<1955;
  count.textContent=(selected+1)+' / '+COMPLEX_HISTORY_CHAPTERS.length;
  back.disabled=selected===0;next.disabled=selected===COMPLEX_HISTORY_CHAPTERS.length-1;
  chapter.scrollTop=0;
 }
 function open(id){
  const i=COMPLEX_HISTORY_CHAPTERS.findIndex(x=>x.id===id);
  lastFocus=document.activeElement;
  shell.hidden=false;document.body.classList.add('complex-history-open');
  render(i<0?0:i);close.focus({preventScroll:true});return true;
 }
 function hide(){
  shell.hidden=true;document.body.classList.remove('complex-history-open');
  if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
 }
 close.addEventListener('click',hide);
 map.addEventListener('click',()=>{const item=COMPLEX_HISTORY_CHAPTERS[selected];if(item.map&&onMap?.(item.map)!==false)hide();});
 timeline.addEventListener('click',()=>{const item=COMPLEX_HISTORY_CHAPTERS[selected];if(item.year>=1955)onYear?.(item.year);});
 back.addEventListener('click',()=>render(selected-1));next.addEventListener('click',()=>render(selected+1));
 document.addEventListener('keydown',event=>{
  if(shell.hidden)return;
  if(event.key==='Escape'){event.stopPropagation();hide();}
 });
 render(0);
 return {open,close:hide,stats:()=>({visible:!shell.hidden,current:COMPLEX_HISTORY_CHAPTERS[selected].id,chapters:COMPLEX_HISTORY_CHAPTERS.length})};
}
