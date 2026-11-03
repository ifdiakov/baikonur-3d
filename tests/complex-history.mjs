
import assert from 'node:assert/strict';
import {COMPLEX_HISTORY_CHAPTERS,COMPLEX_HISTORY_VERSION} from '../src/complex-history-content.js';
import {MUSEUM_SECTIONS} from '../src/museum-menu.js';
import {readFile} from 'node:fs/promises';
assert.equal(COMPLEX_HISTORY_VERSION,'complex-foundation-20261103-v1');
assert(COMPLEX_HISTORY_CHAPTERS.length>=9);
const ids=COMPLEX_HISTORY_CHAPTERS.map(c=>c.id);assert.equal(ids.length,new Set(ids).size);
const section=MUSEUM_SECTIONS.find(s=>s.id==='complexHistoryAccordion');
assert(section&&section.items.length===COMPLEX_HISTORY_CHAPTERS.length);
for(const c of COMPLEX_HISTORY_CHAPTERS){
 assert(c.title&&c.paragraphs.length>=2&&c.sources.length>=1);
 assert(c.sources.every(([name,url])=>name&&/^https:\/\//.test(url)));
 assert(c.paragraphs.every(text=>typeof text==='string'&&text.length>=40));
}
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const guide=await readFile(new URL('../src/complex-history.js',import.meta.url),'utf8');
assert(html.includes('id="complexHistoryAccordion"')&&html.includes('createComplexHistoryPanel'));
assert(guide.includes("setAttribute('role','dialog')")&&guide.includes("event.key==='Escape'"));
assert(html.includes("action.startsWith('history:')"));
console.log('COMPLEX_HISTORY_PASS',JSON.stringify({chapters:ids.length,section:true,mapLinks:COMPLEX_HISTORY_CHAPTERS.filter(c=>c.map).length}));
