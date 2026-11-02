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
  var phrases = Array.prototype.slice.call(root.querySelectorAll('#museumFeatureSlides .preloader__phrase'));
  var images = Array.prototype.slice.call(root.querySelectorAll('#museumPreloaderGallery .preloader__image'));
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  // Use the change event to update the preference. Reading MQL.matches on
  // every animation frame can consume Chromium's pending change notification.
  var reducedMotion = Boolean(motion.matches);
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
  var featureIndex = 0;
  var imageCursor = 0;
  var presentationTick = 0;
  var presentationTimer = null;
  var pendingImage = null;
  var activeStage = 0;
  var stageStartedAt = performance.now();
  var visualProgress = 0;
  var progressFrame = null;
  var progressLastTime = 0;
  var progressFinishFrom = 0;
  var progressFinishStartedAt = 0;
  var progressFinishDuration = 100;
  var demoStepStartedAt = performance.now();
  var demoStepFrom = 0;
  var demoStepDuration = 950;
  var demoPercent = -1;

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
    return manuallyPaused || reducedMotion || document.hidden || failed || destroyed;
  }

  function showFeature(index) {
    if (!phrases.length) return;
    featureIndex = index;
    phrases.forEach(function (phrase, position) {
      var active = position === index;
      phrase.classList.toggle('is-active', active);
      phrase.setAttribute('aria-hidden', String(!active));
    });
  }

  function showImage(index) {
    images.forEach(function (image, position) {
      image.classList.toggle('is-active', position === index);
    });
  }

  function stopPresentation() {
    if (presentationTimer !== null) window.clearTimeout(presentationTimer);
    presentationTimer = null;
    if (pendingImage) {
      var pending = pendingImage;
      pendingImage = null;
      pending.cleanup();
      // Removing an inactive source lets the browser abandon a decorative
      // request. A late decode promise cannot change the visible slide.
      pending.image.removeAttribute('src');
    }
  }

  function advanceImage() {
    if (images.length < 2 || pendingImage || motionPaused() || finishing) return;
    imageCursor = (imageCursor + 1) % images.length;
    var index = imageCursor;
    var image = images[index];
    if (image.complete && image.naturalWidth > 0) {
      showImage(index);
      return;
    }
    var source = image.dataset.src || image.getAttribute('src');
    if (!source) return;
    if (!image.dataset.src) image.dataset.src = source;
    var pending = { image: image, cleanup: cleanup };
    pendingImage = pending;
    function cleanup() {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failedImage);
    }
    function ready() {
      if (pendingImage !== pending) return;
      pendingImage = null;
      cleanup();
      if (!motionPaused() && !finishing && image.naturalWidth > 0) showImage(index);
    }
    function failedImage() {
      if (pendingImage !== pending) return;
      pendingImage = null;
      cleanup();
      image.removeAttribute('src');
      // Keep the last successful picture; the next tick tries another image.
    }
    function loaded() {
      cleanup();
      if (typeof image.decode === 'function') image.decode().then(ready, failedImage);
      else ready();
    }
    image.addEventListener('load', loaded);
    image.addEventListener('error', failedImage);
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.src = source;
  }

  function schedulePresentation() {
    if (presentationTimer !== null) window.clearTimeout(presentationTimer);
    presentationTimer = null;
    if (motionPaused() || finishing || (!phrases.length && !images.length)) return;
    // This is decoration only: neither its clock nor an image download is
    // included in the museum's real progress or its reveal deadline.
    presentationTimer = window.setTimeout(function () {
      presentationTimer = null;
      if (motionPaused() || finishing) return;
      presentationTick += 1;
      // Text and images use independent cadences: copy every 4 seconds,
      // gallery artwork every 5 seconds.
      if (phrases.length && presentationTick % 4 === 0) showFeature((featureIndex + 1) % phrases.length);
      if (presentationTick % 5 === 0) advanceImage();
      schedulePresentation();
    }, 1000);
  }

  function syncMotion() {
    var paused = motionPaused();
    root.classList.toggle('is-paused', paused);
    root.classList.toggle('is-reduced', reducedMotion);
    root.dataset.motion = paused ? 'paused' : 'running';
    if (!toggle) return;
    toggle.disabled = failed || finishing || destroyed || reducedMotion;
    toggle.setAttribute('aria-pressed', String(paused));
    var label = failed || destroyed ? 'Анимация остановлена' : reducedMotion ? 'Анимация отключена' :
      manuallyPaused ? 'Продолжить анимацию' : 'Пауза анимации';
    toggle.setAttribute('aria-label', label);
    toggle.title = reducedMotion ? 'В системе включено сокращение анимации' : label;
    text('museumMotionLabel', label);
  }

  function showLaunchStep(index) {
    launchStep = Math.max(0, Math.min(launchStatuses.length - 1, index));
    root.dataset.launchStep = String(launchStep);
    if (status) status.textContent = launchStatuses[launchStep];
    text('museumLaunchStep', String(launchStep + 1).padStart(2, '0') + ' / ' + String(launchStatuses.length).padStart(2, '0'));
    if (preview && launchStep === 0) writeProgress(0);
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
    demoStepDuration = launchStep === 0 ? 950 : launchStep === launchStatuses.length - 1 ? 650 : 500;
    demoStepStartedAt = performance.now();
    demoStepFrom = visualProgress;
    timer = window.setTimeout(function () {
      timer = null;
      if (motionPaused() || finishing) return;
      var next = launchStep + 1;
      if (next >= launchStatuses.length) next = 0;
      showLaunchStep(next);
      schedulePreview();
    }, demoStepDuration);
  }

  function writeProgress(value) {
    visualProgress = Math.max(0, Math.min(1, value));
    if (fill) fill.style.transform = 'scaleX(' + Math.round(visualProgress * 1000000) / 1000000 + ')';
    if (preview && progress) {
      var percent = Math.round(visualProgress * 100);
      if (percent !== demoPercent) {
        demoPercent = percent;
        progress.setAttribute('aria-label', 'Демонстрация загрузки');
        progress.setAttribute('aria-valuemax', '100');
        progress.setAttribute('aria-valuenow', String(percent));
        progress.setAttribute('aria-valuetext', 'Демонстрация загрузки: ' + percent + '%');
      }
    }
  }

  function stopProgress() {
    if (progressFrame !== null) window.cancelAnimationFrame(progressFrame);
    progressFrame = null;
    progressLastTime = 0;
  }

  function canAnimateProgress() {
    return fill && !failed && !destroyed && !reducedMotion &&
      !document.hidden && !root.hidden &&
      (finishing || (preview ? !manuallyPaused : activeStage > 0));
  }

  function animateProgress(now) {
    progressFrame = null;
    if (!canAnimateProgress()) { stopProgress(); return; }
    if (finishing) {
      var fraction = progressFinishDuration > 0 ? Math.min(1, Math.max(0,
        (now - progressFinishStartedAt) / progressFinishDuration)) : 1;
      var eased = 1 - Math.pow(1 - fraction, 3);
      writeProgress(Math.max(visualProgress, progressFinishFrom + (1 - progressFinishFrom) * eased));
      if (fraction >= 1) { stopProgress(); return; }
    } else if (preview) {
      // A labelled demo follows only the standalone status clock. Its weighted
      // segments keep an even speed across the longer first and last statuses.
      var cycleDuration = 950 + (launchStatuses.length - 2) * 500 + 650;
      var segmentEnd = launchStep === launchStatuses.length - 1 ? 1 : (950 + launchStep * 500) / cycleDuration;
      var demoFraction = Math.min(1, Math.max(0, (now - demoStepStartedAt) / demoStepDuration));
      writeProgress(Math.max(visualProgress, demoStepFrom + (segmentEnd - demoStepFrom) * demoFraction));
    } else {
      var elapsed = Math.max(0, now - stageStartedAt);
      // Real stage boundaries are discrete. Between them, approach only 90%
      // of the CURRENT unfinished stage, never the next unconfirmed boundary.
      // This estimate is decorative; ARIA and startup retain the real counts.
      var withinStage = .9 * (1 - Math.exp(-elapsed / 4000));
      var target = Math.min((completed + withinStage) / totalStages, (totalStages - .1) / totalStages);
      var delta = Math.min(64, Math.max(0, now - progressLastTime));
      var next = visualProgress + Math.max(0, target - visualProgress) * (1 - Math.exp(-delta / 140));
      writeProgress(Math.max(visualProgress, next));
    }
    progressLastTime = now;
    progressFrame = window.requestAnimationFrame(animateProgress);
  }

  function syncProgress() {
    if (failed || destroyed) { stopProgress(); return; }
    if (!canAnimateProgress()) {
      stopProgress();
      // No animation for reduced motion or a background tab. Preserve an
      // already displayed fraction when preferences change; never rewind.
      writeProgress(Math.max(visualProgress, completed / totalStages));
      return;
    }
    if (progressFrame === null) {
      progressLastTime = performance.now();
      progressFrame = window.requestAnimationFrame(animateProgress);
    }
  }

  function paintProgress() {
    syncProgress();
    if (!progress || preview) return;
    progress.setAttribute('aria-valuemax', String(totalStages));
    progress.setAttribute('aria-valuenow', String(completed));
    progress.setAttribute('aria-valuetext', finishing ? 'Музей готов' :
      'Выполнено ' + completed + ' из ' + totalStages + ' этапов подготовки музея');
  }

  function stage(index, total) {
    if (destroyed || finishing || failed) return;
    total = Number(total);
    index = Number(index);
    var previousCompleted = completed;
    var previousTotal = totalStages;
    totalStages = Number.isFinite(total) && total > 0 ? Math.min(30, Math.floor(total)) : totalStages;
    index = Number.isFinite(index) ? Math.min(totalStages, Math.max(0, Math.floor(index))) : 0;
    // stage() announces an operation's START. Only preceding operations have
    // completed; the final fraction is earned exclusively by finish().
    completed = Math.min(totalStages - 1, Math.max(completed, index - 1, 0));
    if (index > activeStage || completed !== previousCompleted || totalStages !== previousTotal) {
      stageStartedAt = performance.now();
    }
    activeStage = Math.max(activeStage, index);
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
    stopPresentation();
    stopProgress();
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
    stopPresentation();
    if (!reducedMotion) showFeature(phrases.length - 1);
    exitDeadline = performance.now() + 460;
    progressFinishFrom = visualProgress;
    progressFinishStartedAt = performance.now();
    progressFinishDuration = Math.min(100, Math.max(0, exitDeadline - progressFinishStartedAt));
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
    stopProgress();
    writeProgress(1);
    flushAdvance();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopCycle();
    stopAdvance();
    stopPresentation();
    stopProgress();
    if (exitTimer !== null) window.clearTimeout(exitTimer);
    exitTimer = null;
    onExit = null;
    root.classList.add('is-stopped');
    syncMotion();
    listeners.forEach(function (remove) { remove(); });
    listeners.length = 0;
  }

  function refreshMotion() {
    reducedMotion = Boolean(motion.matches);
    syncMotion();
    syncProgress();
    if (motionPaused() || finishing) stopPresentation();
    else schedulePresentation();
    if (reducedMotion) {
      showFeature(0);
      showImage(0);
      imageCursor = 0;
      presentationTick = 0;
    }
    if (preview) schedulePreview();
    else {
      if (document.hidden) flushAdvance();
      else scheduleAdvance();
    }
  }

  listen(toggle, 'click', function () {
    if (destroyed || finishing || failed || reducedMotion) return;
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
