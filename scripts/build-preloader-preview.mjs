import {readFile, writeFile} from 'node:fs/promises';

// The shareable preview uses the exact production introduction and assets.
// It never imports the 3D scene and never simulates progress or download time.
const entry = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const match = entry.match(/<!-- MUSEUM_PRELOADER_START -->\s*([\s\S]*?)\s*<!-- MUSEUM_PRELOADER_END -->/);
if (!match) throw new Error('Production preloader markup is missing');
const font = entry.match(/@font-face\{font-family:'Bounded';[^}]+\}/)?.[0];
if (!font) throw new Error('Museum headline font is missing');
const markup = match[1]
  .replace('aria-label="Подготовка интерактивного музея Байконура"', 'aria-label="Предпросмотр прелоадера Байконура"')
  .replace(/<div class="preloader__connection">[\s\S]*?<\/div>/,
    '<div class="preloader__connection"><a class="preloader__preview-link" href="./">Открыть музей <span aria-hidden="true">↗</span></a></div>')
  .replace('>Загружаем музей…</p>', '>Предпросмотр экрана загрузки</p>')
  .replace('>Макет откроется автоматически</p>', '>В музее экран исчезает после готовности сцены</p>')
  .replace('>ЭТАП</span>', '>ДЕМО</span>');
const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="theme-color" content="#09121b">
<title>БАЙКОНУР — прелоадер</title>
<meta name="description" content="Интерактивный прелоадер музея Байконура: выберите историю и откройте космодром.">
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&amp;display=swap" onload="this.onload=null;this.rel='stylesheet'">
<style>${font}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#09121b;color:#f4f3ed;font-family:Montserrat,Arial,sans-serif}body{overflow:hidden}
</style>
<link rel="stylesheet" href="./src/museum-preloader.css?v=20261101-preloader-v1">
<style>
.preloader__preview-link{display:inline-flex;align-items:center;gap:15px;min-height:44px;padding:0 13px;border:1px solid #ffd0b745;border-radius:5px;color:#ffcab6;text-decoration:none;font:600 10px/1.3 Montserrat,Arial,sans-serif;letter-spacing:.02em;white-space:nowrap}
.preloader__preview-link:hover{background:#ff8b7715;border-color:#ffc1a88c}.preloader__preview-link:focus-visible{outline:2px solid #ffd2c3;outline-offset:3px}
@media(max-width:700px){.preloader__preview-link{gap:6px;padding:0 9px;font-size:8px}.preloader__header{display:flex;min-height:44px}}
@media(min-width:701px) and (max-height:540px){.preloader__header{display:flex;min-height:44px}.preloader__frame{height:auto;min-height:100%;grid-template-rows:auto auto minmax(155px,1fr) auto}}
</style>
</head><body>
${markup}
<script src="./src/museum-preloader.js?v=20261101-preloader-v1"></script>
</body></html>
`;
await writeFile(new URL('../preloader.html', import.meta.url), html);
console.log('PRELOADER_PREVIEW_BUILT');
