(function () {
  'use strict';

  // A lightweight, camera-led tour. It starts only AFTER the museum preloader
  // has disappeared and never delays access to the actual interactive map.
  const FLANK_FLYOVER_MS = 3000;
  const TOTAL_MS = 29000;
  const STORAGE_KEY = 'baikonur-museum-onboarding-v2';
  const params = new URLSearchParams(location.search);
  const forced = params.get('tour') === '1';
  const deepLink = ['view', 'site', 'station', 'detail'].some(key => params.has(key));
  const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const mobile = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  const stages = [
    { end: 3000, title: 'ФЛАНГИ КОСМОДРОМА',
      hint: 'Приближаемся к космодрому и пролетаем над его тремя флангами.' },
    { end: 8000, title: 'ПЕРЕМЕЩЕНИЕ ПО КАРТЕ',
      hint: mobile ? 'Проведите одним пальцем, чтобы перемещаться.' : 'Удерживайте левую кнопку мыши и двигайте карту.' },
    { end: 14000, title: 'МАСШТАБ И РАКУРС',
      hint: mobile ? 'Два пальца — масштаб и вращение.' : 'Колёсико — масштаб. Правая кнопка — поворот.' },
    { end: 20000, title: 'СТАРТОВЫЕ ПЛОЩАДКИ',
      hint: 'Выберите объект на карте, чтобы открыть его историю и 3D-модель.' },
    { end: 25000, title: 'ИССЛЕДУЙТЕ ОБЪЕКТЫ',
      hint: 'Камеру можно вращать вокруг выбранного сооружения.' },
    { end: 29000, title: 'ЦИФРОВЫЕ РЕКОНСТРУКЦИИ',
      hint: 'В меню доступны старты ракет, посадка «Бурана» и другие события.' }
  ];
  let root, title, hint, counter, skip, progress;
  let api = null, ready = false, active = false, pendingStart = false;
  let elapsed = 0, lastNow = 0, currentStage = -1;
  let move = null, orbit = null, flyover = null, initiallyFocused = false, originalControls = null;
  let selectedDuringDemo = false, spotlight = null, openedMenu = null;
  let startingPose = null; // Exact original eye + look-at, including height and heading.

  function hasSeen() {
    try { return localStorage.getItem(STORAGE_KEY) === 'yes'; }
    catch (_) { return false; }
  }
  function markSeen() {
    try { localStorage.setItem(STORAGE_KEY, 'yes'); } catch (_) {}
  }
  // The owner wants the cinematic introduction when the map opens, not
  // just on the first visit. Direct links, explicit ?tour=0, reduced-motion
  // preferences and automated browser tests still retain their safeguards.
  const autoPlay = forced || (
    !navigator.webdriver && !deepLink && params.get('tour') !== '0' && !reducedMotion
  );

  function build() {
    root = document.createElement('section');
    root.id = 'museumOnboarding';
    root.hidden = true;
    root.setAttribute('aria-label', 'Короткая экскурсия по управлению музеем');
    // Intentionally NO instruction card/panel: a restrained text overlay only.
    root.innerHTML = [
      '<div class="museum-tour__hint" aria-live="polite" aria-atomic="true">',
      '<span class="museum-tour__title"></span>',
      '<span class="museum-tour__text"></span>',
      '</div>',
      '<div class="museum-tour__actions">',
      '<span class="museum-tour__step" aria-hidden="true">01 / 06</span>',
      '<button class="museum-tour__skip" type="button">Пропустить <span aria-hidden="true">×</span></button>',
      '</div>',
      '<div class="museum-tour__track" role="progressbar" aria-label="Прогресс обучения" aria-valuemin="0" aria-valuemax="29" aria-valuenow="0">',
      '<span class="museum-tour__fill"></span></div>'
    ].join('');
    document.body.appendChild(root);
    title = root.querySelector('.museum-tour__title');
    hint = root.querySelector('.museum-tour__text');
    counter = root.querySelector('.museum-tour__step');
    skip = root.querySelector('.museum-tour__skip');
    progress = root.querySelector('.museum-tour__fill');
    skip.addEventListener('click', () => stop());
    // Cancel BEFORE OrbitControls receives the first pointer/wheel gesture,
    // and return the live camera without snapping back to an earlier position.
    document.addEventListener('pointerdown', event => {
      if (active && !root.contains(event.target)) stop();
    }, true);
    document.addEventListener('wheel', event => {
      if (active && !root.contains(event.target)) stop();
    }, { capture: true, passive: true });
    document.addEventListener('keydown', event => {
      if (!active || event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        stop();
      } else if (/^Arrow/.test(event.key) || /^[wasd]$/i.test(event.key)) {
        stop();
      }
    }, true);
  }

  function pose() {
    if (!api) return null;
    return { eye: api.camera.position.clone(), target: api.controls.target.clone() };
  }
  function setPose(p) {
    if (!api || !p) return;
    api.camera.position.copy(p.eye);
    api.controls.target.copy(p.target);
    api.camera.lookAt(api.controls.target);
    api.camera.updateMatrixWorld(true);
  }
  function ease(t) {
    const u = Math.max(0, Math.min(1, t));
    return u * u * u * (u * (6 * u - 15) + 10); // 5th-order ease: zero velocity and acceleration at ends
  }
  function tweenTo(destination, duration, travelArc = 0) {
    if (!destination || reducedMotion) return;
    move = { from: pose(), to: destination, at: elapsed, duration, travelArc };
    orbit = null;
  }
  function panDestination() {
    const p = pose(), dx = p.eye.x - p.target.x, dz = p.eye.z - p.target.z;
    const horizontal = Math.max(1, Math.hypot(dx, dz));
    const shift = Math.min(170, Math.max(45, p.eye.distanceTo(p.target) * .065));
    const x = shift * dz / horizontal, z = -shift * dx / horizontal;
    p.eye.x += x; p.eye.z += z;
    p.target.x += x; p.target.z += z;
    return p;
  }
  function zoomDestination() {
    const p = pose();
    const dx = p.eye.x - p.target.x, dz = p.eye.z - p.target.z;
    const angle = .19, scale = .80;
    p.eye.x = p.target.x + (dx * Math.cos(angle) - dz * Math.sin(angle)) * scale;
    p.eye.z = p.target.z + (dx * Math.sin(angle) + dz * Math.cos(angle)) * scale;
    p.eye.y = p.target.y + (p.eye.y - p.target.y) * scale;
    return p;
  }
  // The opening panorama starts at the visitor's ORIGINAL overview pose.
  // Zoom first to the exact flank-plan framing used elsewhere in the museum;
  // then glide a short distance over the terrain. No camera teleport.
  function startFlankFlyover() {
    const from = pose();
    const destination = api?.flankTourPose?.();
    if (!from || !destination?.eye?.clone || !destination?.target?.clone) {
      tweenTo(zoomDestination(), FLANK_FLYOVER_MS);
      return;
    }
    const flank = { eye: destination.eye.clone(), target: destination.target.clone() };
    const advance = flank.target.clone().sub(flank.eye).setY(0);
    if (advance.lengthSq() < 1e-10) advance.set(0, 0, -1);
    advance.normalize().multiplyScalar(mobile ? 90 : 150);
    // A slight eastward drift reveals successive pads instead of mimicking
    // a mechanical vertical zoom. Endpoints and tangents are eased to rest.
    const lateral = advance.clone().set(-advance.z, 0, advance.x).normalize().multiplyScalar(mobile ? 30 : 48);
    const glide = advance.add(lateral);
    flyover = { from, flank, glide, at: elapsed, duration: FLANK_FLYOVER_MS };
    move = null;
    orbit = null;
  }

  function runFlankFlyover(complete = false) {
    if (!flyover) return;
    const t = complete ? 1 : Math.max(0, Math.min(1, (elapsed - flyover.at) / flyover.duration));
    const zoom = ease(t / .43);               // approach the flank plan in ~1.3 s
    const traverse = ease((t - .30) / .70);   // gentle flight during the remainder
    const { from, flank, glide } = flyover;
    api.camera.position.copy(from.eye).lerp(flank.eye, zoom).addScaledVector(glide, traverse);
    api.controls.target.copy(from.target).lerp(flank.target, zoom).addScaledVector(glide, traverse);
    api.camera.lookAt(api.controls.target);
    api.camera.updateMatrixWorld(true);
    if (t >= 1) flyover = null;
  }

  function startOrbit(startAt = elapsed, focused = false) {
    if (reducedMotion) return;
    const p = pose();
    if (!p) return;
    orbit = { base: p, at: startAt, focused };
    move = null;
  }
  function runOrbit() {
    if (!orbit) return;
    const seconds = Math.max(0, (elapsed - orbit.at) / 1000);
    const b = orbit.base, dx = b.eye.x - b.target.x, dz = b.eye.z - b.target.z;
    const radians = seconds * (orbit.focused ? .075 : .070);
    // On a focused site, remain centered on that SAME site as we orbit.
    // No circular camera teleport or change of pivot across menu stages.
    let scale = 1;
    if (orbit.focused && seconds >= 5) scale = 1 - .10 * ease((seconds - 5) / 6);
    const c = Math.cos(radians), s = Math.sin(radians);
    api.controls.target.copy(b.target);
    api.camera.position.set(
      b.target.x + (dx * c - dz * s) * scale,
      b.target.y + (b.eye.y - b.target.y) * scale,
      b.target.z + (dx * s + dz * c) * scale
    );
    api.camera.lookAt(api.controls.target);
    api.camera.updateMatrixWorld(true);
  }
  function runMove() {
    if (!move) return;
    const t = Math.max(0, Math.min(1, (elapsed - move.at) / move.duration));
    const u = ease(t);
    api.camera.position.copy(move.from.eye).lerp(move.to.eye, u);
    api.controls.target.copy(move.from.target).lerp(move.to.target, u);
    // Take a graceful elevated arc when moving across the cosmodrome.
    if (move.travelArc) api.camera.position.y += move.travelArc * Math.sin(Math.PI * u);
    api.camera.lookAt(api.controls.target);
    api.camera.updateMatrixWorld(true);
    if (t >= 1) move = null;
  }
  function highlight(target) {
    if (spotlight) spotlight.classList.remove('museum-tour-spotlight');
    spotlight = target || null;
    if (spotlight?.getClientRects().length) spotlight.classList.add('museum-tour-spotlight');
  }
  function enterStage(i) {
    // Finish the last flank-flight sample exactly, even after a dropped frame.
    if (currentStage === 0 && i !== 0 && flyover) runFlankFlyover(true);
    currentStage = i;
    const s = stages[i];
    title.textContent = s.title;
    hint.textContent = s.hint;
    counter.textContent = String(i + 1).padStart(2, '0') + ' / 06';
    highlight(null);

    if (i === 0) {
      // A deep-linked/focused object must never be moved away unexpectedly.
      if (initiallyFocused) startOrbit(0, true);
      else startFlankFlyover();
    } else if (i === 1) {
      if (initiallyFocused) startOrbit(elapsed, true);
      else tweenTo(panDestination(), 5000);
    } else if (i === 2 && !initiallyFocused) {
      tweenTo(zoomDestination(), 6000);
    } else if (i === 3) {
      if (!initiallyFocused && typeof api?.focusGagarin === 'function') {
        // Focus updates the real site card. Capture its destination pose,
        // then instantly restore the current camera BEFORE the next render.
        const from = pose();
        try {
          api.focusGagarin();
          selectedDuringDemo = true;
          const destination = pose();
          setPose(from);
          const distance = from.target.distanceTo(destination.target);
          tweenTo(destination, 6000, Math.min(400, distance * .17));
        } catch (error) {
          setPose(from);
          console.warn('Tour: could not focus Gagarin launch site', error);
        }
      }
      highlight(document.getElementById('info'));
    } else if (i === 4) {
      if (!initiallyFocused) startOrbit(elapsed, false);
      highlight(mobile ? document.getElementById('mobileMenuToggle') : document.getElementById('sitesAccordion'));
    } else if (i === 5) {
      // Finish the fly-around with a gentle 3.9 s return to the exact view
      // shown before the tour: original position, height, target and heading.
      if (startingPose) {
        const current = pose();
        const travel = current.eye.distanceTo(startingPose.eye);
        tweenTo(startingPose, 3900, Math.min(280, travel * .10));
      }
      const menu = document.getElementById('reconstructionsAccordion');
      if (menu && !mobile) {
        openedMenu = { element: menu, wasOpen: menu.open };
        menu.open = true;
      }
      highlight(mobile ? document.getElementById('mobileMenuToggle') : menu);
    }
  }
  function update(now) {
    if (!active || !api || document.hidden) {
      lastNow = 0;
      return;
    }
    if (lastNow > 0) elapsed += Math.max(0, now - lastNow);
    lastNow = now;
    if (elapsed >= TOTAL_MS) {
      // The final rendered frame may land beyond 29 s. Complete the move
      // before stopping; do not leave a near-but-not-exact camera pose.
      stop(true);
      return;
    }
    const i = stages.findIndex(s => elapsed < s.end);
    if (i !== currentStage) enterStage(i);
    if (!reducedMotion) {
      if (flyover) runFlankFlyover();
      else if (move) runMove();
      else if (orbit) runOrbit();
    }
    progress.style.width = (elapsed / TOTAL_MS * 100).toFixed(2) + '%';
    root.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(Math.floor(elapsed / 1000)));
  }
  function start() {
    if (!ready || !api || active || document.hidden) return false;
    const loader = document.getElementById('museumLoading');
    if (!loader?.hidden || !document.body.classList.contains('museum-ready')) return false;
    pendingStart = false;
    active = true;
    elapsed = 0;
    lastNow = 0;
    currentStage = -1;
    selectedDuringDemo = false;
    openedMenu = null;
    move = null;
    orbit = null;
    flyover = null;
    initiallyFocused = Boolean(api.isObjectFocused?.());
    originalControls = { enabled: api.controls.enabled, damping: api.controls.enableDamping };
    // Suppress scripted-tour vs. wheel/damping competition. The first real
    // interaction restores OrbitControls before its event handler executes.
    api.controls.enableDamping = false;
    api.controls.update();
    startingPose = pose();
    api.controls.enabled = false;
    root.hidden = false;
    return true;
  }
  function stop(completed = false) {
    if (!active) {
      pendingStart = false;
      return;
    }
    active = false;
    pendingStart = false;
    move = null;
    orbit = null;
    flyover = null;
    // Natural completion returns to the starting altitude/view. A visitor
    // pressing Skip or using the map stays at the camera's current pose.
    if (completed && startingPose) setPose(startingPose);
    highlight(null);
    root.hidden = true;
    if (openedMenu && !openedMenu.wasOpen) openedMenu.element.open = false;
    openedMenu = null;
    if (api && originalControls) {
      api.controls.enabled = originalControls.enabled;
      api.controls.enableDamping = originalControls.damping;
      api.camera.lookAt(api.controls.target);
      api.camera.updateMatrixWorld(true);
    }
    // Keep the current camera view: skipping must never snap the visitor back.
    originalControls = null;
    startingPose = null;
    markSeen();
  }
  function attach(options) {
    api = options;
  }
  function readyAfterPreloader() {
    ready = true;
    if (!autoPlay || !api) return;
    pendingStart = true;
    // Defer to a NEW painted frame; neither the exit animation nor its last
    // compositor frame should overlap the first frame of the camera tour.
    const schedule = () => {
      if (!pendingStart) return;
      if (document.hidden) return;
      requestAnimationFrame(() => {
        if (!pendingStart) return;
        if (!start()) requestAnimationFrame(schedule);
      });
    };
    requestAnimationFrame(schedule);
  }
  function fail() {
    pendingStart = false;
    if (active) stop();
  }
  function installReplay() {
    const host = document.querySelector('#navigationGuide .navigation-guide-content');
    if (!host || host.querySelector('.museum-tour-replay')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'museum-tour-replay';
    button.textContent = '↻  ПОВТОРИТЬ ЭКСКУРСИЮ · 29 СЕК';
    button.addEventListener('click', () => start());
    host.appendChild(button);
  }

  build();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installReplay, { once: true });
  else installReplay();
  document.addEventListener('visibilitychange', () => {
    lastNow = 0;
    if (!document.hidden && pendingStart) requestAnimationFrame(() => start());
  });
  window.__MUSEUM_ONBOARDING = Object.freeze({
    attach, ready: readyAfterPreloader, update, fail, replay: start, skip: stop,
    stats: () => ({
      active, ready, pendingStart, elapsedMs: Math.round(elapsed), step: currentStage,
      durationMs: TOTAL_MS, flankFlyoverMs: FLANK_FLYOVER_MS, focused: initiallyFocused,
      moving: Boolean(move), orbiting: Boolean(orbit), flyingFlanks: Boolean(flyover),
      returning: active && currentStage === 5 && Boolean(move)
    })
  });
})();