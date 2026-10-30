(function () {
  'use strict';

  var finished = false;
  var failed = false;
  var controls = ['museumLeftStack', 'labelLayer', 'timeDock', 'hero'];
  var element = function (id) { return document.getElementById(id); };
  var setMessage = function (text) {
    var message = element('museumLoadingMessage');
    if (message) message.textContent = String(text);
  };
  var showRetry = function () {
    var retry = element('museumRetry');
    if (retry) retry.hidden = false;
  };

  function stage(text) {
    if (!finished && !failed) setMessage(text);
  }

  function ready() {
    finished = true;
    failed = false;
    clearTimeout(watchdog);
    var loading = element('museumLoading');
    if (loading) { loading.hidden = true; loading.dataset.state = 'ready'; }
    controls.forEach(function (id) {
      var control = element(id);
      if (control) {
        control.inert = false;
        control.removeAttribute('inert');
      }
    });
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
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
  }, 30000);

  window.__MUSEUM_STARTUP = Object.freeze({ stage: stage, ready: ready, fail: fail, fetchJSON: fetchJSON });
})();
