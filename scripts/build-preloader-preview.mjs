import {readFile, writeFile} from 'node:fs/promises';

// The labelled preview uses the production loader without importing the 3D
// scene. Its illustration replays; the real loading bar remains at zero.
const entry = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const match = entry.match(/<!-- MUSEUM_PRELOADER_START -->\s*([\s\S]*?)\s*<!-- MUSEUM_PRELOADER_END -->/);
if (!match) throw new Error('Production preloader markup is missing');
const font = entry.match(/@font-face\{font-family:'Bounded';[^}]+\}/)?.[0];
if (!font) throw new Error('Museum headline font is missing');
if (!match[1].includes('<!-- PRELOADER_PREVIEW_ACTIONS -->')) throw new Error('Preview action slot is missing');
const markup = match[1]
  .replace('<section id="museumLoading"', '<section id="museumLoading" data-preview="true"')
  .replace('aria-label="Подготовка интерактивного музея Байконура"', 'aria-label="Предпросмотр прелоадера Байконура"')
  .replace(/(<[^>]+id="museumPreloaderMode"[^>]*>)[^<]*/, '$1Предпросмотр анимации')
  .replace('<!-- PRELOADER_PREVIEW_ACTIONS -->',
    '<a class="preloader__preview-link" href="./">Открыть музей <span aria-hidden="true">↗</span></a>')
  .replace('>Загружаем музей…</p>', '>Предпросмотр экрана загрузки. Полоса заполняется при загрузке настоящего макета.</p>');
const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="theme-color" content="#09121b">
<title>Байконур — анимация загрузки</title>
<meta name="description" content="Динамичный флэт-прелоадер музея Байконура: от выбора места для космодрома до зажигания.">
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&amp;display=swap" onload="this.onload=null;this.rel='stylesheet'">
<style>${font}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#09121b;color:#f4f3ed;font-family:Montserrat,Arial,sans-serif}body{overflow:hidden}
</style>
<link rel="stylesheet" href="./src/museum-preloader.css?v=20261101-preloader-flat-v2">
<style>
.preloader__preview-link{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border:1px solid #6b8590;border-radius:0;color:#f4f3ed;text-decoration:none;font:600 10px/1.2 Montserrat,Arial,sans-serif;white-space:nowrap}
.preloader__preview-link:hover{background:#20343f}.preloader__preview-link:focus-visible{outline:2px solid #ff8b77;outline-offset:3px}
@media(max-width:560px){.preloader__preview-link{padding:0 8px;font-size:9px}}
</style>
</head><body>
${markup}
<script src="./src/museum-preloader.js?v=20261101-preloader-flat-v2"></script>
</body></html>
`;
await writeFile(new URL('../preloader.html', import.meta.url), html);
console.log('PRELOADER_PREVIEW_BUILT');
