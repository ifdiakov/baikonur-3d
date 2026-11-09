// Preserve the original menu design while preventing flexbox from clipping
// the newly nested traditions group. This migration is safe to repeat.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const path='scripts/apply-evening-navigation.mjs';
let source=await readFile(path,'utf8');
if(!source.includes('NESTED_TRADITIONS_LAYOUT_V1')){
 const css='\n/* NESTED_TRADITIONS_LAYOUT_V1 */\n#mythsAccordion #traditionsAccordion{flex:0 0 auto}\n#mythsAccordion #traditionsAccordion>.sites-accordion-body{max-height:none;overflow:visible}\n#mythsAccordion #traditionsAccordion:not([open])>summary .sites-chevron{transform:none}\n';
 const helper='const nestedLayoutCSS='+JSON.stringify(css)+';\nfunction finishLayout(path,text){return path===\'src/evening.css\'&&!text.includes(\'NESTED_TRADITIONS_LAYOUT_V1\')?text+nestedLayoutCSS:text;}\n';
 assert(source.includes(" if(text.includes('EVENING_NAVIGATION_V1'))return text;"));
 assert(source.includes(' return text;\n}'));
 source=source.replace('export function transform(path,text){',helper+'export function transform(path,text){')
  .replace(" if(text.includes('EVENING_NAVIGATION_V1'))return text;"," if(text.includes('EVENING_NAVIGATION_V1'))return finishLayout(path,text);")
  .replace(' return text;\n}',' return finishLayout(path,text);\n}');
 await writeFile(path,source);
}
const testPath='tests/evening-navigation-browser-checks.mjs';let test=await readFile(testPath,'utf8');
if(!test.includes('NESTED_TRADITIONS_LAYOUT_V1')){
 const anchor=" assert.equal(await page.locator('#mythsAccordion [data-museum-action]').count(),4);";
 assert(test.includes(anchor));
 const check=` // NESTED_TRADITIONS_LAYOUT_V1: visible DOM alone is insufficient; no child clipping.
 const fit=await page.locator('#traditionsAccordion').evaluate(el=>{const group=el.getBoundingClientRect(),entry=el.querySelector('[data-museum-action]').getBoundingClientRect();return {groupBottom:group.bottom,entryBottom:entry.bottom};});
 assert(fit.entryBottom<=fit.groupBottom+1,'Nested tradition article is clipped by its parent');
 await page.locator('#traditionsAccordion [data-museum-action="story:coins-under-tua"]').scrollIntoViewIfNeeded();
`;
 test=test.replace(anchor,check+anchor);await writeFile(testPath,test);
}
let context=await readFile('PROJECT_CONTEXT.md','utf8');
if(!context.includes('NESTED_TRADITIONS_LAYOUT_V1')){
 context+='\nNESTED_TRADITIONS_LAYOUT_V1: вложенный раздел не сжимается родительским flex-контейнером; статья не обрезается рамкой details. Прокрутка остаётся у общего списка, стрелка свёрнутой вложенной группы не переворачивается из-за открытого родителя. Браузерная проверка сравнивает реальные границы кнопки и группы, а не только присутствие в DOM.\n';
 await writeFile('PROJECT_CONTEXT.md',context);
}
console.log('NESTED_TRADITIONS_LAYOUT_READY');
