import {FACT_SOURCES} from './model-facts.js?v=20261108-rd180-v1';

// Build with text nodes so catalogue copy and source labels cannot become markup.
export function renderModelFacts(spec,container,sources){
 const facts=spec.facts;
 const el=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
 const heading=el('h2','Характеристики и история');heading.id='factsTitle';
 const summary=el('p',facts.summary,'facts-summary');summary.id='modelDescription';
 const specs=el('dl',null,'facts-specs');
 for(const [label,value]of facts.specs){const row=el('div');row.append(el('dt',label),el('dd',value));specs.append(row);}
 const meta=el('dl',null,'facts-history');
 for(const [label,value]of [['Предприятие-разработчик',facts.developer],['Годы эксплуатации',facts.service],facts.activity]){
  const row=el('div');row.append(el('dt',label),el('dd',value));meta.append(row);
 }
 const list=el('ul',null,'facts-list');for(const fact of facts.facts)list.append(el('li',fact));
 container.dataset.modelId=spec.id;
 container.replaceChildren(heading,summary,el('h3','ТТХ'),specs,meta,el('h3','Примечательные факты'),list);
 if(facts.note)container.append(el('p',facts.note,'facts-note'));
 if(facts.related?.length){
  const related=el('nav',null,'facts-related');related.setAttribute('aria-label','Связи экспоната');
  for(const group of facts.related){
   const section=el('section');section.append(el('h3',group.title));const links=el('div',null,'facts-related-links');
   for(const [id,label,relation]of group.items){
    const link=el('a');link.href='../encyclopedia.html#'+encodeURIComponent(id);link.target='_top';link.dataset.relatedId=id;
    link.append(el('strong',label),el('span',relation));links.append(link);
   }
   section.append(links);related.append(section);
  }
  container.append(related);
 }
 sources.replaceChildren();
 for(const id of facts.sources){const [label,url]=FACT_SOURCES[id],link=el('a',label+' ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';sources.append(link);}
}
