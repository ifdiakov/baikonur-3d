(function () {
  'use strict';

  var root = document.getElementById('museumLoading');
  if (!root) return;

  // A cinematic launch sequence accompanies loading. Its clock never changes
  // real scene progress or readiness, and never delays an already ready museum.
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
  var completed = 0;
  var totalStages = 9;
  var manuallyPaused = false;
  var failed = false;
  var finishing = false;
  var destroyed = false;
  var timer = null;
  var statusAnimation = null;
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

  function cancelStatusAnimation() {
    if (statusAnimation) statusAnimation.cancel();
    statusAnimation = null;
  }

  function motionPaused() {
    return manuallyPaused || motion.matches || document.hidden || failed || destroyed;
  }

  function syncMotion() {
    var paused = motionPaused();
    root.classList.toggle('is-paused', paused);
    root.classList.toggle('is-reduced', Boolean(motion.matches));
    root.dataset.motion = paused ? 'paused' : 'running';
    if (paused) cancelStatusAnimation();
    if (!toggle) return;
    toggle.disabled = failed || finishing || destroyed || motion.matches;
    toggle.setAttribute('aria-pressed', String(paused));
    var label = failed || destroyed ? 'Анимация остановлена' : motion.matches ? 'Анимация отключена' :
      manuallyPaused ? 'Продолжить анимацию' : 'Пауза анимации';
    toggle.setAttribute('aria-label', label);
    toggle.title = motion.matches ? 'В системе включено сокращение анимации' : label;
    text('museumMotionLabel', label);
  }

  function showLaunchStep(index, animate) {
    launchStep = Math.max(0, Math.min(launchStatuses.length - 1, index));
    root.dataset.launchStep = String(launchStep);
    if (status) status.textContent = launchStatuses[launchStep];
    text('museumLaunchStep', String(launchStep + 1).padStart(2, '0') + ' / ' + String(launchStatuses.length).padStart(2, '0'));
    cancelStatusAnimation();
    if (animate && !motionPaused() && status && typeof status.animate === 'function') {
      statusAnimation = status.animate([
        { opacity: 0, transform: 'translateY(7px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
  }

  function scheduleCycle() {
    stopCycle();
    if (motionPaused() || finishing) return;
    // Production waits at «ключ на старт». Ignition belongs to the first real
    // rendered frame. The explicitly labelled preview can replay all phrases.
    if (!preview && launchStep >= launchStatuses.length - 2) return;
    timer = window.setTimeout(function () {
      timer = null;
      if (motionPaused() || finishing) return;
      var next = launchStep + 1;
      if (next >= launchStatuses.length) next = 0;
      showLaunchStep(next, true);
      scheduleCycle();
    }, preview && launchStep === launchStatuses.length - 1 ? 3300 : 2200);
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
  }

  function fail() {
    if (destroyed || finishing || failed) return;
    failed = true;
    stopCycle();
    root.classList.add('has-error');
    root.classList.remove('is-slow');
    syncMotion();
  }

  function slow() {
    if (destroyed || finishing || failed) return;
    root.classList.add('is-slow');
  }

  function finish() {
    if (destroyed || finishing || failed) return;
    finishing = true;
    stopCycle();
    showLaunchStep(launchStatuses.length - 1, false);
    completed = totalStages;
    paintProgress();
    root.classList.remove('is-slow');
    root.classList.add('is-leaving');
    syncMotion();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopCycle();
    cancelStatusAnimation();
    root.classList.add('is-stopped');
    syncMotion();
    listeners.forEach(function (remove) { remove(); });
    listeners.length = 0;
  }

  function refreshMotion() {
    syncMotion();
    scheduleCycle();
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

  window.__MUSEUM_PRELOADER = Object.freeze({ stage: stage, fail: fail, slow: slow, finish: finish, destroy: destroy });
  showLaunchStep(0, false);
  stage(0, totalStages);
  refreshMotion();
})();
