import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const version = 'energia-buran-1988-v1';
const base = process.env.BAIKONUR_URL || 'http://127.0.0.1:8765/';
const prefix = process.env.QA_PREFIX || 'local';
const out = process.env.QA_OUT || 'qa-buran-launch';
const publicFiles = [
  'index.html', 'museum.html', 'workshop.html', 'src/archive-models.js',
  'src/archive-kit.js', 'src/museum-menu.js', 'src/site110.js',
  'src/site110-kinematics.js', 'src/buran-launch.js', 'src/buran-launch.css',
  'src/buran-launch-history.js', 'src/energia-buran-effects.js',
  'src/energia-rocket-exhaust.js', 'src/energia-polyus-launch.js', 'src/energia-plasma-shader.js',
  'src/workshop-panel.css'
];
await mkdir(out, {recursive: true});
const report = {passed: false, version, base, checks: [],
  environment: 'Full museum in Chromium/Linux/software WebGL. Mobile is viewport emulation; frame stepping is not an FPS or physical-device measurement.',
  instrumentation: 'The existing QA seam exposes scene references. Production modules and asset responses are used unchanged; public HTML hashes are verified before adding the inspection seam. Desktop holds the first controller import to verify cancellation during loading.'};
const hash = value => createHash('sha256').update(value).digest('hex');
const distance = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));
const vector = (a, b) => a.map((n, i) => n - b[i]);
const normalized = v => {const length = Math.hypot(...v); return v.map(n => n / length);};
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
let browser, page, activeMode, releasePendingImport;
const started = performance.now();
const progress = phase => console.log('BURAN_LAUNCH_PROGRESS', activeMode, phase, Math.round((performance.now() - started) / 1000) + 's');
const frame = () => page.evaluate(() => window.__BURAN_LAUNCH_FRAME());
const stats = () => page.evaluate(() => window.__BAIKONUR_QA.buranLaunch.stats());
async function seek(time) {
  await page.evaluate(t => {__BAIKONUR_QA.buranLaunch.pause(); __BAIKONUR_QA.buranLaunch.seek(t);}, time);
  const state = await stats();
  assert.equal(state.time, time); assert(state.active);
  return state;
}
async function capture(name) {
  progress('capture:' + name); await frame();
  await page.screenshot({path: `${out}/${prefix}-${activeMode}-${name}.png`, timeout: 90000});
}

// Hash the actual vertex/index/instance buffers. Moving indices are identified
// by the builder's bindings; all remaining instances and every parent matrix
// are independently inspected. The rocket holder is checked separately.
async function geometry(probeChannels = false) {
  return page.evaluate(probeChannels => {
    const {THREE: T, site110Root: root, rocketExhibits} = __BURAN_LAUNCH_TEST;
    const rocket = rocketExhibits.get('site110')?.holder;
    const childOf = (o, parent) => {for (let n = o; n; n = n.parent) if (n === parent) return true; return false;};
    if (!__BURAN_LAUNCH_TEST.sourceMeshIds) {
      __BURAN_LAUNCH_TEST.sourceMeshIds = new Set();
      root.traverse(mesh => {if (mesh.isMesh && !childOf(mesh, rocket)) __BURAN_LAUNCH_TEST.sourceMeshIds.add(mesh.uuid);});
    }
    const fingerprint = values => {
      const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
      let h = 2166136261; for (const b of bytes) h = Math.imul(h ^ b, 16777619);
      return (h >>> 0).toString(16);
    };
    const rows = [], stationary = [], moving = [], floors = [], temporary = [];
    let finite = true, stationaryInstances = 0, movingInstances = 0;
    root.updateWorldMatrix(true, true);
    root.traverse(mesh => {
      if (mesh.userData.museumComponent === 'site110-temporary-carriage') temporary.push(mesh.uuid);
      if (!mesh.isMesh || childOf(mesh, rocket)) return;
      if (__BURAN_LAUNCH_TEST.sourceMeshIds.has(mesh.uuid)) floors.push(mesh);
      const attributes = Object.entries(mesh.geometry.attributes).map(([name, a]) => {
        if (!a.array.every(Number.isFinite)) finite = false;
        return [name, fingerprint(a.array)];
      });
      const motion = mesh.userData.archiveMotionInstances || [];
      const movingIndices = new Set(motion.flatMap(part => part.indices));
      const stillValues = [], motionValues = [];
      if (mesh.isInstancedMesh) {
        for (let i = 0; i < mesh.count; i++) {
          const values = mesh.instanceMatrix.array.slice(i * 16, (i + 1) * 16);
          if (!values.every(Number.isFinite)) finite = false;
          if (movingIndices.has(i)) {motionValues.push(...values); movingInstances++;}
          else {stillValues.push(...values); stationaryInstances++;}
        }
      }
      const matrix = mesh.matrix.toArray(), world = mesh.matrixWorld.toArray();
      if (![...matrix, ...world].every(Number.isFinite)) finite = false;
      const row = {uuid: mesh.uuid, parent: mesh.parent?.uuid, name: mesh.name,
        component: mesh.userData.museumComponent || null, attributes,
        index: mesh.geometry.index ? fingerprint(mesh.geometry.index.array) : null,
        matrix, world, visible: mesh.visible,
        instance: mesh.isInstancedMesh ? fingerprint(mesh.instanceMatrix.array) : null};
      rows.push(row);
      if (mesh.userData.archiveMotionPart) moving.push({uuid: mesh.uuid, id: mesh.userData.archiveMotionPart, matrix, world});
      else stationary.push({uuid: mesh.uuid, matrix, world, hash: stillValues.length ? fingerprint(new Float32Array(stillValues)) : null});
      if (motionValues.length) moving.push({uuid: mesh.uuid, ids: motion.map(part => part.id), hash: fingerprint(new Float32Array(motionValues))});
    });
    const probes = [];
    if (probeChannels) {
      const channels = __BAIKONUR_QA.buranLaunch.stats().rig.channels;
      const ray = new T.Raycaster();
      for (const channel of channels) {
        const middle = new T.Vector3(...channel.throat).lerp(new T.Vector3(...channel.outlet), .5);
        const above = middle.clone(); above.y = 60;
        ray.set(root.localToWorld(above), new T.Vector3(0, -1, 0));
        const hit = ray.intersectObjects(floors, false)[0];
        probes.push({id: channel.id, middle: middle.toArray(), floor: hit ? root.worldToLocal(hit.point.clone()).toArray() : null,
          mesh: hit?.object.name || null});
      }
    }
    return {finite, rows, stationary, moving, stationaryInstances, movingInstances, probes, temporary,
      root: {position: root.position.toArray(), quaternion: root.quaternion.toArray(), scale: root.scale.toArray()},
      rocket: rocket ? {position: rocket.position.toArray(), quaternion: rocket.quaternion.toArray(), scale: rocket.scale.toArray(), visible: rocket.visible} : null};
  }, probeChannels);
}

function sameOriginalGeometry(actual, baseline) {
  assert.equal(actual.rows.length, baseline.rows.length, 'Temporary launch meshes must be removed');
  const byId = new Map(actual.rows.map(row => [row.uuid, row]));
  for (const row of baseline.rows) assert.deepEqual(byId.get(row.uuid), row, 'Original geometry restored: ' + row.name);
  assert.deepEqual(actual.root, baseline.root);
  assert.deepEqual(actual.rocket, baseline.rocket);
}
function stationaryUnchanged(actual, baseline) {
  const byId = new Map(actual.stationary.map(row => [row.uuid, row]));
  for (const row of baseline.stationary) assert.deepEqual(byId.get(row.uuid), row, 'Fixed structure changed: ' + row.uuid);
}
function checkChannels(state, model) {
  const rig = state.rig.channels, effects = state.effects.channels;
  assert.equal(rig.length, 3); assert.equal(effects.length, 3);
  assert.equal(new Set(rig.map(c => c.id)).size, 3);
  const directions = rig.map(c => normalized([c.outlet[0] - c.throat[0], 0, c.outlet[2] - c.throat[2]]));
  for (let i = 0; i < 3; i++) assert(Math.abs(dot(directions[i], directions[(i + 1) % 3]) + .5) < .025, 'Three channels must diverge by 120 degrees');
  assert.equal(model.probes.length, 3);
  for (const probe of model.probes) {
    assert(probe.floor && probe.mesh, 'Channel centre must intersect the rendered trench floor');
    assert(distance([probe.floor[0], probe.floor[2]], [probe.middle[0], probe.middle[2]]) < .001);
    assert(Math.abs(probe.floor[1] - probe.middle[1]) < .001, 'The actual merged floor must follow the channel slope');
  }
  for (const channel of effects) {
    const source = rig.find(c => c.id === channel.id); assert(source);
    assert(distance(source.throat, channel.throat) < .001); assert(distance(source.outlet, channel.outlet) < .001);
    assert(channel.emitterCount > 0 && channel.visibleEmitters > 0);
    assert.equal(channel.visibleEmitters, channel.emitters.filter(e => e.visible).length);
    const direction = normalized(vector(channel.worldOutlet, channel.worldThroat));
    assert(dot(direction, normalized(channel.worldDirection)) > .995);
    for (const emitter of channel.emitters.filter(e => e.visible)) {
      assert(emitter.worldPosition.every(Number.isFinite));
      assert(dot(direction, normalized(emitter.worldDirection)) > .97, 'Drawn jet must follow its own channel');
      const offset = vector(emitter.worldPosition, channel.worldThroat), along = dot(offset, direction);
      const lateral = Math.hypot(...offset.map((n, i) => n - along * direction[i]));
      const worldWidth = channel.width * model.root.scale[0];
      assert(lateral < worldWidth * .55 + .05, 'Emitter centre must remain inside the actual trench');
    }
  }
}

try {
  if (process.env.VERIFY_PUBLIC === '1') {
    report.publicHashes = {};
    for (let start = 0; start < publicFiles.length; start += 4) {
      await Promise.all(publicFiles.slice(start, start + 4).map(async file => {
        const expected = hash(await readFile(file)); let actual;
        for (let attempt = 0; attempt < 3; attempt++) {
          const response = await fetch(new URL(file + '?verify=buran-launch-' + Date.now(), base), {signal: AbortSignal.timeout(12000)});
          if (response.ok) actual = hash(Buffer.from(await response.arrayBuffer()));
          if (actual === expected) break;
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 2000));
        }
        assert.equal(actual, expected, 'Published file mismatch: ' + file); report.publicHashes[file] = actual;
      }));
    }
  }
  for (const mode of (process.env.QA_MODES || 'desktop,mobile,workshop').split(',')) {
    assert(['desktop', 'mobile', 'workshop'].includes(mode)); activeMode = mode;
    const mobile = mode === 'mobile';
    browser = await chromium.launch({headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle',
      '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']});
    const context = await browser.newContext({viewport: mobile ? {width: 390, height: 844} : {width: 1440, height: 1000},
      deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block'});
    page = await context.newPage(); page.setDefaultTimeout(90000);
    const errors = [], shaderErrors = [], failedRequests = [], requested = [];
    let firstImport = mode === 'desktop', signalImportHeld, releaseImport, pendingCancel = null;
    const importHeld = new Promise(resolve => {signalImportHeld = resolve;});
    const importReleased = new Promise(resolve => {releaseImport = resolve;});
    releasePendingImport = releaseImport;
    page.on('pageerror', error => {errors.push(error.message); console.log('PAGEERROR', error.message);});
    page.on('request', request => requested.push(request.url()));
    page.on('requestfailed', request => failedRequests.push({url: request.url(), reason: request.failure()?.errorText}));
    page.on('console', message => {if (message.type() === 'error' && /Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION|compile shader|Error creating WebGL/i.test(message.text())) shaderErrors.push(message.text());});
    await page.addInitScript(() => {
      const native = requestAnimationFrame.bind(window); let pending;
      window.requestAnimationFrame = fn => fn.name === 'animate' ? (pending = fn, 0) : native(fn);
      window.__BURAN_LAUNCH_FRAME = () => pending?.(performance.now());
    });
    await page.route('**/*', async route => {
      if (firstImport && /\/src\/buran-launch\.js(?:\?|$)/.test(route.request().url())) {
        firstImport = false; signalImportHeld(route.request().url()); await importReleased;
      }
      if (route.request().resourceType() !== 'document') return route.continue();
      const response = await route.fetch(), html = await response.text(), marker = 'window.__BAIKONUR_QA={';
      assert.equal(html.split(marker).length, 2, 'The existing full museum QA seam must exist once');
      const body = html.replace(marker, 'window.__BURAN_LAUNCH_TEST={THREE,scene,camera,ctl,renderer,site110Root,rocketExhibits};' + marker);
      await route.fulfill({response, body});
    });
    const entry = mode === 'workshop' ? 'workshop.html' : 'museum.html';
    await page.goto(new URL(entry + '?view=site110&tour=0&v=buran-launch-20261111', base).href, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForFunction(() => document.body.classList.contains('museum-ready') || document.getElementById('error')?.textContent, null, {timeout: 150000});
    assert.equal(await page.locator('#error').textContent(), '');
    assert(await page.evaluate(() => Boolean(__BURAN_LAUNCH_TEST?.site110Root && __BAIKONUR_QA?.buranLaunch)));
    await page.evaluate(() => {__BAIKONUR_QA.openObject('pad-110'); __BAIKONUR_QA.inspectSite110('left'); __BAIKONUR_QA.setLabelsVisible(false); __BURAN_LAUNCH_FRAME();});
    await page.waitForFunction(() => __BAIKONUR_QA.rockets.stats().placements.find(p => p.key === 'site110')?.status === 'ready', null, {timeout: 120000});
    assert(!requested.some(url => /\/src\/buran-launch\.js(?:\?|$)/.test(url)), 'Controller remains lazy until the launch is requested');
    assert(await page.locator('#buranLaunchStart').isVisible());
    assert(await page.locator('#buranLaunchStart').evaluate(el => Boolean(el.closest('#info'))), 'Launch CTA belongs to the site 110 card');
    if (mode === 'desktop') {
      const year = await page.locator('#year').inputValue();
      await page.locator('#buranLaunchStart').click();
      let importTimeout;
      const importURL = await Promise.race([importHeld, new Promise((resolve, reject) => {
        importTimeout = setTimeout(() => reject(new Error('First Buran controller import was not intercepted')), 60000);
      })]).finally(() => clearTimeout(importTimeout));
      assert(await page.locator('#buranLaunchStart').isDisabled());
      await page.locator('#close').click(); assert(await page.locator('#info').isHidden());
      releaseImport(); releasePendingImport = null;
      pendingCancel = await page.evaluate(async url => {
        await import(url); await Promise.resolve();
        return {state: __BAIKONUR_QA.buranLaunch.stats(), panelVisible: Boolean(document.getElementById('buranLaunchPanel')?.getClientRects().length)};
      }, importURL);
      assert.equal(pendingCancel.state.active, false, 'Closing the card must cancel a launch still awaiting its module');
      assert.equal(pendingCancel.panelVisible, false); assert.equal(await page.locator('#year').inputValue(), year);
      await page.evaluate(() => {__BAIKONUR_QA.openObject('pad-110'); __BAIKONUR_QA.inspectSite110('left');});
      assert(await page.locator('#buranLaunchStart').isVisible()); assert(await page.locator('#buranLaunchStart').isEnabled());
      progress('pending-import-cancellation-checked');
    }
    const card = await page.locator('#info').boundingBox();
    if (mobile) assert(card && card.x >= -1 && card.x + card.width <= 391, 'Mobile card fits the viewport');
    await capture('card');
    const initial = await page.evaluate(() => ({year: document.getElementById('year').value,
      camera: __BAIKONUR_QA.cameraState(), evening: __BAIKONUR_QA.evening.evening, admin: Boolean(window.__MUSEUM_WORKSHOP)}));
    assert.equal(initial.admin, mode === 'workshop');
    const baseline = await geometry();
    assert(baseline.finite && baseline.stationaryInstances > 100 && baseline.movingInstances > 0);
    const result = {mode, initial, card, baseline, pendingCancel, phases: []}; progress('startup-ready');

    if (mode === 'workshop') {
      await page.locator('#buranLaunchStart').scrollIntoViewIfNeeded();
      result.workshopStartHitTest = await page.locator('#buranLaunchStart').evaluate(button => {
        const rect = button.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {clickable: hit === button || button.contains(hit), centre: [x, y],
          button: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
          hit: hit ? {tag: hit.tagName, id: hit.id, class: hit.getAttribute('class'), editor: Boolean(hit.closest('#workshopPanel'))} : null};
      });
      report.lastProbe = {mode, kind: 'workshop-launch-button-hit-test', ...result.workshopStartHitTest};
      assert(result.workshopStartHitTest.clickable, 'Workshop launch CTA is covered: ' + JSON.stringify(result.workshopStartHitTest));
    }
    await page.locator('#buranLaunchStart').click();
    await page.waitForFunction(() => __BAIKONUR_QA.buranLaunch.stats()?.active, null, {timeout: 120000});
    let state = await stats(); assert.equal(state.version, version); assert.equal(state.time, -90);
    assert.equal(await page.locator('#year').inputValue(), '1988'); assert(await page.locator('#buranLaunchPanel').isVisible());
    assert.deepEqual(state.camera.initialPosition, initial.camera.position); assert.deepEqual(state.camera.initialTarget, initial.camera.target);
    assert(distance(state.camera.position, initial.camera.position) < 1e-7); assert(distance(state.camera.target, initial.camera.target) < 1e-7);
    const controls = await page.evaluate(() => __BAIKONUR_QA.cameraState().controls);
    assert.equal(controls.enablePan, false); assert.equal(controls.mouseButtons.LEFT, 0); assert.equal(controls.mouseButtons.RIGHT, 0);
    await page.locator('#buranLaunchPlay').click(); assert.equal((await stats()).playing, false);
    await page.locator('#buranLaunchPlay').click(); assert.equal((await stats()).playing, true);
    await page.waitForTimeout(120); await frame(); assert((await stats()).time > -90, 'Production update must advance time');
    await page.locator('#buranLaunchPlay').click(); assert.equal((await stats()).playing, false);
    state = await seek(-90); result.phases.push(state);
    assert.equal(state.effects.engine.engineCorePower, 0); assert.equal(state.effects.engine.engineBoosterPower, 0);
    if (mode === 'desktop') await capture('prelaunch');
    const atMinus40 = await seek(-40), moved = await geometry(); result.phases.push(atMinus40);
    stationaryUnchanged(moved, baseline); assert.notDeepEqual(moved.moving, baseline.moving, 'Real service interfaces must move before ignition');
    const atMinus8 = await seek(-8); result.phases.push(atMinus8);
    assert(atMinus8.effects.engine.engineCorePower > 0); assert.equal(atMinus8.effects.engine.engineBoosterPower, 0);
    assert(distance(atMinus8.camera.position, initial.camera.position) < 1e-6, 'Countdown must preserve the visitor camera');
    const atMinus2 = await seek(-2); result.phases.push(atMinus2);
    assert(atMinus2.effects.engine.engineCorePower > 0 && atMinus2.effects.engine.engineBoosterPower > 0);
    const at3 = await seek(3), at3Geometry = await geometry(true); result.phases.push(at3);
    assert(at3.altitudeMetres > 0); assert(at3.effects.engine.engineFlameAttached); assert.equal(at3.effects.engine.engineJetCount, 8);
    assert(at3.effects.engine.engineUpperFlameLimitY <= .01 && at3.effects.engine.engineHaloUpperLimitY <= .01, 'Engine flames stay below the nozzle plane');
    assert(at3.effects.engine.engineFlameDepthCompatible && at3.effects.engine.engineFlameDepthTest);
    checkChannels(at3, at3Geometry); stationaryUnchanged(at3Geometry, baseline);
    result.channelGeometry = at3Geometry.probes;
    if (mode === 'desktop') {
      await page.locator('#buranLaunchRate').selectOption('1');
      const before = await page.evaluate(() => {
        __BAIKONUR_QA.buranLaunch.resume(); return {time: __BAIKONUR_QA.buranLaunch.stats().time, wall: performance.now()};
      });
      await page.waitForTimeout(1100);
      const after = await page.evaluate(() => {
        const wall = performance.now(); __BURAN_LAUNCH_FRAME();
        const time = __BAIKONUR_QA.buranLaunch.stats().time; __BAIKONUR_QA.buranLaunch.pause(); return {time, wall};
      });
      const elapsed = (after.wall - before.wall) / 1000, advanced = after.time - before.time;
      assert(advanced >= 1, 'A delayed frame must advance more than the old 0.1-second cap');
      assert(Math.abs(advanced - elapsed) < .25, 'At ×1 the clock follows elapsed wall time between frames');
      result.wallClock = {before, after, elapsed, advanced};
      await page.locator('#buranLaunchRate').selectOption('auto'); await seek(3);
    }
    const at12 = await seek(12); result.phases.push(at12);
    assert(at12.altitudeMetres > at3.altitudeMetres && at12.rocket.worldPosition[1] > at3.rocket.worldPosition[1]);
    assert(at12.camera.following);
    assert(distance(vector(at12.camera.position, at12.camera.target), vector(initial.camera.position, initial.camera.target)) < .001,
      'Following translates camera and orbit pivot together');
    const worldNose = await page.evaluate(() => {
      const {THREE: T, rocketExhibits} = __BURAN_LAUNCH_TEST, holder = rocketExhibits.get('site110').holder;
      holder.updateWorldMatrix(true, false);
      return new T.Vector3(0, 1, 0).transformDirection(holder.matrixWorld).toArray();
    });
    // At T+12 the downrange displacement is still zero. Use the next actual
    // rocket pose to determine the path direction independently of its pitch.
    const at20 = await seek(20), horizontalPath = vector(at20.rocket.worldPosition, at12.rocket.worldPosition); horizontalPath[1] = 0;
    const horizontalNose = [worldNose[0], 0, worldNose[2]];
    assert(worldNose[1] > 0 && Math.hypot(...horizontalNose) > 1e-5 && Math.hypot(...horizontalPath) > .01);
    assert(dot(normalized(horizontalNose), normalized(horizontalPath)) > .99, 'Actual world nose direction must lean into the downrange motion');
    result.pitchDirection = {worldNose, horizontalPath}; await seek(12);
    if (mode === 'desktop') await capture('ascent-follow');
    const at75 = await seek(75); result.phases.push(at75);
    assert(at75.effects.engine.engineCorePower > 0 && at75.effects.engine.engineBoosterPower > 0, 'No 1987 cutoff may end this initial 1988 ascent');
    assert(at75.camera.detached && !at75.camera.following, 'Camera releases at the museum height boundary');
    const reverse = await seek(3); result.reverse = reverse;
    assert.deepEqual(reverse.rocket, at3.rocket); assert.deepEqual(reverse.effects.channels, at3.effects.channels);
    assert.deepEqual((await geometry()).moving, at3Geometry.moving, 'Reverse seek reproduces the same actual moving matrices');
    await page.locator('#buranLaunchTrenches').click(); assert.equal((await stats()).view, 'trenches');
    result.trenchProjection = await page.evaluate(() => {
      const {THREE: T, camera} = __BURAN_LAUNCH_TEST;
      camera.updateMatrixWorld(true);
      const panel = document.getElementById('buranLaunchPanel').getBoundingClientRect();
      const outlets = __BAIKONUR_QA.buranLaunch.stats().effects.channels.map(channel => {
        const ndc = new T.Vector3(...channel.worldOutlet).project(camera);
        return {id: channel.id, world: channel.worldOutlet, ndc: ndc.toArray(),
          x: (ndc.x + 1) * innerWidth / 2, y: (1 - ndc.y) * innerHeight / 2};
      });
      return {width: innerWidth, height: innerHeight, panelTop: panel.top, outlets};
    });
    report.lastProbe = {mode, kind: 'three-outlet-screen-projection', ...result.trenchProjection};
    assert.equal(result.trenchProjection.outlets.length, 3);
    for (const outlet of result.trenchProjection.outlets) {
      const {width, height, panelTop} = result.trenchProjection;
      assert(outlet.ndc.every(Number.isFinite) && outlet.ndc[2] >= -1 && outlet.ndc[2] <= 1,
        'Trench outlet must be inside the camera depth range: ' + JSON.stringify(outlet));
      assert(outlet.x >= 12 && outlet.x <= width - 12 && outlet.y >= 0 && outlet.y <= height && outlet.y <= panelTop - 10,
        'Trench outlet is offscreen or covered by the panel: ' + JSON.stringify({outlet, width, height, panelTop}));
    }
    await capture('three-gas-channels');
    if (mobile) {
      const panel = await page.locator('#buranLaunchPanel').boundingBox();
      assert(panel && panel.x >= 0 && panel.x + panel.width <= 391 && panel.y >= 0 && panel.y + panel.height <= 845);
      result.mobilePanel = panel;
    }
    await page.locator('#buranLaunchOverview').click(); assert.equal((await stats()).view, 'overview');
    await page.locator('#buranLaunchFollow').click(); assert.equal((await stats()).view, 'follow');
    await page.locator('#buranLaunchRestart').click();
    const restarted = await stats(); assert.equal(restarted.time, -90); assert(restarted.playing);
    assert(distance(restarted.camera.target, initial.camera.target) < 1e-6, 'Restart after changing the follow view must restore the original countdown target');
    assert.deepEqual(restarted.camera.initialTarget, initial.camera.target); result.restartTarget = restarted.camera.target;
    await page.locator('#buranLaunchPlay').click(); assert(!(await stats()).playing);
    await page.locator('#buranLaunchSeek').evaluate(input => {input.value = '12'; input.dispatchEvent(new Event('input', {bubbles: true}));});
    assert.equal((await stats()).time, 12); assert.match(await page.locator('#buranLaunchTime').textContent(), /12[.,]0/);
    await page.locator('#buranLaunchClose').click(); assert(await page.locator('#buranLaunchPanel').isHidden());
    result.restored = {state: await stats(), geometry: await geometry(), camera: await page.evaluate(() => __BAIKONUR_QA.cameraState()),
      year: await page.locator('#year').inputValue()};
    assert(!result.restored.state.active); assert.equal(result.restored.state.effects, null); assert.equal(result.restored.state.rig.active, false);
    assert.equal(result.restored.year, initial.year); assert.deepEqual(result.restored.camera, initial.camera, 'Closing restores every camera/control setting');
    sameOriginalGeometry(result.restored.geometry, baseline); assert.equal(result.restored.geometry.temporary.length, 0);
    progress('timeline-geometry-and-restoration-checked');

    if (mode === 'desktop') {
      assert.equal(await page.evaluate(() => __BAIKONUR_QA.buranLaunch.start()), true, 'Async request API must resolve true');
      await seek(3); await page.evaluate(() => __BAIKONUR_QA.openObject('pad-95'));
      assert(!(await stats()).active, 'Navigating to another site must end the reconstruction');
      assert(await page.locator('#buranLaunchStart').isHidden()); assert.equal(await page.locator('#buranLaunchPanel').count(), 1);
      result.navigationStopped = true;

      // The shared exhaust was extracted from the already approved UKSS
      // controller. Exercise that production integration once as well as the
      // separate Node golden-geometry comparison; do not rebuild its scene.
      await page.evaluate(() => {__BAIKONUR_QA.openObject('pad-250'); __BAIKONUR_QA.inspectUkss('overview'); __BURAN_LAUNCH_FRAME();});
      await page.waitForFunction(() => __BAIKONUR_QA.rockets.stats().placements.find(p => p.key === 'ukss')?.status === 'ready', null, {timeout: 90000});
      assert(await page.locator('#energiaLaunchStart').isVisible());
      const ukssBefore = await page.evaluate(() => {
        const holder = __BURAN_LAUNCH_TEST.rocketExhibits.get('ukss').holder;
        return {camera: __BAIKONUR_QA.cameraState(), year: document.getElementById('year').value,
          position: holder.position.toArray(), quaternion: holder.quaternion.toArray(), visible: holder.visible,
          shadowMap: __BURAN_LAUNCH_TEST.renderer.shadowMap.enabled};
      });
      await page.locator('#energiaLaunchStart').click();
      await page.waitForFunction(() => __BAIKONUR_QA.energia.stats()?.active, null, {timeout: 90000});
      await page.locator('#energiaPlay').click(); assert((await page.evaluate(() => __BAIKONUR_QA.energia.stats())).paused);
      await page.evaluate(() => __BAIKONUR_QA.energia.seek(0)); await frame();
      const ignition=await page.evaluate(()=>__BAIKONUR_QA.energia.stats().effects);
      assert(ignition.ductJetVisible&&ignition.gasPower>.9,'Short duct fire must appear at ignition');
      await page.evaluate(() => __BAIKONUR_QA.energia.seek(8)); await frame();
      const ukss = await page.evaluate(() => {
        const d = __BURAN_LAUNCH_TEST, holder = d.rocketExhibits.get('ukss').holder;
        const flame = holder.getObjectByName('Реактивные факелы');
        const duct = d.scene.getObjectByName('Газоход · направленный поток горячих газов');
        return {state: __BAIKONUR_QA.energia.stats(), actual: {
          flameAttached: flame?.parent === holder, flameVisible: flame?.visible,
          flameMeshes: flame?.children.filter(mesh => mesh.isMesh && mesh.visible).length,
          glowSprites: flame?.children.filter(mesh => mesh.isSprite && mesh.visible).length,
          groundVisible: duct?.visible, groundMeshes: duct?.children.filter(mesh => mesh.isMesh && mesh.visible).length
        }};
      });
      assert.equal(ukss.state.time, 8); assert(ukss.state.active && ukss.state.paused);
      const oldEffects = ukss.state.effects;
      assert.equal(oldEffects.engineJetCount, 8); assert(oldEffects.engineFlameAttached);
      assert(oldEffects.engineFlameDepthCompatible && oldEffects.engineFlameDepthTest);
      assert(oldEffects.engineUpperFlameLimitY < 0 && oldEffects.engineHaloUpperLimitY < 0);
      assert(oldEffects.engineCorePower > .9 && oldEffects.engineBoosterPower > .9);
      assert.equal(oldEffects.ductJetVisible,false,'Short ground fire must finish after takeoff');assert.equal(oldEffects.gasPower,0);
      assert.deepEqual(ukss.actual, {flameAttached: true, flameVisible: true, flameMeshes: 32, glowSprites: 8, groundVisible: false, groundMeshes: 7});
      await page.locator('#energiaClose').click();
      const ukssAfter = await page.evaluate(() => {
        const d = __BURAN_LAUNCH_TEST, holder = d.rocketExhibits.get('ukss').holder;
        return {camera: __BAIKONUR_QA.cameraState(), year: document.getElementById('year').value,
          position: holder.position.toArray(), quaternion: holder.quaternion.toArray(), visible: holder.visible,
          shadowMap: d.renderer.shadowMap.enabled, active: __BAIKONUR_QA.energia.stats().active,
          exhaustVisible: holder.getObjectByName('Реактивные факелы')?.visible};
      });
      assert(!ukssAfter.active && !ukssAfter.exhaustVisible);
      assert.equal(ukssAfter.year, ukssBefore.year); assert.equal(ukssAfter.visible, ukssBefore.visible);
      assert.equal(ukssAfter.shadowMap, ukssBefore.shadowMap);
      assert(distance(ukssAfter.position, ukssBefore.position) < 1e-8 && distance(ukssAfter.quaternion, ukssBefore.quaternion) < 1e-8);
      assert(distance(ukssAfter.camera.position, ukssBefore.camera.position) < 1e-6 && distance(ukssAfter.camera.target, ukssBefore.camera.target) < 1e-6);
      assert.deepEqual(ukssAfter.camera.controls, ukssBefore.camera.controls);
      result.ukssRegression = {before: ukssBefore, ignition, firing: ukss, restored: ukssAfter};
      progress('existing-ukss-exhaust-integration-checked');
    }
    if (mode === 'workshop') {
      await page.evaluate(() => __MUSEUM_WORKSHOP.select('pad-110'));
      const height = Number(await page.locator('#wsHeight').inputValue());
      const y = await page.evaluate(() => __BURAN_LAUNCH_TEST.site110Root.position.y);
      await page.locator('#wsHeight').fill(String(height + 1)); await page.locator('#wsApply').click();
      assert(Math.abs(await page.evaluate(() => __BURAN_LAUNCH_TEST.site110Root.position.y) - y) > .05);
      await page.locator('#wsUndo').click(); assert.equal(Number(await page.locator('#wsHeight').inputValue()), height);
      assert.equal(await page.evaluate(() => __BURAN_LAUNCH_TEST.site110Root.position.y), y); result.workshopHeightUndo = true;
    }
    assert(await page.evaluate(() => __BAIKONUR_QA.stats().shadersValid));
    assert.deepEqual(errors, []); assert.deepEqual(shaderErrors, []); assert.deepEqual(failedRequests, []);
    result.errors = errors; result.shaderErrors = shaderErrors; result.failedRequests = failedRequests;
    report.checks.push(result); await writeFile(`${out}/${prefix}-report.json`, JSON.stringify(report, null, 2));
    console.log('BURAN_LAUNCH_MODE_OK', mode); await browser.close(); browser = null;
  }
  report.passed = true; report.checkedAt = new Date().toISOString();
} catch (error) {
  report.error = error.stack; report.failedMode = activeMode;
  report.startup = await page?.evaluate(() => ({message: document.getElementById('error')?.textContent, stats: window.__MUSEUM_STARTUP?.stats()})).catch(() => null);
  await page?.screenshot({path: `${out}/${prefix}-${activeMode || 'startup'}-failure.png`, timeout: 15000}).catch(() => {});
  throw error;
} finally {
  releasePendingImport?.();
  await writeFile(`${out}/${prefix}-report.json`, JSON.stringify(report, null, 2)); await browser?.close();
}
console.log('BURAN_LAUNCH_BROWSER_PASS', report.checks.map(check => check.mode).join(','));
