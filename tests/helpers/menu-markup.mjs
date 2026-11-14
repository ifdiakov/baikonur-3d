import assert from 'node:assert/strict';
import {parse} from 'parse5';

const attribute=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
const classes=node=>(attribute(node,'class')||'').split(/\s+/);
function all(node,predicate){return [...(predicate(node)?[node]:[]),...(node.childNodes||[]).flatMap(child=>all(child,predicate))];}
const text=node=>node.nodeName==='#text'?node.value:(node.childNodes||[]).map(text).join('');

// Presence and visibility are separate contracts. Archived navigation stays
// in the source, while the approved public menu keeps these two entries hidden.
export function assertMenuMarkup(html,sections){
 const document=parse(html),byId=id=>all(document,node=>attribute(node,'id')===id);
 const aside=byId('ui');assert.equal(aside.length,1,'One museum sidebar');
 const expected=sections.filter(section=>!section.parent);
 const actual=all(aside[0],node=>node.tagName==='details'&&classes(node).includes('museum-section'));
 assert.deepEqual(actual.map(node=>attribute(node,'id')),expected.map(section=>section.id),'All archived menu sections remain ordered');
 assert.deepEqual(actual.map(node=>text(all(all(node,n=>n.tagName==='summary')[0],n=>classes(n).includes('sites-accordion-title'))[0]).trim()),expected.map(section=>section.title),'All section headings remain intact');
 for(const node of actual){
  const id=attribute(node,'id'),hidden=id==='complexHistoryAccordion';
  assert.equal(attribute(node,'hidden')!==undefined,hidden,'Approved menu visibility: '+id);
  if(hidden)assert.match(attribute(node,'style')||'',/display\s*:\s*none\s*!important/,'History is retained but hidden');
  else assert.doesNotMatch(attribute(node,'style')||'',/display\s*:\s*none/,'Visible section must not be suppressed');
 }
 const links=byId('encyclopediaNavLink');assert.equal(links.length,1,'Archived encyclopedia link is retained');
 assert.equal(attribute(links[0],'href'),'./encyclopedia.html');
 assert.notEqual(attribute(links[0],'hidden'),undefined,'Encyclopedia menu link remains intentionally hidden');
 assert.match(attribute(links[0],'style')||'',/display\s*:\s*none\s*!important/);
 return {sections:actual.length,visibleSections:actual.filter(node=>attribute(node,'hidden')===undefined).length,historyHidden:true,encyclopediaHidden:true};
}
