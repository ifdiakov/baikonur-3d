import {readFile, writeFile} from 'node:fs/promises';

// The labelled preview uses the production loader without importing the 3D
// scene. Its explicitly labelled demo bar replays with the launch statuses;
// production progress continues to come from actual museum-loading stages.
const entry = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const match = entry.match(/<!-- MUSEUM_PRELOADER_START -->\s*([\s\S]*?)\s*<!-- MUSEUM_PRELOADER_END -->/);
if (!match) throw new Error('Production preloader markup is missing');
const font = entry.match(/@font-face\{font-family:'Bounded';[^}]+\}/)?.[0];
if (!font) throw new Error('Museum headline font is missing');
if (!match[1].includes('<!-- PRELOADER_PREVIEW_ACTIONS -->')) throw new Error('Preview action slot is missing');
const markup = match[1]
  .replace('<section id="museumLoading"', '<section id="museumLoading" data-preview="true"')
  .replace('aria-label="Подготовка интерактивного музея Байконура"', 'aria-label="Предпросмотр прелоадера Байконура"')
  .replace(/(<[^>]+id="museumPreloaderMode"[^>]*>)[^<]*/, '$1ПРЕДПРОСМОТР')
  .replace('<!-- PRELOADER_PREVIEW_ACTIONS -->',
    '<a class="preloader__preview-link" href="./">Открыть музей <span aria-hidden="true">↗</span></a>')
  .replace('>Загружаем музей…</p>', '>Предпросмотр: демонстрационный цикл полосы загрузки. Откройте музей, чтобы загрузить настоящий макет.</p>');
const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="theme-color" content="#f3f0e7">
<title>Гранд-макет Байконур — экран загрузки</title>
<meta name="description" content="Гранд-макет Байконур: интерактивный музей 3D. Предпросмотр экрана загрузки с тематической галереей.">
<link rel="preload" as="image" href="./assets/preloader/soyuz-v1.webp?v=20261103-preloader-gallery-v12" type="image/webp" fetchpriority="high">
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&amp;display=swap" onload="this.onload=null;this.rel='stylesheet'">
<style>${font}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#f3f0e7;color:#10242d;font-family:Montserrat,Arial,sans-serif}body{overflow:hidden}
</style>
<link rel="stylesheet" href="./src/museum-preloader.css?v=20261103-preloader-priority-v10">

</head><body>
${markup}
<script src="./src/museum-preloader.js?v=20261103-preloader-smooth-v11"></script>
</body></html>
`;
await writeFile(new URL('../preloader.html', import.meta.url), html);
console.log('PRELOADER_PREVIEW_BUILT');
