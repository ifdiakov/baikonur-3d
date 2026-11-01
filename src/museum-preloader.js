(function () {
  'use strict';

  var root = document.getElementById('museumLoading');
  if (!root) return;

  var stories = [
    {
      year: '1957', date: '04 ОКТЯБРЯ', title: 'Первый сигнал',
      text: 'С Гагаринского старта на орбиту отправился первый искусственный спутник Земли. Космическая эра началась здесь.'
    },
    {
      year: '1961', date: '12 АПРЕЛЯ', title: 'Первый человек',
      text: 'Юрий Гагарин отправился в космос с площадки № 1. Здесь началась история пилотируемой космонавтики.'
    },
    {
      year: '1988', date: '15 НОЯБРЯ', title: 'Возвращение «Бурана»',
      text: '«Энергия» подняла «Буран» с площадки № 110. После орбитального полёта корабль вернулся на Байконур и сел автоматически.'
    }
  ];
  var byId = function (id) { return document.getElementById(id); };
  var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-preloader-story]'));
  var controls = root.querySelector('.preloader__story-controls');
  var gagarin = byId('museumMapGagarin');
  var buran = byId('museumMapBuran');
  var progress = byId('museumStageProgress');
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var selected = 0;
  var manuallySelected = false;
  var failed = false;
  var finishing = false;
  var destroyed = false;
  var timer = null;
  var listeners = [];
  var totalStages = 9;

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

  function scheduleCycle() {
    stopCycle();
    if (destroyed || finishing || failed || manuallySelected || motion.matches || document.hidden) return;
    timer = window.setTimeout(function () {
      timer = null;
      showStory(selected + 1, false);
    }, 8000);
  }

  function showStory(index, manual) {
    if (destroyed || finishing) return;
    if (manual) {
      manuallySelected = true;
      stopCycle();
    }
    selected = ((index % stories.length) + stories.length) % stories.length;
    var story = stories[selected];
    root.dataset.story = String(selected);
    text('museumStoryYear', story.year);
    text('museumStoryDate', story.date);
    text('museumStoryTitle', story.title);
    text('museumStoryText', story.text);
    text('museumStoryCounter', String(selected + 1).padStart(2, '0') + ' / 03');
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.preloaderStory) === selected));
    });
    if (gagarin) {
      gagarin.classList.toggle('is-active', selected < 2);
      gagarin.setAttribute('aria-pressed', String(selected < 2));
    }
    if (buran) {
      buran.classList.toggle('is-active', selected === 2);
      buran.setAttribute('aria-pressed', String(selected === 2));
    }
    scheduleCycle();
  }

  function stage(index, total) {
    if (destroyed || finishing || failed) return;
    total = Number(total);
    index = Number(index);
    totalStages = Number.isFinite(total) && total > 0 ? Math.min(30, Math.floor(total)) : totalStages;
    index = Number.isFinite(index) ? Math.min(totalStages, Math.max(0, Math.floor(index))) : 0;
    text('museumStageCurrent', String(index).padStart(2, '0'));
    text('museumStageTotal', String(totalStages).padStart(2, '0'));
    if (!progress) return;
    if (progress.children.length !== totalStages) {
      var fragment = document.createDocumentFragment();
      for (var i = 0; i < totalStages; i++) fragment.appendChild(document.createElement('span'));
      progress.replaceChildren(fragment);
    }
    Array.prototype.forEach.call(progress.children, function (segment, position) {
      segment.classList.toggle('is-complete', position < Math.max(0, index - 1));
      segment.classList.toggle('is-current', position === Math.max(0, index - 1));
    });
    progress.setAttribute('aria-valuemax', String(totalStages));
    progress.setAttribute('aria-valuenow', String(index));
    progress.setAttribute('aria-valuetext', index === 0 ? 'Подготовка запуска' : 'Текущий этап ' + index + ' из ' + totalStages);
  }

  function fail() {
    if (destroyed || finishing) return;
    failed = true;
    stopCycle();
    root.classList.add('has-error');
    text('museumPreloaderState', 'НУЖНО ПОВТОРИТЬ ЗАГРУЗКУ');
    text('museumPreloaderIntro', 'Не удалось подготовить космодром.');
    text('museumPreloaderHint', 'Истории космодрома остаются доступны');
  }

  function slow() {
    if (destroyed || finishing || failed) return;
    text('museumPreloaderState', 'ЗАГРУЗКА ПРОДОЛЖАЕТСЯ');
    text('museumPreloaderHint', 'Пока можно полистать истории космодрома');
  }

  function finish() {
    if (destroyed || finishing) return;
    finishing = true;
    stopCycle();
    text('museumStageCurrent', String(totalStages).padStart(2, '0'));
    if (progress) {
      Array.prototype.forEach.call(progress.children, function (segment) {
        segment.classList.add('is-complete');
        segment.classList.remove('is-current');
      });
      progress.setAttribute('aria-valuenow', String(totalStages));
      progress.setAttribute('aria-valuetext', 'Музей готов');
    }
    root.classList.add('is-leaving');
    text('museumPreloaderState', 'КОСМОДРОМ ГОТОВ');
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopCycle();
    root.classList.add('is-stopped');
    listeners.forEach(function (remove) { remove(); });
    listeners.length = 0;
  }

  function onVisibility() {
    root.classList.toggle('is-paused', document.hidden);
    scheduleCycle();
  }

  function onMotion() {
    scheduleCycle();
  }

  buttons.forEach(function (button) {
    listen(button, 'click', function () { showStory(Number(button.dataset.preloaderStory), true); });
  });
  listen(byId('museumStoryPrev'), 'click', function () { showStory(selected - 1, true); });
  listen(byId('museumStoryNext'), 'click', function () { showStory(selected + 1, true); });
  listen(gagarin, 'click', function () { showStory(selected === 0 ? 1 : 0, true); });
  listen(buran, 'click', function () { showStory(2, true); });
  listen(controls, 'keydown', function (event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      var next = event.key === 'Home' ? 0 : event.key === 'End' ? stories.length - 1 : selected + (event.key === 'ArrowRight' ? 1 : -1);
      showStory(next, true);
      var active = buttons[selected];
      if (active) active.focus();
    }
  });
  listen(root, 'focusin', function () { manuallySelected = true; stopCycle(); });
  listen(document, 'visibilitychange', onVisibility);
  if (motion.addEventListener) {
    listen(motion, 'change', onMotion);
  } else if (motion.addListener) {
    motion.addListener(onMotion);
    listeners.push(function () { motion.removeListener(onMotion); });
  }

  window.__MUSEUM_PRELOADER = Object.freeze({ stage: stage, fail: fail, slow: slow, finish: finish, destroy: destroy });
  onVisibility();
})();
