(function () {
  'use strict';

  var finished = false;
  var failed = false;
  var step = 0;
  var totalSteps = 9;
  var interactive = false;
  var jobs = [];
  var activeJobs = 0;
  var jobSequence = 0;
  var pumpScheduled = false;
  var jobHistory = [];
  var marks = [];
  var prefetchedJSON = new Map();
  var connection = navigator.connection;
  var concurrency = connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType)) ? 1 : 2;
  function mark(name) {
    var time = performance.now();
    marks.push({ name: name, at: time });
    if (performance.mark) performance.mark('museum:' + name);
    return time;
  }
  mark('startup');
  var controls = ['museumLeftStack', 'museumRightStack', 'labelLayer', 'timeDock', 'hero'];
  var element = function (id) { return document.getElementById(id); };
  var setMessage = function (text) {
    var message = element('museumLoadingMessage');
    if (message) message.textContent = String(text);
  };
  var showRetry = function () {
    var retry = element('museumRetry');
    if (retry) retry.hidden = false;
  };

  function preloader(method) {
    var view = window.__MUSEUM_PRELOADER;
    if (view && typeof view[method] === 'function') {
      // The introduction is optional presentation. A visual enhancement must
      // never keep a successfully rendered museum behind its loading screen.
      try { view[method].apply(view, Array.prototype.slice.call(arguments, 1)); }
      catch (error) { console.warn('Museum introduction:', error); }
    }
  }

  function stage(text, index) {
    if (finished || failed) return;
    setMessage(text);
    if (Number.isInteger(index) && index >= 0 && index <= totalSteps) {
      if (index > step) mark('stage-' + index);
      step = Math.max(step, index);
      preloader('stage', step, totalSteps);
    }
  }

  // Give the browser an opportunity to paint the status and handle a visitor's
  // interaction before the next synchronous geometry batch. Background tabs
  // must still start even when animation frames are suspended.
  function paint() {
    return new Promise(function (resolve) {
      var frame;
      var fallback = setTimeout(function () {
        if (frame) cancelAnimationFrame(frame);
        resolve();
      }, 120);
      frame = requestAnimationFrame(function () {
        clearTimeout(fallback);
        setTimeout(resolve, 0);
      });
    });
  }

  // Start optional network/decoding work only after the actual map has been
  // painted and revealed. A bounded queue leaves bandwidth and event-loop
  // turns for navigation; choosing a site can promote its pending assets.
  function pump() {
    if (!interactive || pumpScheduled || activeJobs >= concurrency || !jobs.length) return;
    pumpScheduled = true;
    var run = function () {
      pumpScheduled = false;
      if (!interactive || activeJobs >= concurrency || !jobs.length) return;
      jobs.sort(function (a, b) { return b.priority - a.priority || a.order - b.order; });
      var job = jobs.shift();
      activeJobs++;
      job.record.state = 'loading';
      job.record.startedAt = performance.now();
      Promise.resolve().then(job.task).then(function (value) {
        job.record.state = 'ready';
        job.resolve(value);
      }, function (error) {
        job.record.state = 'error';
        job.record.error = String(error && error.message || error);
        job.reject(error);
      }).finally(function () {
        job.record.finishedAt = performance.now();
        activeJobs--;
        pump();
      });
      pump();
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 300 });
    else setTimeout(run, 16);
  }

  function defer(task, options) {
    options = options || {};
    var record = { key: options.key || 'task-' + jobSequence, state: 'queued', queuedAt: performance.now() };
    jobHistory.push(record);
    return new Promise(function (resolve, reject) {
      jobs.push({ task: task, resolve: resolve, reject: reject, record: record,
        key: record.key, priority: options.priority || 0, order: jobSequence++ });
      pump();
    });
  }

  function promote(key, priority) {
    jobs.forEach(function (job) {
      if (job.key === key) job.priority = Math.max(job.priority, priority == null ? 100 : priority);
    });
    pump();
  }

  function stats() {
    return { interactive: interactive, active: activeJobs, queued: jobs.length, concurrency: concurrency,
      marks: marks.map(function (entry) { return Object.assign({}, entry); }),
      tasks: jobHistory.map(function (entry) { return Object.assign({}, entry); }) };
  }

  function ready() {
    if (finished || failed) return;
    finished = true;
    mark('first-frame');
    clearTimeout(watchdog);
    var loading = element('museumLoading');
    var focusWasInside = loading && loading.contains(document.activeElement);
    var revealed = false;
    var revealTimer = null;
    function reveal() {
      if (revealed) return;
      revealed = true;
      if (revealTimer !== null) clearTimeout(revealTimer);
      // All pending status updates share the existing exit window. The status
      // sequence must never add a second wait to an already rendered map.
      preloader('complete');
      if (loading) { loading.hidden = true; loading.dataset.state = 'ready'; }
      controls.forEach(function (id) {
        var control = element(id);
        if (control) {
          control.inert = false;
          control.removeAttribute('inert');
        }
      });
      document.body.classList.add('museum-ready');
      mark('interactive');
      preloader('destroy');
      // Trigger the camera-led tour only once the loader is GONE and the
      // actual interactive scene has received its own rendered frame.
      // Optional heavy assets still start in the same background queue.
      paint().then(function () {
        interactive = true;
        pump();
        if (window.__MUSEUM_ONBOARDING) window.__MUSEUM_ONBOARDING.ready();
      });
      if (focusWasInside) {
        var target = document.querySelector('#sitesAccordion > summary');
        // A collapsed mobile menu is not a valid focus destination.
        if (target && target.getClientRects().length && getComputedStyle(target).visibility !== 'hidden') {
          target.focus({ preventScroll: true });
        } else {
          var view = element('view');
          if (view) { view.tabIndex = -1; view.focus({ preventScroll: true }); }
        }
      }
    }
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
    setMessage('Космодром готов. Отправляемся…');
    preloader('stage', totalSteps, totalSteps);
    preloader('finish', reveal);
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!loading || !window.__MUSEUM_PRELOADER || reduced || document.hidden || loading.dataset.motion === 'paused') reveal();
    else if (!revealed) revealTimer = setTimeout(reveal, 460);
  }

  function fail(error) {
    if (finished || failed) return;
    failed = true;
    clearTimeout(watchdog);
    var loading = element('museumLoading');
    if (loading) { loading.hidden = false; loading.dataset.state = 'error'; }
    var message = 'Не удалось загрузить музей. Проверьте соединение и повторите попытку.';
    if (error && error.name === 'TimeoutError') message += ' Сервер не ответил вовремя.';
    setMessage(message);
    showRetry();
    if (window.__MUSEUM_ONBOARDING) window.__MUSEUM_ONBOARDING.fail();
    preloader('fail');
  }

  function fetchJSON(path, options) {
    var key = new URL(path, location.href).href;
    if (!options && prefetchedJSON.has(key)) return prefetchedJSON.get(key);
    return requestJSON(path, options);
  }

  async function requestJSON(path, options) {
    options = options || {};
    var timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs >= 0 ? options.timeoutMs : 15000;
    var controller = new AbortController();
    var timeoutError = new Error('Сервер не ответил вовремя.');
    timeoutError.name = 'TimeoutError';
    var timer;
    var deadline = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        controller.abort();
        reject(timeoutError);
      }, timeoutMs);
    });
    var request = (async function () {
      // Versioned assets can reuse a fresh HTTP cache entry. Mutable datasets
      // revalidate with ETags, avoiding a full download when unchanged.
      var cache = options.cache || (/[?&]v=/.test(String(path)) ? 'default' : 'no-cache');
      var response = await fetch(path, { cache: cache, signal: controller.signal, priority: options.priority || 'auto' });
      if (!response.ok) {
        if (options.optional) return null;
        throw new Error('Не удалось загрузить данные музея (HTTP ' + response.status + ').');
      }
      return await response.json();
    })();
    try {
      // The deadline includes the response body and remains bounded even if a
      // network wrapper does not settle its promise after receiving an abort.
      return await Promise.race([request, deadline]);
    } catch (error) {
      // Missing history/research entries must not prevent the map from opening.
      // Required geographic data still fails visibly and offers a retry.
      if (options.optional) return null;
      if (controller.signal.aborted) throw timeoutError;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function onError(event) {
    if (finished) return;
    // Failed photos, fonts, and styles must not stop an otherwise usable scene.
    // A failed script resource does prevent startup and needs the retry UI.
    if (event.target && event.target !== window && event.target.tagName !== 'SCRIPT') return;
    fail(event.error || new Error(event.message || 'Не удалось загрузить программный модуль.'));
  }

  function onRejection(event) {
    if (!finished) fail(event.reason);
  }

  var retry = element('museumRetry');
  if (retry) retry.addEventListener('click', function () { window.location.reload(); });
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);
  var watchdog = setTimeout(function () {
    if (finished || failed) return;
    setMessage('Загрузка занимает больше времени… Можно подождать или повторить попытку.');
    showRetry();
    preloader('slow');
  }, 30000);

  // Fetch the map while the browser resolves the ES-module graph. Low
  // network priority leaves the rendering engine first; callers reuse these
  // exact promises rather than issuing a second round of requests.
  if (document.body.dataset.preloadMuseum === 'true') {
    ['./data/catalog.json', './data/osm/catalog-matches.json', './data/osm/roads.geojson?v=8681815663cf',
      './data/osm/railways.geojson?v=6652ccc2127c', './data/terrain/baikonur-dem.json?v=20261101-relief-v1',
      './data/road-signs.json'].forEach(function (path) {
      var pending = requestJSON(path, { priority: 'low' });
      pending.catch(function () {});
      prefetchedJSON.set(new URL(path, location.href).href, pending);
    });
  }

  window.__MUSEUM_STARTUP = Object.freeze({ stage: stage, ready: ready, fail: fail, fetchJSON: fetchJSON, paint: paint,
    defer: defer, promote: promote, stats: stats, mark: mark });
})();
