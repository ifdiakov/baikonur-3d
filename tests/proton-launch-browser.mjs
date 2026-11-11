import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {MODEL_CATALOG, MODEL_VIEWER_VERSION} from '../src/model-catalog.js';
import {measureProtonCivil, assertProtonCivil, measureProtonNeighborClearance, assertProtonNeighborClearance} from './proton-civil-geometry.mjs';

const base = process.env.BAIKONUR_URL || 'http://127.0.0.1:8765/';
const prefix = process.env.QA_PREFIX || 'local', out = process.env.QA_OUT || 'qa-inspector';
// The wider release already calls this suite as its desktop model-inspector
// check. The dedicated Proton workflow explicitly selects all three modes.
const modes = (process.env.QA_MODES || 'desktop').split(',');
const report = {passed: false, base, sourceCommit: process.env.GITHUB_SHA || null, modes,
  environment: 'Chromium, software WebGL, complete evening museum. Animation frames are advanced by the test; mobile is viewport/touch emulation, not an FPS or physical-device measurement.',
  publicHashes: {}, checks: []};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const started = performance.now();
let browser, page, activeMode;
const progress = phase => console.log('PROTON_PROGRESS', activeMode || 'bytes', phase, Math.round((performance.now() - started) / 1000) + 's');
await mkdir(out, {recursive: true});

async function publishedBytes() {
  const manifest = JSON.parse(await readFile('assets/models/proton/manifest.json', 'utf8'));
  const files = ['index.html', 'museum.html', 'workshop.html', 'workshop/model.html',
    'src/proton-site-civil.js', 'src/proton-launch.js', 'src/proton-source.js', 'src/proton-rocket.js',
    'src/archive-kit.js', 'src/archive-launches.js', 'src/archive-models.js', 'src/archive-manifest.js',
    'src/terrain-voids.js', 'src/workshop-terrain-voids.js', 'src/workshop-panel.js', 'src/workshop-panel.css',
    'src/model-inspector.js', 'src/model-viewer.js', 'src/model-viewer.css', 'src/inspection-models.js', 'src/model-catalog.js',
    'assets/models/proton/manifest.json', ...Object.values(manifest.assets).map(asset => 'assets/models/proton/' + asset.path)];
  for (let offset = 0; offset < files.length; offset += 4) {
    const results = await Promise.allSettled(files.slice(offset, offset + 4).map(async file => {
      const expected = hash(await readFile(file));
      const response = await fetch(new URL(file + '?verify=proton-' + expected.slice(0, 16), base), {signal: AbortSignal.timeout(45000)});
      assert(response.ok, `Published ${file}: HTTP ${response.status}`);
      const actual = hash(Buffer.from(await response.arrayBuffer()));
      report.publicHashes[file] = {expected, actual};
      assert.equal(actual, expected, 'Published file mismatch: ' + file);
    }));
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }
  progress('published-bytes-match:' + files.length);
}
async function frame() { await page.evaluate(() => window.__PROTON_FRAME()); }
async function capture(name, {viewer = false, render = true} = {}) {
  progress('capture-start:' + name);
  if (render) {
    if (viewer) await page.evaluate(() => window.__MODEL_VIEWER_QA.frame());
    else await frame();
  }
  await page.screenshot({path: `${out}/${prefix}-${activeMode}-${name}.png`, timeout: 90000});
  report.lastCapture = {mode: activeMode, name};
  await writeFile(`${out}/${prefix}-proton-report.json`, JSON.stringify(report, null, 2) + '\n');
  progress('capture-complete:' + name);
}
async function click(selector) {
  const button = page.locator(selector);
  await button.scrollIntoViewIfNeeded();
  const hit = await button.evaluate(el => {
    const b = el.getBoundingClientRect(), front = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return {clickable: front === el || el.contains(front), rect: {x: b.x, y: b.y, width: b.width, height: b.height},
      front: front ? {tag: front.tagName, id: front.id, class: front.getAttribute('class')} : null};
  });
  report.lastClick = {mode: activeMode, selector, ...hit};
  assert(hit.clickable, 'Ordinary UI click is covered: ' + JSON.stringify(report.lastClick));
  await button.click();
}
async function measure(siteId) { return page.evaluate(measureProtonCivil, {siteId}); }
async function camera() { return page.evaluate(() => __BAIKONUR_QA.cameraState()); }
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

async function standaloneViewer(result) {
  await page.goto(new URL('workshop/model.html?model=proton-pad', base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.__MODEL_VIEWER_QA?.stats().ready);
  const stats = () => page.evaluate(() => __MODEL_VIEWER_QA.stats());
  const render = () => page.evaluate(() => __MODEL_VIEWER_QA.frame());
  assert.equal(await page.evaluate(() => __MODEL_VIEWER_QA.version), MODEL_VIEWER_VERSION);
  const initial = await stats();
  assert.equal(initial.view, 'front'); assert.equal(initial.dark, true);
  assert.deepEqual(initial.choices, Object.keys(MODEL_CATALOG), 'The viewer exposes the entire current catalogue in order');
  result.viewer = {views: {}};
  for (const view of ['full', 'front', 'side', 'top', 'interface']) {
    await click(`[data-view="${view}"]`); await render();
    const state = await stats(); result.viewer.views[view] = state;
    assert.equal(state.view, view); assert(state.drawCalls <= 60 && state.triangles < 350000);
    assert(state.camera.every(Number.isFinite));
    if (view === 'full') await capture('viewer-full', {viewer: true, render: false});
  }
  const withRocket = (await stats()).triangles;
  await click('#siteRocket'); await capture('viewer-open-aperture', {viewer: true});
  assert.equal((await stats()).vehicleVisible, false);
  assert((await stats()).triangles < withRocket - 15000, 'Hiding the source rocket removes its real geometry');
  const beforeOrbit = (await stats()).camera, canvas = await page.locator('#modelView canvas').boundingBox();
  assert(canvas); await page.mouse.move(canvas.x + canvas.width * .5, canvas.y + canvas.height * .5);
  await page.mouse.down(); await page.mouse.move(canvas.x + canvas.width * .65, canvas.y + canvas.height * .59, {steps: 5});
  await page.mouse.up(); await render(); assert.notDeepEqual((await stats()).camera, beforeOrbit);
  await page.selectOption('#modelSelect', 'proton');
  await page.waitForFunction(() => __MODEL_VIEWER_QA.stats().ready && __MODEL_VIEWER_QA.stats().modelId === 'proton');
  assert(!(await page.locator('#siteRocket').isVisible())); await render();
  assert.equal((await stats()).triangles, 90807);
  const assembled = (await stats()).size;
  await click('#explode'); await render(); assert((await stats()).size[0] > assembled[0] + 10);
  await click('#explode'); await render(); assert.deepEqual((await stats()).size, assembled);
  await click('[data-view="full"]'); await capture('viewer-rocket', {viewer: true});
  assert(!(await page.locator('[data-view="interface"]').isVisible()));
  await page.selectOption('#modelSelect', 'proton-pad');
  await page.waitForFunction(() => __MODEL_VIEWER_QA.stats().ready && __MODEL_VIEWER_QA.stats().modelId === 'proton-pad');
  assert.equal((await stats()).vehicleVisible, true);
  await page.setViewportSize({width: 390, height: 844});
  await page.waitForFunction(() => __MODEL_VIEWER_QA.stats().viewport[0] < 400);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await capture('viewer-mobile', {viewer: true});
  result.viewer.mobile = await stats(); result.viewer.orbit = true; result.viewer.explodeRestored = true;
  await page.setViewportSize({width: 1440, height: 1000});
  progress('standalone-viewer-checked');
}

async function screenProjection(siteId, view) {
  return page.evaluate(({siteId, view}) => {
    const d = __PROTON_TEST, T = d.THREE, root = d.objects.find(o => o.record.id === siteId).g;
    root.updateWorldMatrix(true, true); d.camera.updateMatrixWorld(true);
    const meta = root.userData.protonCivil, preset = meta.views[view];
    const points = (preset.framePoints || []).map((point, i) => ({name: 'frame-' + i, point}));
    if (view === 'civil-entry') {
      const shelter = meta.shelters.find(s => s.id === preset.shelterId);
      if (shelter) points.push({name: 'real-entry', point: shelter.entry.probe.inside});
    } else {
      for (const shelter of meta.shelters) points.push({name: shelter.id + '-crown',
        point: [shelter.roofProbe.origin[0], shelter.roofY, shelter.roofProbe.origin[2]]});
    }
    const blockers = ['info', 'ui', 'workshopPanel', 'timeDock'].flatMap(id => {
      const el = document.getElementById(id); if (!el || !el.getClientRects().length) return [];
      const b = el.getBoundingClientRect(); return [{id, x: b.x, y: b.y, width: b.width, height: b.height}];
    });
    return {siteId, view, shelterId: preset.shelterId || null, framing: root.userData.protonCivilFraming,
      width: innerWidth, height: innerHeight, blockers,
      points: points.map(({name, point}) => {
        const world = root.localToWorld(new T.Vector3(...point)), ndc = world.clone().project(d.camera);
        const x = (ndc.x + 1) * innerWidth / 2, y = (1 - ndc.y) * innerHeight / 2;
        const hit = document.elementFromPoint(x, y), blocker = hit?.closest('#info,#ui,#workshopPanel,#timeDock');
        return {name, local: point, world: world.toArray(), ndc: ndc.toArray(), x, y, coveredBy: blocker?.id || null};
      })};
  }, {siteId, view});
}
function assertProjection(projection) {
  assert(projection.points.length >= 4, 'Civil view provides an actual fitted area');
  assert.equal(projection.framing?.view, projection.view);
  assert.equal(projection.framing.width, projection.width); assert.equal(projection.framing.height, projection.height);
  if (projection.view === 'civil-entry') {
    assert(projection.shelterId, 'The entry view identifies the shelter it inspects');
    assert(projection.points.some(p => p.name === 'real-entry'));
  }
  for (const point of projection.points) {
    assert(point.ndc.every(Number.isFinite) && point.ndc[2] >= -1 && point.ndc[2] <= 1,
      'Civil feature is outside camera depth: ' + JSON.stringify(point));
    assert(point.x >= 6 && point.x <= projection.width - 6 && point.y >= 6 && point.y <= projection.height - 6,
      'Civil feature is offscreen: ' + JSON.stringify({point, width: projection.width, height: projection.height}));
    assert.equal(point.coveredBy, null, 'Civil feature is behind UI: ' + JSON.stringify(point));
  }
}

try {
  assert(modes.length && modes.every(mode => ['desktop', 'mobile', 'workshop'].includes(mode)), 'Unknown QA_MODES');
  if (process.env.VERIFY_PUBLIC === '1') await publishedBytes();
  for (const mode of modes) {
    activeMode = mode; const mobile = mode === 'mobile';
    const options = {headless: true, executablePath: process.env.CHROMIUM_PATH || process.env.BAIKONUR_CHROMIUM || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
        '--ignore-gpu-blocklist', '--enable-webgl', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']};
    if (process.env.ZENIT_PROXY) {
      const url = new URL(process.env.ZENIT_PROXY); options.proxy = {server: url.origin,
        ...(url.username ? {username: decodeURIComponent(url.username), password: decodeURIComponent(url.password)} : {})};
    }
    browser = await chromium.launch(options);
    const context = await browser.newContext({viewport: mobile ? {width: 390, height: 844} : {width: 1440, height: 1000},
      deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block', ignoreHTTPSErrors: Boolean(process.env.ZENIT_PROXY)});
    page = await context.newPage(); page.setDefaultTimeout(90000);
    const result = {mode, passed: false, errors: [], shaderErrors: [], failedRequests: [], sites: {}};
    report.checks.push(result);
    page.on('pageerror', error => {result.errors.push(error.message); console.log('PAGEERROR', error.message);});
    page.on('requestfailed', request => result.failedRequests.push({url: request.url(), reason: request.failure()?.errorText}));
    page.on('console', message => {
      if (message.type() === 'error' && /Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION|compile shader|Error creating WebGL/i.test(message.text())) result.shaderErrors.push(message.text());
    });
    await page.addInitScript(() => {
      const native = requestAnimationFrame.bind(window); let pending;
      window.requestAnimationFrame = fn => ['animate', 'animateModel'].includes(fn.name) ? (pending = fn, 0) : native(fn);
      window.__PROTON_FRAME = () => pending?.(performance.now());
    });
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.resourceType() !== 'document' || !/(?:^|\/)(?:index|museum|workshop)\.html$/.test(url.pathname)) return route.continue();
      const response = await route.fetch(), html = await response.text(), marker = 'window.__BAIKONUR_QA={';
      assert.equal(html.split(marker).length, 2, 'Exactly one existing full-museum QA seam is required');
      await route.fulfill({response, body: html.replace(marker, 'window.__PROTON_TEST={THREE,scene,camera,ctl,objects,portalVoids,portalArchive};' + marker)});
    });
    if (mode === 'desktop') await standaloneViewer(result);
    const entry = mode === 'workshop' ? 'workshop.html' : 'museum.html';
    await page.goto(new URL(entry + '?view=proton&site=pad-81&tour=0&v=20261111-proton-civil-v1', base).href,
      {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForFunction(() => document.body.classList.contains('museum-ready') || document.getElementById('error')?.textContent,
      null, {timeout: 180000});
    assert.equal(await page.locator('#error').textContent(), '');
    assert(await page.evaluate(() => Boolean(window.__PROTON_TEST && window.__BAIKONUR_QA?.proton)));
    assert.equal(await page.evaluate(() => Boolean(window.__MUSEUM_WORKSHOP)), mode === 'workshop');
    await page.evaluate(() => {__BAIKONUR_QA.evening.setEvening(true); __BAIKONUR_QA.setLabelsVisible(false);});
    progress('full-evening-museum-ready');
    for (const siteId of ['pad-81', 'pad-200']) {
      await page.evaluate(id => __BAIKONUR_QA.openObject(id), siteId);
      assert(await page.locator('#protonViews').isVisible());
      assert((await page.locator('#modelCardButton').getAttribute('data-models')).includes('proton-pad'));
      for (const [view, label] of [['civil-entry', 'Укрытия'], ['civil-plan', 'Территория']]) {
        assert.equal((await page.locator(`[data-proton-view="${view}"]`).textContent()).trim(), label);
      }
      const card = await page.locator('#info').boundingBox();
      if (mobile) assert(card && card.x >= -1 && card.x + card.width <= 391 && card.y >= 0 && card.y < 844, 'Mobile card fits the viewport');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const state = {card, positions: await page.evaluate(id => __BAIKONUR_QA.proton.stats(id), siteId)};
      result.sites[siteId] = state; assert.equal(state.positions.length, 2);
      for (const position of state.positions) {
        assert.equal(position.version, 'proton-launch-source-v2');
        assert.equal(position.dimensions.depth, 8); assert.equal(position.dimensions.outlets, 2);
      }
      await capture(siteId + '-card');
      state.civil = await measure(siteId); assertProtonCivil(state.civil);
      state.views = {};
      for (const view of ['civil-entry', 'civil-plan']) {
        await click(`[data-proton-view="${view}"]`);
        assert.equal(await page.locator(`[data-proton-view="${view}"]`).getAttribute('aria-pressed'), 'true');
        await capture(siteId + '-' + view);
        const projection = await screenProjection(siteId, view); state.views[view] = projection; report.lastProjection = projection;
        assertProjection(projection);
      }
      state.neighborClearance = await page.evaluate(measureProtonNeighborClearance, {siteId, pathProbes: state.civil.probes.paths});
      assertProtonNeighborClearance(state.neighborClearance);
      progress(siteId + '-neighbor-geometry-clear');
      // Exercise the existing source-model LOD in the complete museum. Civil
      // works are siblings of that LOD, so loading the GLB must not hide them.
      const beforeSecond = await camera(); await click('[data-proton-position="1"]');
      assert.notDeepEqual((await camera()).target, beforeSecond.target);
      await click('#protonRocketToggle');
      assert((await page.evaluate(id => __BAIKONUR_QA.proton.stats(id), siteId)).every(p => !p.rocketVisible));
      for (const view of ['interface', 'duct', 'tower']) {
        await click(`[data-proton-view="${view}"]`);
        await page.waitForFunction(id => __BAIKONUR_QA.proton.stats(id)[1].source.status === 'ready', siteId);
        await frame();
        assert.equal((await page.evaluate(id => __BAIKONUR_QA.proton.stats(id)[1], siteId)).source.detail, true);
      }
      state.civilWithSource = await measure(siteId); assertProtonCivil(state.civilWithSource);
      assert.deepEqual(state.civilWithSource.geometrySnapshot, state.civil.geometrySnapshot, 'GLB LOD must preserve all civil geometry and its effective visibility');
      assert.deepEqual(state.civilWithSource.probes, state.civil.probes, 'GLB LOD must preserve real vestibules, roofs and approaches');
      await click('#protonRocketToggle');
      assert((await page.evaluate(id => __BAIKONUR_QA.proton.stats(id), siteId)).every(p => p.rocketVisible));
      progress(siteId + '-civil-and-source-lod-checked');
    }
    const pose = await camera(); await click('#modelCardButton');
    await page.waitForFunction(() => __BAIKONUR_QA.modelInspector.stats().ready);
    const child = page.frames().find(f => f.url().includes('/workshop/model.html')); assert(child);
    assert.equal(await child.evaluate(() => __MODEL_VIEWER_QA.stats().modelId), 'proton-pad');
    await child.evaluate(() => __MODEL_VIEWER_QA.frame()); await click('.model-inspector-close');
    result.restoredCamera = await camera();
    for (const key of ['position', 'target']) assert(distance(result.restoredCamera[key], pose[key]) < 1e-8, 'Closing the model inspector restores the exact ' + key);
    assert.equal(result.restoredCamera.controlsEnabled, true);
    if (mode === 'workshop') {
      await page.evaluate(() => __MUSEUM_WORKSHOP.select('pad-200'));
      const height = Number(await page.locator('#wsHeight').inputValue()), baseline = await measure('pad-200');
      await page.locator('#wsHeight').fill(String(height + 1)); await click('#wsApply');
      const moved = await measure('pad-200');
      assert(Math.abs(moved.root.position[1] - baseline.root.position[1] - 1) < 1e-8, 'Workshop height changes the actual site root');
      assert(Math.abs(moved.probes.shelters[0].floor.pointWorld[1] - baseline.probes.shelters[0].floor.pointWorld[1] - 1) < 1e-6,
        'The real shelter floor follows the edited root');
      await click('#wsUndo');
      assert(Math.abs(Number(await page.locator('#wsHeight').inputValue()) - height) < 1e-6);
      const restored = await measure('pad-200'); assertProtonCivil(restored);
      assert.deepEqual(restored.root, baseline.root); assert.deepEqual(restored.geometrySnapshot, baseline.geometrySnapshot);
      assert.deepEqual(restored.probes, baseline.probes, 'Undo restores the actual entry and approach geometry');
      result.workshop = {before: baseline.root, moved: moved.root, restored: restored.root, floorFollowsRoot: true};
      progress('workshop-height-and-undo-checked');
    }
    const scene = await page.evaluate(() => __BAIKONUR_QA.stats());
    assert.equal(scene.shadersValid, true); assert.equal(scene.evening.evening, true);
    result.launchVoids = scene.terrainVoids.items.filter(v => v.shape.source === 'Proton paired lateral ducts and launch aperture');
    assert.equal(result.launchVoids.length, 4); assert(result.launchVoids.every(v => v.enabled === 1));
    result.terrainVoids = scene.terrainVoids; result.render = scene.render;
    assert.deepEqual(result.errors, []); assert.deepEqual(result.shaderErrors, []); assert.deepEqual(result.failedRequests, []);
    result.passed = true; progress('PASS');
    await writeFile(`${out}/${prefix}-proton-report.json`, JSON.stringify(report, null, 2) + '\n');
    await browser.close(); browser = null;
  }
  report.passed = true;
  console.log('PROTON_LAUNCH_BROWSER_OK', JSON.stringify({base, modes, publishedHashes: Object.keys(report.publicHashes).length, sites: 2,
    ordinaryCivilButtons: true, actualCivilGeometry: true, sourceLOD: true, inspectorCameraRestored: true}));
} catch (error) {
  report.failure = {mode: activeMode, message: error.message, stack: error.stack}; throw error;
} finally {
  await writeFile(`${out}/${prefix}-proton-report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
}
