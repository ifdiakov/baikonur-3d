(function () {
  'use strict';

  var root = document.getElementById('museumLoading');
  if (!root) return;

  // Production follows real first-screen progress. Consecutive phrases use the
  // browser's existing paint opportunities; there is no minimum loading time.
  var launchStatuses = [
    'ВЫБОР МЕСТА ДЛЯ СТРОИТЕЛЬСТВА КОСМОДРОМА',
    'РАЗМЕТКА МЕСТНОСТИ',
    'ЗАГРУЗКА СТАРТОВЫХ КОМПЛЕКСОВ',
    'СТРОИТЕЛЬСТВО ИНФРАСТРУКТУРЫ',
    'ПРОКЛАДКА Ж/Д ПУТЕЙ',
    'ОРГАНИЗАЦИЯ ЭНЕРГОСНАБЖЕНИЯ',
    'ДОСТАВКА СРЕДСТВ ВЫВЕДЕНИЯ',
    'ОГНЕВЫЕ ИСПЫТАНИЯ',
    'НАСТРОЙКА ТЕЛЕМЕТРИИ',
    'ЗАГРУЗКА ЦИКЛОГРАММ',
    'РАСЧЁТ ТРАЕКТОРИЙ И ЦЕЛЕВЫХ ОРБИТ',
    'ЗАСЕДАНИЕ ГОСКОМИССИИ',
    'ВЫВОЗ И ВЕРТИКАЛИЗАЦИЯ',
    'КОНТРОЛЬНЫЕ МЕРОПРИЯТИЯ',
    'ПОДЪЁМ БОКОВЫХ ПНЕВМОКОЛОНН',
    'ЗАПРАВКА КОМПОНЕНТАМИ ТОПЛИВА',
    'КЛЮЧ НА ДРЕНАЖ',
    'ПРОДУВКА',
    'КЛЮЧ НА СТАРТ',
    'ЗАЖИГАНИЕ/КИСЛОРОД!'
  ];
  var byId = function (id) { return document.getElementById(id); };
  var status = byId('museumLaunchStatus');
  var progress = byId('museumStageProgress');
  var fill = byId('museumProgressFill');
  var toggle = byId('museumMotionToggle');
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var preview = root.dataset.preview === 'true';
  var launchStep = 0;
  var targetStep = 0;
  var completed = 0;
  var totalStages = 9;
  var manuallyPaused = false;
  var failed = false;
  var finishing = false;
  var destroyed = false;
  var timer = null;
  var frame = null;
  var frameFallback = null;
  var exitDeadline = 0;
  var exitTimer = null;
  var onExit = null;
  var listeners = [];

  function listen(target, type, handler) {
    if (!target) return;
    target.addEventListener(type, handler);
    listeners.push(function () { target.removeEventListener(type, handler); });
  }

  function text(id, value) {
    var element = byId(id);
    if (element) element.textContent = value;
  }

  function stopCycle() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  }

  function stopAdvance() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    if (frameFallback !== null) window.clearTimeout(frameFallback);
    frame = null;
    frameFallback = null;
  }

  function motionPaused() {
    return manuallyPaused || motion.matches || document.hidden || failed || destroyed;
  }

  function syncMotion() {
    var paused = motionPaused();
    root.classList.toggle('is-paused', paused);
    root.classList.toggle('is-reduced', Boolean(motion.matches));
    root.dataset.motion = paused ? 'paused' : 'running';
    if (!toggle) return;
    toggle.disabled = failed || finishing || destroyed || motion.matches;
    toggle.setAttribute('aria-pressed', String(paused));
    var label = failed || destroyed ? 'Анимация остановлена' : motion.matches ? 'Анимация отключена' :
      manuallyPaused ? 'Продолжить анимацию' : 'Пауза анимации';
    toggle.setAttribute('aria-label', label);
    toggle.title = motion.matches ? 'В системе включено сокращение анимации' : label;
    text('museumMotionLabel', label);
  }

  function showLaunchStep(index) {
    launchStep = Math.max(0, Math.min(launchStatuses.length - 1, index));
    root.dataset.launchStep = String(launchStep);
    if (status) status.textContent = launchStatuses[launchStep];
    text('museumLaunchStep', String(launchStep + 1).padStart(2, '0') + ' / ' + String(launchStatuses.length).padStart(2, '0'));
    // Fast progress may change the phrase each frame. Fading every new string
    // in from opacity zero would keep the whole sequence invisible.
  }

  function beginExit() {
    if (!finishing || launchStep < launchStatuses.length - 1 || root.classList.contains('is-leaving')) return;
    // Use the remainder of the existing startup transition, never another
    // timed story after the first real frame has already become available.
    var duration = Math.min(100, Math.max(0, exitDeadline - performance.now()));
    root.style.transitionDuration = duration + 'ms';
    root.classList.add('is-leaving');
    if (onExit) exitTimer = window.setTimeout(function () {
      exitTimer = null;
      var reveal = onExit;
      onExit = null;
      if (reveal) reveal();
    }, duration);
  }

  function flushAdvance() {
    stopAdvance();
    if (failed || destroyed) return;
    while (launchStep < targetStep) showLaunchStep(launchStep + 1);
    beginExit();
  }

  function scheduleAdvance() {
    if (failed || destroyed || preview || frame !== null) return;
    if (document.hidden) { flushAdvance(); return; }
    if (launchStep >= targetStep) { beginExit(); return; }
    var advance = function () {
      stopAdvance();
      if (failed || destroyed) return;
      if (launchStep < targetStep) showLaunchStep(launchStep + 1);
      scheduleAdvance();
    };
    frame = window.requestAnimationFrame(advance);
    // Keep up with real progress even when rAF is throttled. This is a frame
    // fallback for already completed work, never an independent story clock.
    frameFallback = window.setTimeout(advance, 16);
  }

  function schedulePreview() {
    stopCycle();
    if (!preview || motionPaused() || finishing) return;
    // Only the explicitly labelled standalone preview owns a demo clock.
    // Production consumes actual stage updates instead of this timer.
    timer = window.setTimeout(function () {
      timer = null;
      if (motionPaused() || finishing) return;
      var next = launchStep + 1;
      if (next >= launchStatuses.length) next = 0;
      showLaunchStep(next);
      schedulePreview();
    }, launchStep === 0 ? 950 : launchStep === launchStatuses.length - 1 ? 650 : 500);
  }

  function paintProgress() {
    if (fill) fill.style.transform = 'scaleX(' + (completed / totalStages) + ')';
    if (!progress) return;
    progress.setAttribute('aria-valuemax', String(totalStages));
    progress.setAttribute('aria-valuenow', String(completed));
    progress.setAttribute('aria-valuetext', finishing ? 'Музей готов' :
      'Выполнено ' + completed + ' из ' + totalStages + ' этапов подготовки музея');
  }

  function stage(index, total) {
    if (destroyed || finishing || failed) return;
    total = Number(total);
    index = Number(index);
    totalStages = Number.isFinite(total) && total > 0 ? Math.min(30, Math.floor(total)) : totalStages;
    index = Number.isFinite(index) ? Math.min(totalStages, Math.max(0, Math.floor(index))) : 0;
    // stage() announces an operation's START. Only preceding operations have
    // completed; the final fraction is earned exclusively by finish().
    completed = Math.min(totalStages - 1, Math.max(completed, index - 1, 0));
    root.dataset.loadStage = String(index);
    paintProgress();
    if (!preview) {
      targetStep = Math.max(targetStep, Math.floor(completed / Math.max(1, totalStages - 1) * (launchStatuses.length - 2)));
      scheduleAdvance();
    }
  }

  function fail() {
    if (destroyed || finishing || failed) return;
    failed = true;
    stopCycle();
    stopAdvance();
    root.classList.add('has-error');
    root.classList.remove('is-slow');
    syncMotion();
  }

  function slow() {
    if (destroyed || finishing || failed) return;
    root.classList.add('is-slow');
  }

  function finish(reveal) {
    if (destroyed || finishing || failed) return;
    finishing = true;
    stopCycle();
    exitDeadline = performance.now() + 460;
    onExit = typeof reveal === 'function' ? reveal : null;
    targetStep = launchStatuses.length - 1;
    completed = totalStages;
    paintProgress();
    root.classList.remove('is-slow');
    syncMotion();
    scheduleAdvance();
  }

  function complete() {
    if (destroyed || failed || !finishing) return;
    // Startup owns the reveal deadline. Hidden/reduced-motion views and a very
    // slow renderer must open immediately, rather than wait to replay a backlog.
    if (exitTimer !== null) window.clearTimeout(exitTimer);
    exitTimer = null;
    onExit = null;
    flushAdvance();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopCycle();
    stopAdvance();
    if (exitTimer !== null) window.clearTimeout(exitTimer);
    exitTimer = null;
    onExit = null;
    root.classList.add('is-stopped');
    syncMotion();
    listeners.forEach(function (remove) { remove(); });
    listeners.length = 0;
  }

  function refreshMotion() {
    syncMotion();
    if (preview) schedulePreview();
    else {
      if (document.hidden) flushAdvance();
      else scheduleAdvance();
    }
  }

  listen(toggle, 'click', function () {
    if (destroyed || finishing || failed || motion.matches) return;
    manuallyPaused = !manuallyPaused;
    refreshMotion();
  });
  listen(document, 'visibilitychange', refreshMotion);
  if (motion.addEventListener) {
    listen(motion, 'change', refreshMotion);
  } else if (motion.addListener) {
    motion.addListener(refreshMotion);
    listeners.push(function () { motion.removeListener(refreshMotion); });
  }

  window.__MUSEUM_PRELOADER = Object.freeze({ stage: stage, fail: fail, slow: slow, finish: finish, complete: complete, destroy: destroy });
  showLaunchStep(0);
  stage(0, totalStages);
  refreshMotion();
})();
