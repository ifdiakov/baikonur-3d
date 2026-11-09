import {readFileSync,writeFileSync,readdirSync,appendFileSync,mkdirSync} from 'node:fs';
import {workflowPaths} from './ci/impact.mjs';
const root='.github/workflows/';
const names=readdirSync(root).filter(f=>f.endsWith('.yml')&&f!=='nonblocking-detail.yml'&&workflowPaths(readFileSync(root+f,'utf8')).includes('index.html'));
const marker='# CI_RELIABILITY_V1';
function addIf(block,condition){
 const m=block.match(/^        if: (.+)$/m);
 if(m){const expression=m[1].trim().replace(/^\$\{\{\s*|\s*\}\}$/g,'');return block.replace(m[0],`        if: (${expression}) && (${condition})`);}
 const pos=block.indexOf('\n');return block.slice(0,pos)+`\n        if: ${condition}`+block.slice(pos);
}
function cache(condition,version='1.57.0'){
 return `      - name: Reuse downloaded verification dependencies\n        if: ${condition}\n        uses: actions/cache@v4\n        with:\n          path: ~/.npm\n          key: museum-npm-\${{ runner.os }}-v1\n      - name: Reuse matching browser binaries\n        if: ${condition}\n        uses: actions/cache@v4\n        with:\n          path: ~/.cache/ms-playwright\n          key: museum-playwright-\${{ runner.os }}-${version}\n`;
}
const modified=[];
for(const name of names){
 const path=root+name;let s=readFileSync(path,'utf8');if(s.includes(marker))continue;
 const chunks=s.split(/(?=^      - )/m);let gated=false;
 for(let i=1;i<chunks.length;i++){
  let c=chunks[i];if(/^      - uses: actions\/checkout@/m.test(c)){
   c+=`      - name: Select relevant checks before downloading tools\n        id: ci_scope\n        run: node scripts/ci/impact.mjs ${name}\n`;gated=true;
  }else if(gated){
   const boundary=c.search(/^  [a-zA-Z_][\w-]*:\s*$/m),tail=boundary>=0?c.slice(boundary):'';
   c=boundary>=0?c.slice(0,boundary):c;c=addIf(c,"steps.ci_scope.outputs.run == 'true'");
   if(c.includes('uses: actions/setup-node@'))c+=cache("steps.ci_scope.outputs.run == 'true'",s.match(/playwright@([\d.]+)/)?.[1]||'1.57.0');
   c+=tail;if(tail)gated=false;
  }
  chunks[i]=c;
 }
 s=marker+'\n'+chunks.join('');writeFileSync(path,s);modified.push(name);
}
{
 const path=root+'nonblocking-detail.yml';let s=readFileSync(path,'utf8');
 if(!s.includes(marker)){
  const condition="steps.impact.outputs.runtime == 'true'",chunks=s.split(/(?=^      - )/m);
  for(let i=1;i<chunks.length;i++){
   let c=chunks[i];
   if(c.includes('uses: actions/checkout@')){
    c+=`      - name: Select full or targeted acceptance\n        id: impact\n        run: node scripts/ci/impact.mjs release\n      - name: Validate CI selection and failure guards\n        run: node tests/ci-reliability.mjs\n`;
   }else if(c.includes('uses: actions/upload-artifact@')){
    c=c.replace('          path: qa-freeze/','          path: |\n            qa-freeze/\n            qa-ci/');
   }else{
    c=addIf(c,condition);
    if(c.includes('uses: actions/setup-node@'))c+=cache(condition);
    if(c.includes('Compare exact geometry and verify responsiveness')){
     c=c.replace('run: node tests/transport-transition-browser.mjs',`run: |\n          if [ "\${{ steps.impact.outputs.profile }}" = "np" ]; then\n            FIXTURE=0 node scripts/ci/run-bounded.mjs 600 candidate-np node tests/np-royaltent-browser.mjs\n          else\n            node scripts/ci/run-bounded.mjs 900 candidate-full node tests/transport-transition-browser.mjs\n          fi`);
    }
    if(c.includes('name: Repeat on the actual published site')){
     c=c.replace('run: node tests/transport-transition-browser.mjs',`run: |\n          node scripts/ci/release-proof.mjs confirm\n          if [ "\${{ steps.impact.outputs.profile }}" = "np" ]; then\n            FIXTURE=0 node scripts/ci/run-bounded.mjs 600 public-np node tests/np-royaltent-browser.mjs\n          else\n            node scripts/ci/run-bounded.mjs 900 public-full node tests/transport-transition-browser.mjs\n          fi`);
    }
    if(c.includes('name: Verify published tent revision')){
     c=addIf(c,"steps.impact.outputs.profile != 'np'");
     c=c.replace('run: node tests/np-royaltent-browser.mjs','run: node scripts/ci/run-bounded.mjs 360 public-np-closeup node tests/np-royaltent-browser.mjs');
    }
    if(c.includes('rm -rf /tmp/museum-pages/.github'))c+='          node scripts/ci/release-proof.mjs manifest /tmp/museum-pages\n';
    if(c.includes('uses: actions/deploy-pages@'))c=`      - name: Refuse stale publication\n        if: github.ref == 'refs/heads/main' && (${condition})\n        run: node scripts/ci/release-proof.mjs guard\n`+c;
   }
   chunks[i]=c;
  }
  s=marker+'\n'+chunks.join('');
  const artifact="      - uses: actions/upload-artifact@v4";
  if(!s.includes(artifact))throw Error('Release artifact boundary missing');
  s=s.replace(artifact,`      - name: Mark complete only after all published checks pass\n        if: github.ref == 'refs/heads/main' && (${condition})\n        run: node scripts/ci/release-proof.mjs complete qa-freeze\n`+artifact);
  writeFileSync(path,s);modified.push('nonblocking-detail.yml');
 }
}
const heading='## 2026-11-09 · Быстрые и проверяемые итерации';
if(!readFileSync('PROJECT_CONTEXT.md','utf8').includes(heading))appendFileSync('PROJECT_CONTEXT.md','\n\n'+heading+'\nНа NP-релиз один push запустил 17 workflows; cache-bust index.html запускал несвязанные браузерные проверки. В 15 специализированных workflows добавлен предварительный анализ фактических изменений: существующие тесты сохранены, несвязанные прогоны пропускаются ДО установки браузера. При неизвестном diff и ручном запуске — полный прогон. Изменение логики HTML, в отличие от номера версии ресурса, не пропускается. Кешируются npm-загрузки и версионные бинарники Playwright.\nОсновной workflow выбирает узкий случай NP-only: полная приёмка шатров desktop/mobile/workshop вместо повторного построения неизменённых дорог. Остальные и неизвестные изменения сцены проходят прежнюю полную приёмку. Только CI/документация не переиздают музей. Модели, меню, свет и детализация ради скорости проверки не упрощаются.\nПроцессы имеют общий deadline, сохраняют вывод и точную ошибку; запрещены бесконечные перезапуски до зелёного результата. Перед deploy проверяется текущая main. В payload создаётся release-manifest.json с SHA исходников и файлов; после публикации сверяются манифест и фактические файлы. completion.json создаётся только при passed:true во всех отчётах, наличии desktop/mobile/workshop и совпадении публичной ревизии. Это доказательство конкретной приёмки, не гарантия отсутствия всех ошибок.\nПорядок работы: одна узкая задача, один набор изменений и один активный релиз. Сначала локальная диагностика, затем кандидат и публикация. Сохранять результаты между сообщениями; вести docs/WORK_STATUS.md. При перебивании добавить новую задачу, не теряя предыдущую; не перезапускать успешные проверки без причины. Не опрашивать один статус десятки раз: проверять при смене этапа и заниматься другой полезной работой. Четыре коротких раздела отчёта и две ссылки внизу сохраняются.\n');
mkdirSync('qa-ci',{recursive:true});writeFileSync('qa-ci/upgrade.json',JSON.stringify({modified,scopedWorkflows:names.length,applicationFilesChanged:false},null,2));console.log('CI_RELIABILITY_APPLIED',modified.length);
