(function () {
  'use strict';

  // The tour runs alongside the preloader. It has no minimum loading time and
  // never prevents an already rendered museum from becoming interactive.
  const TOTAL_MS = 26000;
  const STORAGE_KEY = 'baikonur-museum-onboarding-v1';
  const query = new URLSearchParams(location.search);
  const forced = query.get('tour') === '1';
  const deepLink = ['view', 'site', 'station', 'detail'].some(key => query.has(key));
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const steps = [
    { until: 5000, glyph: '↔', title: 'ПЕРЕМЕЩАЙТЕСЬ ПО КАРТЕ',
      description: mobile ? 'Проведите одним пальцем по экрану, чтобы исследовать весь космодром.' : 'Удерживайте левую кнопку мыши и двигайте карту в любую сторону.' },
    { until: 11000, glyph: '◎', title: 'ПРИБЛИЖАЙТЕ И ВРАЩАЙТЕ',
      description: mobile ? 'Сводите и разводите два пальца для масштаба. Двумя пальцами меняйте ракурс.' : 'Колёсико приближает объекты. Правая кнопка мыши вращает камеру.' },
    { until: 17000, glyph: '⌖', title: 'ВЫБИРАЙТЕ ПЛОЩАДКИ',
      description: 'Нажмите на сооружение или его название — откроются карточка, 3D-модель и интересные факты.' },
    { until: 22000, glyph: '▤', title: 'ИССЛЕДУЙТЕ РАЗДЕЛЫ',
      description: 'В меню собраны ракеты, стартовые комплексы, герои, легенды и история Байконура.' },
    { until: 26000, glyph: '▶', title: 'ОЖИВЛЯЙТЕ ИСТОРИЮ',
      description: 'Раздел «Цифровые реконструкции»: запуски, посадка «Бурана» и другие события в 3D.' }
  ];
  let root, title, description, glyph, counter, countdown, fill, stateLabel, skip;
  let active = false, mapReady = false, api = null, frame = 0, elapsed = 0, lastFrame = 0;
  let stepIndex = -1, spotlight = null, tween = null, original = null, highlightedAccordion = null;
  let focusDemonstrated = false;

  function seen() {
    try { return localStorage.getItem(STORAGE_KEY) === 'yes'; } catch (_) { return false; }
  }
  function recordSeen() {
    try { localStorage.setItem(STORAGE_KEY, 'yes'); } catch (_) {}
  }
  function build() {
    root = document.createElement('section');
    root.id = 'museumOnboarding';
    root.hidden = true;
    root.dataset.ready = 'false';
    root.setAttribute('aria-label', 'Краткое обучение 3D-музею');
    root.innerHTML = [
      '<div class="museum-tour__panel">',
      '<div class="museum-tour__top"><span class="museum-tour__eyebrow">КАК ИССЛЕДОВАТЬ БАЙКОНУР</span>',
      '<button class="museum-tour__skip" type="button">Пропустить ✕</button></div>',
      '<div class="museum-tour__body"><span class="museum-tour__glyph" aria-hidden="true">↔</span>',
      '<div class="museum-tour__copy"><h2 class="museum-tour__title">ПЕРЕМЕЩАЙТЕСЬ ПО КАРТЕ</h2>',
      '<p class="museum-tour__text" aria-live="polite"></p></div></div>',
      '<div class="museum-tour__meta"><span class="museum-tour__step">01 / 05</span><span class="museum-tour__countdown">26 СЕК</span></div>',
      '<div class="museum-tour__track" role="progressbar" aria-label="Ход обучения" aria-valuemin="0" aria-valuemax="26" aria-valuenow="0"><span class="museum-tour__fill"></span></div>',
      '<p class="museum-tour__foot">Подготавливаем 3D-макет параллельно с обучением…</p>',
      '</div>'
    ].join('');
    document.body.appendChild(root);
    title = root.querySelector('.museum-tour__title');
    description = root.querySelector('.museum-tour__text');
    glyph = root.querySelector('.museum-tour__glyph');
    counter = root.querySelector('.museum-tour__step');
    countdown = root.querySelector('.museum-tour__countdown');
    fill = root.querySelector('.museum-tour__fill');
    stateLabel = root.querySelector('.museum-tour__foot');
    skip = root.querySelector('.museum-tour__skip');
    skip.addEventListener('click', () => stop(true));
    // The tour is an optional coachmark, not a modal. The real map remains
    // directly usable; any first gesture immediately gives control to the user.
    document.addEventListener('pointerdown', event => {
      if (active && mapReady && !root.contains(event.target)) stop(false);
    }, true);
    document.addEventListener('wheel', event => {
      if (active && mapReady && !root.contains(event.target)) stop(false);
    }, { capture: true, passive: true });
    document.addEventListener('keydown', event => {
      if (!active || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        stop(true);
      } else if (mapReady && (/^Arrow/.test(event.key) || /^[wasd]$/i.test(event.key))) {
        stop(false);
      }
    }, true);
  }

  function spotlightOn(target) {
    if (spotlight) spotlight.classList.remove('museum-tour-spotlight');
    spotlight = target || null;
    if (spotlight && spotlight.getClientRects().length) spotlight.classList.add('museum-tour-spotlight');
  }
  function pose() {
    return api ? { position: api.camera.position.clone(), target: api.controls.target.clone() } : null;
  }
  function restorePose(saved) {
    if (!api || !saved) return;
    api.camera.position.copy(saved.position);
    api.controls.target.copy(saved.target);
    api.camera.lookAt(api.controls.target);
    api.camera.updateMatrixWorld(true);
  }
  function transition(end, duration) {
    if (!mapReady || !api || reducedMotion || !end) return;
    tween = { from: pose(), to: end, start: performance.now(), duration: duration || 2000 };
  }
  function applyStep(index) {
    if (index < 0 || index >= steps.length) return;
    stepIndex = index;
    const step = steps[index];
    title.textContent = step.title;
    description.textContent = step.description;
    glyph.textContent = step.glyph;
    counter.textContent = String(index + 1).padStart(2, '0') + ' / 05';
    spotlightOn(null);
    if (!mapReady || !api) return;

    if (index === 0 && !reducedMotion) {
      const end = pose();
      const shift = Math.min(160, Math.max(35, end.position.distanceTo(end.target) * .045));
      end.position.x += shift;
      end.target.x += shift;
      transition(end, 2400);
    } else if (index === 1 && !reducedMotion) {
      const end = pose();
      const x = end.position.x - end.target.x, z = end.position.z - end.target.z;
      const angle = .11, scale = .77;
      end.position.x = end.target.x + (x * Math.cos(angle) - z * Math.sin(angle)) * scale;
      end.position.z = end.target.z + (x * Math.sin(angle) + z * Math.cos(angle)) * scale;
      end.position.y = end.target.y + (end.position.y - end.target.y) * scale;
      transition(end, 2800);
    } else if (index === 2) {
      // A genuine site selection and real 3D camera journey; no video/mockup.
      if (!focusDemonstrated && typeof api.focusGagarin === 'function') {
        const start = pose();
        try {
          api.focusGagarin();
          focusDemonstrated = true;
          const end = pose();
          restorePose(start);
          transition(end, 1800);
        } catch (error) {
          console.warn('Museum onboarding focus unavailable:', error);
        }
      }
      spotlightOn(document.getElementById('info'));
    } else if (index === 3) {
      spotlightOn((mobile ? document.getElementById('mobileMenuToggle') : null) ||
        document.getElementById('sitesAccordion'));
    } else if (index === 4) {
      const menu = document.getElementById('reconstructionsAccordion');
      if (menu && !mobile) {
        highlightedAccordion = { element: menu, wasOpen: menu.open };
        menu.open = true;
      }
      spotlightOn(mobile ? document.getElementById('mobileMenuToggle') : menu);
    }
  }

  function tick(now) {
    if (!active) return;
    if (lastFrame && !document.hidden) elapsed += Math.max(0, now - lastFrame);
    lastFrame = now;
    if (tween && mapReady && api) {
      const t = Math.max(0, Math.min(1, (now - tween.start) / tween.duration));
      const eased = t * t * (3 - 2 * t);
      api.camera.position.copy(tween.from.position).lerp(tween.to.position, eased);
      api.controls.target.copy(tween.from.target).lerp(tween.to.target, eased);
      api.camera.lookAt(api.controls.target);
      api.camera.updateMatrixWorld(true);
      if (t >= 1) tween = null;
    }
    const next = steps.findIndex(step => elapsed < step.until);
    if (next === -1) { stop(false); return; }
    if (next !== stepIndex) applyStep(next);
    countdown.textContent = Math.ceil((TOTAL_MS - elapsed) / 1000) + ' СЕК';
    fill.style.width = (elapsed / TOTAL_MS * 100).toFixed(1) + '%';
    root.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(Math.floor(elapsed / 1000)));
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (!root || active) return;
    // A replay starts at the current view. Skipping restores that view.
    original = pose();
    active = true;
    elapsed = 0;
    lastFrame = 0;
    stepIndex = -1;
    focusDemonstrated = false;
    highlightedAccordion = null;
    tween = null;
    root.dataset.ready = String(mapReady);
    root.hidden = false;
    stateLabel.textContent = mapReady ? 'Макет готов. Можно прервать обучение в любой момент.' :
      'Подготавливаем 3D-макет параллельно с обучением…';
    frame = requestAnimationFrame(tick);
  }

  function stop(restore) {
    if (!active) return;
    active = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    tween = null;
    spotlightOn(null);
    root.hidden = true;
    if (restore && original) {
      restorePose(original);
      if (typeof api?.clearDemo === 'function' && focusDemonstrated) api.clearDemo();
      if (highlightedAccordion && !highlightedAccordion.wasOpen) highlightedAccordion.element.open = false;
    }
    recordSeen();
  }
  function attach(options) {
    api = options;
    if (mapReady && !active) return;
  }
  function ready() {
    mapReady = true;
    if (!root) return;
    root.dataset.ready = 'true';
    stateLabel.textContent = 'Макет готов. Можно прервать обучение в любой момент.';
    if (active) {
      original = pose();
      // The preloader may have occupied some of the tour. Demonstrate the
      // currently shown step on the actual scene when it becomes available.
      const stage = stepIndex;
      stepIndex = -1;
      applyStep(stage >= 0 ? stage : 0);
    }
  }
  function fail() { if (active) stop(false); }
  function installReplay() {
    const host = document.querySelector('#navigationGuide .navigation-guide-content');
    if (!host || host.querySelector('.museum-tour-replay')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'museum-tour-replay';
    button.textContent = '↻  ПОВТОРИТЬ ОБУЧЕНИЕ · 26 СЕК';
    button.addEventListener('click', () => start());
    host.appendChild(button);
  }

  build();
  document.addEventListener('DOMContentLoaded', installReplay, { once: true });
  // Paused/hidden tabs must not consume the visitor's 26 seconds of learning.
  document.addEventListener('visibilitychange', () => { lastFrame = 0; });
  window.__MUSEUM_ONBOARDING = Object.freeze({
    attach, ready, fail, replay: start, skip: () => stop(true),
    stats: () => ({ active, ready: mapReady, elapsedMs: Math.round(elapsed), step: stepIndex, durationMs: TOTAL_MS })
  });
  if (forced || (!navigator.webdriver && !deepLink && !seen() && query.get('tour') !== '0')) start();
})();