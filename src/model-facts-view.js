import {FACT_SOURCES} from './model-facts.js?v=20261102-site2-photo-v3';

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
 sources.replaceChildren();
 for(const id of facts.sources){const [label,url]=FACT_SOURCES[id],link=el('a',label+' ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';sources.append(link);}
}
