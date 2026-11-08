from pathlib import Path
import re


def replace(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        assert new in text, f'Unexpected source: {path}: {old[:70]}'
        return
    assert text.count(old) == 1, f'Ambiguous edit: {path}'
    p.write_text(text.replace(old, new))


replace('src/camera-altitude.js', 'export function createCameraAltitude(){', 'export function createCameraAltitude({enabled=false}={}){')
replace('src/camera-altitude.js', "root.id='cameraAltitude';root.className='camera-altitude';", "root.id='cameraAltitude';root.className='camera-altitude';\n // Owner request 2026-11-09: keep technical telemetry, not a visible HUD.\n root.hidden=true;root.style.display='none';root.setAttribute('aria-hidden','true');")
replace('src/camera-altitude.js', " let last='';\n return {update(height,y,level){", " let last='';\n function setEnabled(value){\n  enabled=Boolean(value);root.hidden=!enabled;root.style.display=enabled?'':'none';\n  root.setAttribute('aria-hidden',String(!enabled));last='';\n }\n setEnabled(enabled);\n return {setEnabled,isEnabled:()=>enabled,update(height,y,level){")
replace('src/coordinate-grid.js', " // Editing coordinates are part of the museum's normal authoring view.\n // Keep them active across ordinary navigation and URL refreshes; use G or\n // ?grid=0 to temporarily hide the overlay.\n setEnabled(new URLSearchParams(location.search).get('grid')!=='0');", " // Owner request 2026-11-09: every visit starts with a clean museum view.\n // Legacy ?grid=1 links must not restore debugging overlays. G and the\n // existing button remain available for deliberate editing sessions.\n setEnabled(false);")
replace('src/coordinate-grid.js', "version:'coordinate-grid-v4-default-visible'", "version:'coordinate-grid-v5-default-hidden'")
replace('src/transport-reference-labels.js', 'let enabled=Boolean(grid?.isEnabled?.()),lastDraw=0,layoutWidth=0,layoutHeight=0;', 'let enabled=false,lastDraw=0,layoutWidth=0,layoutHeight=0;')
replace('src/transport-reference-labels.js', "version:'transport-labels-v1'", "version:'transport-labels-v2-default-hidden'")
for module in ['camera-altitude', 'coordinate-grid', 'transport-reference-labels']:
    p = Path('index.html')
    text = p.read_text()
    pattern = rf'(\./src/{module}\.js\?v=)[^\x27\x22]+'
    text, count = re.subn(pattern, r'\g<1>20261109-overlays-off-v1', text)
    assert count == 1, (module, count)
    p.write_text(text)
p = Path('PROJECT_CONTEXT.md')
text = p.read_text()
text = text.replace('Обновлено 2026-11-08. Репозиторий:', 'Обновлено 2026-11-09. Репозиторий:', 1)
heading = '## 2026-11-09 · Высотомер, координатная сетка и подписи дорог отключены'
if heading not in text:
    text += '\n\n' + heading + '\n\n'
    text += '- Последнее указание владельца отменяет прежнее автоматическое включение технических слоёв: при каждом открытии и обновлении карты скрыты плашка высотомера, координатная сетка, координаты курсора, идентификаторы АД/ЖД и их легенда. Старые ссылки `?grid=1` не включают их автоматически.\n'
    text += '- Названия и карточки площадок/объектов, геометрия дорог/ЖД, рельеф, камера и анимации не изменены. Кнопки диагностики и G сохранены для осознанного ручного включения в текущем сеансе; следующий вход снова начинается без технических слоёв.\n'
    text += '- Высотомер по умолчанию `enabled:false`, скрыт через `hidden`, `display:none` и `aria-hidden`. Его технические данные сохранены для проверок камеры; доступно явное `setEnabled`. У модулей обновлены URL кеширования в `index.html`.\n'
    text += '- Проверка: `tests/authoring-overlays-browser.mjs` и `.github/workflows/verify-authoring-overlays.yml`: настоящий Chromium/WebGL, desktop/mobile, повторный вход со старым URL, отсутствие оверлеев, сохранение подписей площадок, ручные переключатели, отсутствие ошибок JS/WebGL. Публикация подтверждается только успешной проверкой SHA-256 публичных файлов и повторным браузерным прогоном после GitHub Pages. Этот релиз не означает исправления прежних проблем перекрёстков и дорог пл.113.\n'
p.write_text(text)
