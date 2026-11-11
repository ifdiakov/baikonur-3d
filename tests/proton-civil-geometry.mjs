import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import * as THREE from 'three';
import {PROTON_CIVIL_VERSION} from '../src/proton-site-civil.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {createTerrainVoids} from '../src/terrain-voids.js';

// Self-contained so Playwright can run this same measurement against the real
// full-museum meshes. Metadata chooses probes; intersections and actual buffer
// transforms decide whether the entrances, cover and paths physically exist.
export function measureProtonCivil(options) {
  const seam = globalThis.__PROTON_TEST, T = options.THREE || seam?.THREE;
  const root = options.root || seam?.objects.find(o => o.record.id === options.siteId)?.g;
  if (!root || !T) throw new Error('The actual Proton site root is missing');
  root.updateWorldMatrix(true, true);
  const meta = root.userData.protonCivil;
  if (!meta) throw new Error('The actual site has no Proton civil model');
  const civilGroups = []; root.traverse(o => {if (o.userData.museumComponent === 'proton-civil') civilGroups.push(o);});
  if (civilGroups.length !== 1) throw new Error('Exactly one civil geometry group is required');
  const civil = civilGroups[0], inverse = root.matrixWorld.clone().invert();
  const matrix = new T.Matrix4(), instance = new T.Matrix4(), point = new T.Vector3(), bounds = new T.Box3();
  const geometrySnapshot = [], meshes = [], materials = new Set(), geometries = new Set();
  const visible = object => {for (let o = object; o; o = o.parent) if (!o.visible) return false; return true;};
  const fingerprint = array => {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength); let h = 2166136261;
    for (const byte of bytes) h = Math.imul(h ^ byte, 16777619); return (h >>> 0).toString(16);
  };
  let finite = true, drawCalls = 0, triangles = 0, instances = 0, visibleMeshes = 0;
  civil.traverse(mesh => {
    if (!mesh.isMesh) return; meshes.push(mesh);
    const g = mesh.geometry, n = mesh.isInstancedMesh ? mesh.count : 1, effectiveVisible = visible(mesh);
    geometries.add(g); for (const m of [mesh.material].flat()) materials.add(m);
    for (const attr of Object.values(g.attributes)) for (const value of attr.array) if (!Number.isFinite(value)) finite = false;
    if (g.index) for (const index of g.index.array) if (index >= g.attributes.position.count) finite = false;
    const local = new T.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
    for (let i = 0; i < n; i++) {
      matrix.copy(local); if (mesh.isInstancedMesh) {mesh.getMatrixAt(i, instance); matrix.multiply(instance);}
      if (!matrix.elements.every(Number.isFinite) || Math.abs(matrix.determinant()) < 1e-10) finite = false;
      for (let j = 0; j < g.attributes.position.count; j++) bounds.expandByPoint(point.fromBufferAttribute(g.attributes.position, j).applyMatrix4(matrix));
    }
    if (effectiveVisible) {
      visibleMeshes++; drawCalls += Array.isArray(mesh.material) ? g.groups.length || 1 : 1;
      triangles += (g.index?.count || g.attributes.position.count) / 3 * n; instances += n;
    }
    geometrySnapshot.push({name: mesh.name, parent: mesh.parent.name, visible: effectiveVisible,
      positions: fingerprint(g.attributes.position.array), indices: g.index ? fingerprint(g.index.array) : null,
      instances: n, instanceMatrix: mesh.isInstancedMesh ? fingerprint(mesh.instanceMatrix.array) : null,
      localMatrix: local.elements.map(value => Math.round(value * 1e10) / 1e10)});
  });
  const ray = (origin, direction, far = 30) => {
    const from = new T.Vector3(...origin), unit = new T.Vector3(...direction).normalize();
    const worldFrom = from.clone().applyMatrix4(root.matrixWorld), worldDirection = from.add(unit).applyMatrix4(root.matrixWorld).sub(worldFrom);
    const scale = worldDirection.length(); worldDirection.normalize();
    return new T.Raycaster(worldFrom, worldDirection, 0, far * scale).intersectObjects(meshes, false).filter(hit => visible(hit.object)).map(hit => ({
      pointLocal: hit.point.clone().applyMatrix4(inverse).toArray(), pointWorld: hit.point.toArray(), distance: hit.distance / scale,
      mesh: hit.object.name, instanceId: hit.instanceId ?? null,
      terrainMasked: [hit.object.material].flat().some(m => m.customProgramCacheKey().includes('museum-voids')),
    }));
  };
  const verticalProbe = probe => ({...probe, ...(ray(probe.origin, probe.direction, 12)[0] || {pointLocal: null, pointWorld: null})});
  const sampleSegment = (a, b, step = 2, includeEnds = true) => {
    const n = Math.max(2, Math.ceil(Math.hypot(...b.map((v, i) => v - a[i])) / step)), samples = [];
    for (let i = includeEnds ? 0 : 1; i <= (includeEnds ? n : n - 1); i++) samples.push(a.map((v, k) => v + (b[k] - v) * i / n));
    return samples;
  };
  const surfaceSample = expected => ({expected,
    ...(ray([expected[0], expected[1] + 9, expected[2]], [0, -1, 0], 13)[0] || {pointLocal: null, pointWorld: null})});
  const shelterProbes = meta.shelters.map(s => {
    const {outside, inside, door} = s.entry.probe, direction = new T.Vector3(...inside).sub(new T.Vector3(...outside));
    const length = direction.length(); direction.normalize();
    const side = new T.Vector3(direction.z, 0, -direction.x), opening = [];
    for (const offset of [-.35, 0, .35]) for (const rise of [-.3, 0, 1]) {
      const start = new T.Vector3(...outside).addScaledVector(side, s.entry.width * offset); start.y += rise;
      opening.push({offset, rise, hits: ray(start.toArray(), direction.toArray(), length - .02)});
    }
    const doorHits = ray(inside, direction.toArray(), 2);
    return {id: s.id, floor: verticalProbe(s.floorProbe), roof: verticalProbe(s.roofProbe), opening,
      door: {expected: door, ...(doorHits[0] || {pointLocal: null, pointWorld: null})},
      sides: s.sideProbes.map(p => ({expectedDistance: p.distance, ...(ray(p.origin, p.direction, p.distance + 1)[0] || {pointLocal: null})})),
      ramp: s.ramp.centreline.slice(1).flatMap((end, index) => sampleSegment(s.ramp.centreline[index], end, 1, false).map(surfaceSample))};
  });
  // Resample complete centreline segments independently of declared samples.
  // This catches gaps, a neighboring mound crossing a path and a narrow corner.
  const pathProbes = meta.paths.map(path => {
    const samples = [];
    for (let i = 1; i < path.centreline.length; i++) {
      const a = path.centreline[i - 1], b = path.centreline[i], dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
      if (length < 1e-6) continue;
      for (const expected of sampleSegment(a, b, 3, false)) for (const side of [-.3, 0, .3]) {
        samples.push(surfaceSample([expected[0] - dz / length * path.width * side, expected[1], expected[2] + dx / length * path.width * side]));
      }
      // Junction centres are sampled once; edge miter shape may change here.
      samples.push(surfaceSample(a), surfaceSample(b));
    }
    return {id: path.id, samples};
  });
  const buildings = meta.surfaceBuildings.map(building => ({id: building.id,
    expectedRoofY: meta.gradeY + building.height + .25,
    ...surfaceSample([building.position[0], meta.gradeY + building.height + .25, building.position[2]])}));
  const declaredMasks = [];
  root.traverse(owner => {
    for (const shape of owner.userData.archiveCutouts || []) {
      if (shape.source !== 'Photo-interpreted shallow shelter entrance; not a launch flame channel') continue;
      const matrix = inverse.clone().multiply(owner.matrixWorld);
      const polygon = shape.polygon.map(([x, z]) => new T.Vector3(x, 0, z).applyMatrix4(matrix)).map(p => [p.x, p.z]);
      const world = shape.polygon.map(([x, z]) => new T.Vector3(x, 0, z).applyMatrix4(owner.matrixWorld));
      declaredMasks.push({id: shape.id, polygon, worldBounds: [Math.min(...world.map(p => p.x)), Math.min(...world.map(p => p.z)),
        Math.max(...world.map(p => p.x)), Math.max(...world.map(p => p.z))]});
    }
  });
  const runtimeVoids = seam?.portalVoids?.stats(), registeredMasks = runtimeVoids ? runtimeVoids.items.filter(item =>
    item.shape.source === 'Photo-interpreted shallow shelter entrance; not a launch flame channel' && meta.shelters.some(s => s.id === item.shape.id)) : null;
  const anchors = []; civil.traverse(o => {if (o.userData.museumComponent === 'proton-civil-shelter') anchors.push({id: o.userData.shelterId, visible: visible(o)});});
  return {siteId: meta.siteId, metadata: JSON.parse(JSON.stringify(meta)), root: {position: root.position.toArray(), scale: root.scale.toArray(), yaw: root.rotation.y},
    civil: {groupCount: civilGroups.length, directChild: civil.parent === root, visible: visible(civil), anchors,
      finite, drawCalls, triangles, instances, visibleMeshes, meshes: meshes.length, geometries: geometries.size, materials: materials.size,
      bounds: {min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new T.Vector3()).toArray()}},
    geometrySnapshot, probes: {shelters: shelterProbes, paths: pathProbes, buildings}, declaredMasks, registeredMasks,
    maskMaterials: runtimeVoids?.materials ?? null,
    terrainMaskKind: 'GPU fragment discard; CPU ground-plane intersections do not prove a rendered excavation'};
}

const close = (actual, expected, epsilon, message) => assert(Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon,
  `${message}: expected ${expected}, actual ${actual}`);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
export function assertProtonCivil(report) {
  const {siteId, metadata: meta, civil, probes} = report;
  const expectedShelters = {'pad-81': 9, 'pad-200': 8}[siteId]; assert(expectedShelters, 'Known calibrated Proton site');
  assert.equal(meta.version, PROTON_CIVIL_VERSION); assert.equal(meta.units, 'metres'); assert.equal(meta.gradeY, -.25);
  const archive = ARCHIVE_MAP.find(entry => entry.id === siteId); assert(archive);
  assert.deepEqual(archive.sourceImage, siteId === 'pad-81' ? [1890, 1528] : [2258, 1586]);
  assert.deepEqual(archive.reviewImage, [Math.round(archive.sourceImage[0] / archive.sourceImage[1] * 1000), 1000]);
  assert.equal(archive.reviewResize, 'preserve-aspect-height-1000');
  assert.deepEqual(meta.planCalibration.sourceSize, archive.sourceImage); assert.equal(meta.planCalibration.reviewHeight, 1000);
  assert.equal(meta.planCalibration.sourcePlan, archive.satellite);
  assert.deepEqual(report.root.scale, [archive.scale, archive.scale, archive.scale]); assert.equal(report.root.yaw, archive.yaw);
  close(report.root.position[1] + meta.gradeY * report.root.scale[1], -2.755, 1e-8, 'Civil grade matches the full museum terrain datum');
  assert.equal(civil.groupCount, 1); assert(civil.directChild && civil.visible, 'Civil works are outside the replaceable launch GLB');
  assert(civil.finite); assert.equal(civil.meshes, civil.visibleMeshes, 'All civil mesh batches remain visible');
  assert(civil.drawCalls > 0 && civil.drawCalls <= 20, 'Civil detail is batched, with no mesh per primitive');
  assert(civil.triangles > 1000 && civil.triangles < 25000); assert(civil.instances > expectedShelters * 10);
  assert(civil.bounds.size.every(n => Number.isFinite(n) && n > 0)); assert(civil.bounds.size[1] < 10, 'The photo additions remain low structures');
  assert.equal(meta.shelters.length, expectedShelters); assert.equal(probes.shelters.length, expectedShelters);
  assert.deepEqual(civil.anchors.map(a => a.id).sort(), meta.shelters.map(s => s.id).sort()); assert(civil.anchors.every(a => a.visible));
  assert.equal(report.declaredMasks.length, expectedShelters);
  assert.equal(meta.sourceVehicleAndLaunchGeometryChanged, false); assert.equal(meta.legacyMapVaultsReplaced, true);
  for (const shelter of meta.shelters) {
    const p = probes.shelters.find(probe => probe.id === shelter.id); assert(p);
    assert.equal(shelter.entry.doorState, 'recessed-closed'); assert.equal(shelter.entry.probe.space, 'site-local-metres');
    assert(shelter.floorY < meta.gradeY - .4 && shelter.floorY >= meta.gradeY - 1, 'Only shallow photo-interpreted entrance sills are recessed');
    assert(shelter.roofY > meta.gradeY + 2.5 && shelter.roofY < meta.gradeY + 6);
    assert(p.floor.pointLocal && p.roof.pointLocal, 'The actual vestibule floor and earth crown must be hit: ' + shelter.id);
    close(p.floor.pointLocal[1], shelter.floorY, .015, shelter.id + ' floor under roof');
    close(p.roof.pointLocal[1], shelter.roofY, .08, shelter.id + ' earth-covered crown');
    assert.equal(p.floor.terrainMasked, false, 'The terrain discard must never erase the shelter floor');
    assert(p.opening.length === 9 && p.opening.every(probe => !probe.hits.length),
      'The entrance has real clear width and height: ' + shelter.id + ' ' + JSON.stringify(p.opening.filter(probe => probe.hits.length)));
    assert(p.door.pointLocal, 'The closed door is a real surface recessed beyond the open vestibule: ' + shelter.id);
    assert(distance(p.door.pointLocal, p.door.expected) < .2, 'Recessed door surface agrees with its physical probe: ' + shelter.id);
    assert.equal(p.sides.length, 2);
    for (const side of p.sides) {assert(side.pointLocal); close(side.distance, side.expectedDistance, .025, shelter.id + ' actual wall spacing');}
    assert(p.ramp.length >= 4);
    for (const sample of p.ramp) {
      assert(sample.pointLocal, 'Continuous shallow ramp surface: ' + shelter.id);
      close(sample.pointLocal[1], sample.expected[1], .14, shelter.id + ' ramp follows its slope');
    }
    const path = meta.paths.find(path => path.id === shelter.pathId); assert(path, 'Every shelter has a real connected approach: ' + shelter.id);
    assert(distance(path.centreline[0], shelter.approach) < .01, 'The footpath meets the ramp of ' + shelter.id);
    const rampStart = shelter.ramp.centreline[0]; assert(distance(rampStart, shelter.approach) <= .15, 'No gap or large step between walkway and ramp');
    const network = meta.paths.filter(other => other.id.startsWith('plan-walk-'));
    assert(network.some(other => other.centreline.some(point => distance(point, path.centreline.at(-1)) < .01)), 'An approach joins the traced walkway network');
    const mask = report.declaredMasks.find(mask => mask.id === shelter.id); assert(mask);
    assert.equal(mask.polygon.length, shelter.cutoutPolygon.length);
    for (let i = 0; i < mask.polygon.length; i++) assert(distance(mask.polygon[i], shelter.cutoutPolygon[i]) < 1e-6, 'Entrance mask follows the actual shelter frame');
  }
  assert(probes.paths.length > expectedShelters, 'Both local approaches and the plan walkways are built');
  for (const path of probes.paths) {
    assert(path.samples.length >= 5, 'Every path has independently resampled physical probes');
    for (const sample of path.samples) {
      assert(sample.pointLocal, 'The actual walkway has a gap: ' + path.id + ' ' + JSON.stringify(sample.expected));
      close(sample.pointLocal[1], sample.expected[1], .035, 'Walkway is continuous and clear of neighboring structures: ' + path.id + ' ' + JSON.stringify(sample.expected));
    }
  }
  assert.equal(probes.buildings.length, siteId === 'pad-81' ? 2 : 1);
  for (const building of probes.buildings) {assert(building.pointLocal); close(building.pointLocal[1], building.expectedRoofY, .015, 'Separate low service building ' + building.id);}
  if (report.registeredMasks !== null) {
    assert(report.maskMaterials > 0, 'The actual full museum terrain has the discard shader');
    assert.equal(report.registeredMasks.length, expectedShelters, 'Every shallow entry cutout is registered in the full museum');
    for (const mask of report.declaredMasks) {
      const runtime = report.registeredMasks.find(item => item.shape.id === mask.id); assert(runtime); assert.equal(runtime.enabled, 1);
      for (let i = 0; i < 4; i++) close(runtime.bounds[i], mask.worldBounds[i], .0011, 'The active cutout uses the actual world bounds');
    }
  }
}

export function checkProtonCivilRoot(root) {
  const report = measureProtonCivil({THREE, root}); assertProtonCivil(report);
  const voids = createTerrainVoids(); root.traverse(owner => {for (const shape of owner.userData.archiveCutouts || []) voids.add(owner, shape);});
  const material = new THREE.MeshStandardMaterial(), shader = {uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <clipping_planes_fragment>'};
  voids.mask(material); material.onBeforeCompile(shader);
  assert(shader.vertexShader.includes('vMuseumTerrainWorld=(modelMatrix*museumTerrainPoint).xyz'));
  assert(shader.fragmentShader.includes('discard;') && shader.fragmentShader.includes('Contains(q.xz)'));
  const entries = voids.stats().items; assert.equal(entries.length, report.declaredMasks.length + 2, 'New shallow sills and both original launch pits are registered once');
  const inverses = Object.entries(shader.uniforms).filter(([name]) => name.endsWith('Inverse'));
  assert.equal(inverses.length, entries.length);
  const before = inverses.map(([, uniform]) => uniform.value.clone()), originalY = root.position.y;
  try {
    root.position.y += 1; voids.update();
    for (const [i, [, uniform]] of inverses.entries()) assert(!uniform.value.equals(before[i]), 'Terrain discard follows workshop height edits');
  } finally {root.position.y = originalY; voids.update(); material.dispose();}
  for (const [i, [, uniform]] of inverses.entries()) assert(uniform.value.equals(before[i]), 'Restoring height also restores the exact terrain-mask transform');
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const {protonComplex} = await import('../src/archive-launches.js');
  for (const siteId of ['pad-81', 'pad-200']) {
    const root = new THREE.Group(); root.position.set(123, -2.72, -234); root.scale.setScalar(.14); protonComplex(root, siteId);
    const report = checkProtonCivilRoot(root);
    console.log('PROTON_CIVIL_GEOMETRY_OK', JSON.stringify({siteId, ...report.civil, shelters: report.probes.shelters.length,
      paths: report.probes.paths.length, entryMasks: report.declaredMasks.length}));
  }
}
