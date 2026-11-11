import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {BURAN_LAUNCH_VERSION, START, END, SOURCES, EVENTS, sampleBuranHistory} from '../src/buran-launch-history.js';
import {buildSite110, getSite110LaunchRig} from '../src/site110.js';
import {sampleEnergiaBuranEffects} from '../src/energia-buran-effects.js';

const report = {passed: false, version: BURAN_LAUNCH_VERSION, checks: []};
const check = (name, action) => {action(); report.checks.push({name, passed: true});};
const digest = array => createHash('sha256').update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const root = new THREE.Group(); root.scale.setScalar(.14);
const original = new Map();
await mkdir('qa-buran-launch', {recursive: true});

try {
  check('1988 clocks are measured from the actual liftoff contact', () => {
    assert.equal(BURAN_LAUNCH_VERSION, 'energia-buran-1988-v1'); assert.equal(START, -90); assert.equal(END, 75);
    const seconds = clock => clock.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
    const liftoff = seconds('06:00:01.25');
    const observations = [['05:59:09', 'aiming-release'], ['05:59:50.10', 'core-ignition'],
      ['05:59:56.30', 'booster-ignition'], ['05:59:59.50', 'main-thrust'], ['06:00:01.25', 'liftoff']];
    for (const [clock, phase] of observations) {
      const time = Math.round((seconds(clock) - liftoff) * 100) / 100;
      const event = EVENTS.find(candidate => candidate.phase === phase);
      assert.equal(event.at, time); assert.equal(event.timing, 'documented');
      assert.equal(sampleBuranHistory(time).phase, phase);
      assert.notEqual(sampleBuranHistory(time - .001).phase, phase);
      assert.equal(event.source.url, SOURCES.chronology.url);
    }
  });
  check('History distinguishes narrative intervals and retains valid sources', () => {
    assert(EVENTS.every((event, i) => Number.isFinite(event.at) && (!i || event.at > EVENTS[i - 1].at)));
    assert(EVENTS.every(event => event.at >= START && event.at <= END));
    assert.equal(EVENTS.filter(event => event.timing === 'documented').length, 5);
    assert(EVENTS.every(event => ['documented', 'visual-interval'].includes(event.timing)));
    assert(EVENTS.every(event => event.title && event.caption && event.source.title && new URL(event.source.url).protocol === 'https:'));
    assert.equal(EVENTS[0].title, 'Площадка 110 · левый старт');
    assert(Object.isFrozen(EVENTS) && Object.isFrozen(SOURCES));
    assert.equal(sampleBuranHistory(-100).time, -90); assert.equal(sampleBuranHistory(200).time, 75);
    assert.equal(sampleBuranHistory(Number.NaN).time, -90);
  });
  check('1988 engine timing cannot silently use the 1987 UKSS cycle', () => {
    const clear = sampleEnergiaBuranEffects(-90), core = sampleEnergiaBuranEffects(-8), all = sampleEnergiaBuranEffects(-2);
    assert.equal(clear.engine.core, 0); assert.equal(clear.engine.boosters, 0);
    assert.equal(clear.ground.gas, 0); assert.equal(clear.ground.water, 0);
    assert(core.engine.core > 0); assert.equal(core.engine.boosters, 0);
    assert(all.engine.core > 0 && all.engine.boosters > 0);
    const end = sampleEnergiaBuranEffects(75, {altitudeMetres: 15000});
    assert(end.engine.core > 0 && end.engine.boosters > 0, 'The initial ascent has no engine cutoff');
    for (const t of [-90, -40, -16, -11.15, -8, -4.95, -2, 0, 3, 12, 75]) {
      const actual = sampleEnergiaBuranEffects(t, {altitudeMetres: Math.max(0, t) * 20});
      assert.deepEqual(actual, sampleEnergiaBuranEffects(t, {altitudeMetres: Math.max(0, t) * 20}), 'Scrubbing must be deterministic');
      assert(actual.engine.core >= 0 && actual.engine.core <= 1 && actual.engine.boosters >= 0 && actual.engine.boosters <= 1);
    }
  });

  buildSite110(root); root.updateMatrixWorld(true);
  const rig = getSite110LaunchRig(root); assert(rig);
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    original.set(mesh.uuid, {mesh, matrix: mesh.matrix.clone(), world: mesh.matrixWorld.clone(), visible: mesh.visible,
      instances: mesh.isInstancedMesh ? mesh.instanceMatrix.array.slice() : null,
      moving: new Set((mesh.userData.archiveMotionInstances || []).flatMap(part => part.indices)),
      directMoving: Boolean(mesh.userData.archiveMotionPart),
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, value]) => [key, digest(value.array)])),
      index: mesh.geometry.index ? digest(mesh.geometry.index.array) : null});
  });
  check('Four interpreted platforms bind to real existing geometry', () => {
    const parts = rig.stats().movingParts;
    assert.equal(parts.filter(part => part.kind === 'platform').length, 4);
    assert(parts.every(part => part.interpretive === true));
    for (const part of parts) {
      assert(part.instanceCount + part.directMeshCount > 0);
      assert.equal(part.bindings.reduce((sum, binding) => sum + binding.indices.length, 0), part.instanceCount);
      for (const binding of part.bindings) {
        const saved = original.get(binding.meshUuid); assert(saved?.mesh.isInstancedMesh);
        assert(binding.indices.every(index => index >= 0 && index < saved.mesh.count && saved.moving.has(index)));
      }
      assert(part.directMeshUuids.every(uuid => original.get(uuid)?.directMoving));
    }
    assert.equal(rig.stats().largeServiceTowerMotion, false);
  });
  const stationaryState = () => {
    root.updateMatrixWorld(true);
    for (const saved of original.values()) {
      const {mesh} = saved;
      for (const [name, hash] of Object.entries(saved.attributes)) assert.equal(digest(mesh.geometry.attributes[name].array), hash, 'Mesh vertices must not change');
      assert.equal(mesh.geometry.index ? digest(mesh.geometry.index.array) : null, saved.index);
      if (!saved.directMoving) {
        assert.deepEqual(mesh.matrix.toArray(), saved.matrix.toArray());
        assert.deepEqual(mesh.matrixWorld.toArray(), saved.world.toArray(), 'Fixed mesh and its parent remain in place');
      }
      if (!saved.instances) continue;
      assert(mesh.instanceMatrix.array.every(Number.isFinite));
      for (let index = 0; index < mesh.count; index++) if (!saved.moving.has(index)) {
        assert.deepEqual(mesh.instanceMatrix.array.slice(index * 16, (index + 1) * 16), saved.instances.slice(index * 16, (index + 1) * 16), 'Fixed instance must be bit-for-bit unchanged');
      }
    }
  };
  const motionSnapshot = () => [...original.values()].filter(saved => saved.moving.size || saved.directMoving).map(saved => ({
    uuid: saved.mesh.uuid, instance: saved.mesh.isInstancedMesh ? digest(saved.mesh.instanceMatrix.array) : null, matrix: saved.mesh.matrix.toArray()}));
  const rest = motionSnapshot();
  check('Actual moving matrices change while all other structures remain fixed', () => {
    for (const time of [-90, -52.25, -40, -8, -2, 0, 1.2, 3, 12, 75]) {
      rig.seek(time); stationaryState();
      assert(rig.stats().movingParts.every(part => part.delta.every(Number.isFinite) && part.progress >= 0 && part.progress <= 1));
    }
    assert.notDeepEqual(motionSnapshot(), rest);
  });
  check('Reverse seeking and resetting restore real geometry exactly', () => {
    rig.seek(3); const afterLiftoff = motionSnapshot();
    rig.seek(-90); assert.deepEqual(motionSnapshot(), rest);
    rig.seek(3); assert.deepEqual(motionSnapshot(), afterLiftoff);
    assert.equal(rig.stats().temporaryLinkage.meshCount, 3);
    rig.reset(); assert.deepEqual(motionSnapshot(), rest); stationaryState();
    assert.equal(root.getObjectByName('110 · временный водородный механизм'), undefined);
    assert.equal(rig.stats().active, false); assert.equal(rig.stats().temporaryLinkage.active, false);
    for (const saved of original.values()) {
      assert.equal(saved.mesh.visible, saved.visible);
      assert.deepEqual(saved.mesh.matrix.toArray(), saved.matrix.toArray());
      if (saved.instances) assert.deepEqual(saved.mesh.instanceMatrix.array, saved.instances);
    }
  });
  check('Each of the three FX channels follows an actual open concrete trench', () => {
    assert.equal(rig.channels.length, 3);
    const ray = new THREE.Raycaster(), probes = [];
    root.updateMatrixWorld(true);
    for (const channel of rig.channels) {
      const throat = new THREE.Vector3(...channel.throat), outlet = new THREE.Vector3(...channel.outlet);
      assert(throat.distanceTo(outlet) > 100); assert(channel.width > 0);
      for (const fraction of [.25, .5, .8]) {
        const p = throat.clone().lerp(outlet, fraction); p.y = 70;
        ray.set(root.localToWorld(p), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObject(root, true);
        assert(hits.length && hits[0].point.y < 0, 'The channel centre cannot be sealed by apron or service structures');
        const expectedY = throat.y + (outlet.y - throat.y) * fraction;
        assert(Math.abs(hits[0].point.y / .14 - expectedY) < .001, 'The actual merged floor must follow the channel slope');
        probes.push({id: channel.id, fraction, firstHitY: hits[0].point.y / .14});
      }
    }
    report.channelProbes = probes;
  });

  const documents = await Promise.all(['index.html', 'museum.html', 'workshop.html', 'src/archive-models.js', 'src/buran-launch.js'].map(file => readFile(file, 'utf8')));
  check('All production entry points use one shared site110 module identity', () => {
    const tokens = documents.flatMap(text => [...text.matchAll(/site110\.js\?v=([^'"\s]+)/g)].map(match => match[1]));
    assert(tokens.length >= documents.length); assert.equal(new Set(tokens).size, 1, 'A second URL creates an empty independent rig registry');
    assert.equal(documents[0], documents[1], 'Museum and index entry points stay identical');
    for (const html of documents.slice(0, 3)) {
      assert(/import\(['"]\.\/src\/buran-launch\.js\?v=/.test(html), 'The reconstruction controller must load only on demand');
      assert(!/import\s+[^;\n]*\s+from\s+['"]\.\/src\/buran-launch\.js/.test(html));
    }
  });
  report.rig = rig.stats(); report.passed = true;
} catch (error) {
  report.error = error.stack; throw error;
} finally {
  getSite110LaunchRig(root)?.reset();
  await writeFile('qa-buran-launch/source-report.json', JSON.stringify(report, null, 2));
}
console.log('BURAN_LAUNCH_SOURCE_PASS', report.checks.length);
