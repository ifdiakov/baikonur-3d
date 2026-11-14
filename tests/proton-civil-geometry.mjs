import assert from 'node:assert/strict';
import {isMapSiteHidden,REMOVED_MAP_GROUPS} from '../src/map-visible-sites.js';

export function protonNeighborContract(siteId){
 const candidates={'pad-81':['pad-82','pad-84','sector-nw2'],'pad-200':['pad-201','pad-202']}[siteId];
 assert(candidates,'Known Proton neighborhood');
 const excluded=candidates.filter(id=>isMapSiteHidden(id)||REMOVED_MAP_GROUPS.some(([removed])=>removed===id));
 assert.deepEqual(excluded,siteId==='pad-81'?['pad-84','sector-nw2']:[],'Approved hiding policy must be reviewed if changed');
 return {neighbors:candidates.filter(id=>!excluded.includes(id)),excludedNeighbors:excluded};
}

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

// Only the five generic neighbors implicated by the first candidate's plan
// images. This checks their rendered geometry, not their declared scale.
export function measureProtonNeighborClearance(options) {
  const seam = globalThis.__PROTON_TEST, T = options.THREE || seam?.THREE, objects = options.objects || seam?.objects;
  const ids = options.neighbors;
  if(!Array.isArray(ids)||!Array.isArray(options.excludedNeighbors))throw new Error('Explicit current neighbor contract required');
  for(const id of options.excludedNeighbors)if(objects?.some(o=>o.record.id===id))throw new Error('Intentionally hidden neighbor restored: '+id);
  if (!ids || !T || !objects) throw new Error('Missing Proton neighbor measurement context');
  const root = objects.find(o => o.record.id === options.siteId)?.g;
  if (!root?.userData.protonCivil) throw new Error('Missing actual Proton civil root');
  root.updateWorldMatrix(true, true);
  const meta = root.userData.protonCivil, civilMeshes = [], neighborMeshes = [], owners = new Map();
  const visible = mesh => {
    for (let o = mesh; o; o = o.parent) if (!o.visible) return false;
    return [mesh.material].flat().some(material => material?.visible !== false);
  };
  root.traverse(group => {
    if (group.userData.museumComponent === 'proton-civil') group.traverse(mesh => {if (mesh.isMesh && visible(mesh)) civilMeshes.push(mesh);});
  });
  if (!civilMeshes.length) throw new Error('No visible civil geometry to protect');
  const union = new T.Box3(); for (const mesh of civilMeshes) union.union(new T.Box3().setFromObject(mesh, true));
  const civilTop = union.max.y, scale = root.getWorldScale(new T.Vector3()).y, neighbors = [];
  for (const id of ids) {
    const neighbor = objects.find(o => o.record.id === id)?.g; if (!neighbor) throw new Error('Missing neighboring site ' + id);
    neighbor.updateWorldMatrix(true, true); let meshes = 0;
    neighbor.traverse(mesh => {
      if (!mesh.isMesh || !visible(mesh)) return;
      meshes++; neighborMeshes.push(mesh); owners.set(mesh, id); union.union(new T.Box3().setFromObject(mesh, true));
    });
    neighbors.push({id, visibleMeshes: meshes, position: neighbor.getWorldPosition(new T.Vector3()).toArray(),
      worldScale: neighbor.getWorldScale(new T.Vector3()).toArray(), blockedSamples: 0});
  }
  const down = new T.Vector3(0, -1, 0), surfaces = [], features = [];
  for (const path of options.pathProbes || []) {
    const feature = {id: path.id, kind: 'path', attempted: path.samples.length, actualSurfaceSamples: 0, blockedSamples: 0}; features.push(feature);
    for (const sample of path.samples) {
      if (!sample.pointWorld?.every(Number.isFinite)) throw new Error('A path probe has no actual civil surface: ' + path.id);
      surfaces.push({feature, world: sample.pointWorld}); feature.actualSurfaceSamples++;
    }
  }
  const inside = (x, z, polygon) => {
    let yes = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
    }
    return yes;
  };
  for (const [kind, definitions] of [['yard', meta.yards], ['building', meta.surfaceBuildings]]) for (const item of definitions) {
    const polygon = item.footprint, centre = polygon.reduce((sum, p) => [sum[0] + p[0] / polygon.length, sum[1] + p[1] / polygon.length], [0, 0]);
    const contour = polygon.map(p => {const distance = Math.hypot(p[0] - centre[0], p[1] - centre[1]); return p.map((v, i) => v + (centre[i] - v) * Math.min(.3 / distance, .1));});
    const samples = [centre];
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i], b = contour[(i + 1) % contour.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
      for (let j = 0; j < n; j++) samples.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
    }
    // Interior samples also cover rows of separate small buildings whose
    // common catalogue footprint contains open gaps between the buildings.
    const xs = polygon.map(p => p[0]), zs = polygon.map(p => p[1]);
    for (let x = Math.min(...xs) + 3; x < Math.max(...xs); x += 6) for (let z = Math.min(...zs) + 3; z < Math.max(...zs); z += 6) if (inside(x, z, polygon)) samples.push([x, z]);
    const feature = {id: item.id, kind, attempted: samples.length, actualSurfaceSamples: 0, blockedSamples: 0}; features.push(feature);
    for (const [x, z] of samples) {
      const p = root.localToWorld(new T.Vector3(x, 0, z)); p.y = civilTop + scale * 2;
      const hit = new T.Raycaster(p, down, 0, 16 * scale).intersectObjects(civilMeshes, false)[0];
      if (!hit) continue; // Empty gaps are not claimed to be a roof or slab.
      surfaces.push({feature, world: hit.point.toArray()}); feature.actualSurfaceSamples++;
    }
  }
  const blockers = [], epsilon = scale * .03, top = union.max.y + scale * 2; let blockedSamples = 0;
  for (const sample of surfaces) {
    const [x, y, z] = sample.world, ray = new T.Raycaster(new T.Vector3(x, top, z), down, 0, top - y);
    const hit = ray.intersectObjects(neighborMeshes, false).find(hit => hit.point.y > y + epsilon);
    if (!hit) continue;
    const id = owners.get(hit.object); blockedSamples++; sample.feature.blockedSamples++; neighbors.find(neighbor => neighbor.id === id).blockedSamples++;
    if (blockers.length < 48) blockers.push({neighbor: id, feature: sample.feature.id, kind: sample.feature.kind,
      surfaceWorld: sample.world, obstacleWorld: hit.point.toArray(), excessHeightMetres: (hit.point.y - y) / scale,
      mesh: hit.object.name || hit.object.geometry.type, instanceId: hit.instanceId ?? null});
  }
  return {siteId: options.siteId, neighbors, excludedNeighbors:options.excludedNeighbors, features, testedSurfaceSamples: surfaces.length, blockedSamples, blockers,
    verticalToleranceMetres: .03, method: 'Actual visible neighboring meshes above independently measured civil surfaces; no scale-only assertions'};
}

export function assertProtonNeighborClearance(report) {
  const contract=protonNeighborContract(report.siteId),expected=contract.neighbors;
  assert.deepEqual(report.excludedNeighbors,contract.excludedNeighbors);
  assert.deepEqual(report.neighbors.map(neighbor => neighbor.id), expected);
  assert(report.features.some(feature => feature.kind === 'path') && report.features.some(feature => feature.kind === 'yard') && report.features.some(feature => feature.kind === 'building'));
  for (const feature of report.features) assert(feature.actualSurfaceSamples >= 4, 'Physical surfaces were sampled for ' + feature.id);
  assert(report.testedSurfaceSamples > 100);
  assert.equal(report.blockedSamples, 0, 'Neighboring generic geometry covers Proton civil detail: ' + JSON.stringify(report.blockers));
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

