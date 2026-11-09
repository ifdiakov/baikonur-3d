import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const path='tests/transport-transition-browser.mjs';let s=readFileSync(path,'utf8');
if(!s.includes('canonicalSignature')){
 const needle="assert.deepEqual(signature,reference.signature,'Original road, rail, lamp and material data differs')";assert(s.includes(needle),'Expected strict signature comparison is missing');
 s="import {canonicalSignature} from '../scripts/ci/signature.mjs';\n"+s.replace(needle,"assert.deepEqual(canonicalSignature(signature),canonicalSignature(reference.signature),'Original road, rail, lamp and material data differs')");writeFileSync(path,s);
}
const note='### Исправлено ложное расхождение JSON-снимков';
if(!readFileSync('PROJECT_CONTEXT.md','utf8').includes(note))appendFileSync('PROJECT_CONTEXT.md','\n\n'+note+'\nПубличная проверка NP run 42665718326 упала из-за undefined-полей материалов: сериализация JSON убирала их из эталона, а браузер возвращал ключи со значением undefined. Все 45 сохранённых геометрических и материальных сигнатур фактически совпали. Сравнение теперь приводит обе стороны к одному каноническому представлению, НЕ убирая реальные свойства/хеши; нечисловые NaN/Infinity отклоняются. Добавлены проверки, что изменение цвета, шейдера или хеша по-прежнему обнаруживается. Исходный неудачный отчёт сохраняется.\n');
console.log('STRICT_SIGNATURE_JSON_PARITY_FIXED');
