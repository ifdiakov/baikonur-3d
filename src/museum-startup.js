(function () {
  'use strict';

  var finished = false;
  var failed = false;
  var step = 0;
  var totalSteps = 9;
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

  function ready() {
    if (finished || failed) return;
    finished = true;
    clearTimeout(watchdog);
    var loading = element('museumLoading');
    var focusWasInside = loading && loading.contains(document.activeElement);
    var revealed = false;
    function reveal() {
      if (revealed) return;
      revealed = true;
      if (loading) { loading.hidden = true; loading.dataset.state = 'ready'; }
      controls.forEach(function (id) {
        var control = element(id);
        if (control) {
          control.inert = false;
          control.removeAttribute('inert');
        }
      });
      document.body.classList.add('museum-ready');
      preloader('destroy');
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
    preloader('finish');
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!loading || !window.__MUSEUM_PRELOADER || reduced || document.hidden) reveal();
    else setTimeout(reveal, 460);
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
    preloader('fail');
  }

  async function fetchJSON(path, options) {
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
      var response = await fetch(path, { cache: 'no-store', signal: controller.signal });
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

  window.__MUSEUM_STARTUP = Object.freeze({ stage: stage, ready: ready, fail: fail, fetchJSON: fetchJSON, paint: paint });
})();
