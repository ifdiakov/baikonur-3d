import * as THREE from 'three';

// SDI, photographic reconstruction of the present closed-gate condition.
// Owner's Drive folder: 1a4VpXEGG-mpSwTvBy-Nb0GBIY4KUKR09, refreshed 2026-10-30.
// Side walls: 1623489.jpg, 23479382228_1341dc3c8c_b.jpg, photo130.jpg.
// Closed gate / projecting guide: img_4162-4-2-5.jpg; back: 392115334410.7004.webp.
// Historical open-gate photographs ror52zrd5ze31hyvs8.jpg.webp and
// mx1w370o8tyk2l8ef7.jpg.webp clarify the door framing and upper guide; they
// do not establish a current rocket display or a free-standing rooftop crane.
// The nominal dimensions below are photographic proportions, not a survey.
export const SDI_PHOTO_REVISION = '20261030-closed-gate-photo-v3';

/**
 * Add the SDI stand to an archiveKit without finishing its instance batches.
 * The closed steel gate faces +Z. Width/depth/height scale the complete
 * nominal 52 x 46 x 118 model, including its attached services and door guide.
 * x/z/yaw place it inside the exhibit root; returned points are root-local.
 */
export function buildSdiStand(k, {
  x = 0, z = 0, yaw = 0, width = 52, depth = 46, height = 118
} = {}) {
  const group = new THREE.Group();
  group.name = 'СДИ · светлый корпус и закрытые откатные ворота';
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  group.scale.set(width / 52, height / 118, depth / 46);
  k.root.add(group);
  const box = (w, h, d, px, py, pz, material, tag) =>
    k.box(w, h, d, px, py, pz, material, tag, 0, group);
  const rod = (a, b, radius, material, tag) =>
    k.rod(a, b, radius, material, tag, group);

  const W = 52, D = 46, H = 118, front = D / 2;
  const gateBottom = 1.7, gateTop = 101.4, gateWidth = 43.6;
  const gateHeight = gateTop - gateBottom, levels = 24, bays = 4;

  // A tall enclosed test hall: three pale walls, rather than a lattice tower.
  // Separate walls retain the depth behind the framed sliding door.
  box(W + 3.2, 1.1, D + 3.2, 0, .55, 0, 'concrete', 'sdi-foundation');
  for (const side of [-1, 1]) {
    box(2.4, H - 1.1, D, side * (W / 2 - 1.2), (H + 1.1) / 2, 0,
      'light', 'sdi-closed-side-wall');
  }
  box(W - 4.8, H - 1.1, 2.4, 0, (H + 1.1) / 2, -D / 2 + 1.2,
    'light', 'sdi-closed-rear-wall');
  box(W + .6, .65, D + .6, 0, H + .025, 0,
    'wall', 'sdi-flat-roof');
  box(W + 3.2, 16.6, 8.4, 0, H - 8.3, front + .8,
    'light', 'sdi-overhanging-white-head');
  for (const side of [-1, 1]) {
    box(4.2, gateTop - 1.1, 4.6, side * (W / 2 - 2.1), (gateTop + 1.1) / 2,
      front - .2, 'light', 'sdi-front-concrete-pier');
  }
  box(gateWidth, 1.1, 4.5, 0, 1.2, front + .6,
    'rust', 'sdi-gate-threshold');

  // Sparse panel joints remain subordinate to the large white silhouette.
  for (let y = 6.5; y < H; y += 6.5) {
    for (const side of [-1, 1]) {
      box(.09, .085, D - .2, side * (W / 2 + .045), y, 0,
        'concrete', 'sdi-concrete-horizontal-joint');
    }
    box(W - .1, .085, .09, 0, y, -D / 2 - .045,
      'concrete', 'sdi-concrete-horizontal-joint');
  }
  for (let zz = -D / 2 + 7.7; zz < D / 2; zz += 7.7) {
    for (const side of [-1, 1]) {
      box(.085, H - 1, .065, side * (W / 2 + .05), H / 2, zz,
        'wall', 'sdi-concrete-vertical-joint');
    }
  }
  for (let xx = -W / 2 + 8.7; xx < W / 2; xx += 8.7) {
    box(.065, H - 1, .085, xx, H / 2, -D / 2 - .05,
      'wall', 'sdi-concrete-vertical-joint');
  }
  for (const y of [106.7, 112.6]) {
    box(W + 3.1, .09, .12, 0, y, front + 5.04,
      'wall', 'sdi-head-panel-joint');
  }

  // Two very narrow full-height glazed slots on each long side, and the
  // single rear slot visible in the elevated photograph. Their pale small
  // transoms distinguish glazing from a painted black stripe.
  const slotBottom = 9.6, slotTop = 111.8, slotHeight = slotTop - slotBottom;
  for (const side of [-1, 1]) {
    for (const zz of [-7.5, 7.6]) {
      box(.16, slotHeight + .5, 2.35, side * (W / 2 + .11),
        (slotBottom + slotTop) / 2, zz, 'dark', 'sdi-side-slot-recess');
      box(.12, slotHeight, 1.94, side * (W / 2 + .205),
        (slotBottom + slotTop) / 2, zz, 'glass', 'sdi-vertical-glazing-slot');
      for (const edge of [-1, 1]) {
        box(.22, slotHeight + .3, .105, side * (W / 2 + .27),
          (slotBottom + slotTop) / 2, zz + edge * 1.03,
          'wall', 'sdi-slot-edge-frame');
      }
      box(.23, slotHeight, .075, side * (W / 2 + .28),
        (slotBottom + slotTop) / 2, zz, 'steel', 'sdi-slot-centre-mullion');
      for (let yy = slotBottom + 2.2; yy < slotTop; yy += 2.2) {
        box(.24, .105, 2.02, side * (W / 2 + .29), yy, zz,
          'wall', 'sdi-slot-transom');
      }
    }
    // Small high vent and the external vertical service pipe bundle.
    box(.18, 2.1, 1.7, side * (W / 2 + .11), 110.4, -17.5,
      'dark', 'sdi-upper-service-window');
    for (let pipe = 0; pipe < 4; pipe++) {
      const zz = -16.4 + pipe * .52;
      rod([side * (W / 2 + .55), 7.4, zz],
        [side * (W / 2 + .55), H + 2.2 - pipe * .35, zz],
        .12, 'wall', 'sdi-external-service-pipe');
    }
    for (let yy = 9; yy < H; yy += 6.5) {
      box(.7, .16, 2.5, side * (W / 2 + .5), yy, -15.6,
        'concrete', 'sdi-service-pipe-bracket');
    }
  }
  const rearSlotBottom = 32.4, rearSlotTop = 111.8;
  box(2.8, rearSlotTop - rearSlotBottom + .4, .17, 0,
    (rearSlotTop + rearSlotBottom) / 2, -D / 2 - .12,
    'dark', 'sdi-rear-slot-recess');
  box(2.35, rearSlotTop - rearSlotBottom, .13, 0,
    (rearSlotTop + rearSlotBottom) / 2, -D / 2 - .22,
    'glass', 'sdi-rear-vertical-glazing-slot');
  for (let yy = rearSlotBottom + 2.2; yy < rearSlotTop; yy += 2.2) {
    box(2.48, .11, .25, 0, yy, -D / 2 - .28,
      'wall', 'sdi-rear-slot-transom');
  }
  box(.10, rearSlotTop - rearSlotBottom, .26, 0,
    (rearSlotTop + rearSlotBottom) / 2, -D / 2 - .28,
    'steel', 'sdi-rear-slot-mullion');

  // Grey infill panels sit behind the rust-brown structural grid of the
  // closed sliding leaf. Staggered diagonal pairs are the visible bracing,
  // not a substitute open lattice on all four sides of the stand.
  const frameZ = front + 1.55, panelZ = front + .10;
  const stepY = gateHeight / levels, stepX = gateWidth / bays;
  for (let row = 0; row < levels; row++) {
    const y0 = gateBottom + row * stepY;
    for (let bay = 0; bay < bays; bay++) {
      const px = -gateWidth / 2 + (bay + .5) * stepX;
      const material = (row + bay * 2) % 7 === 0 ? 'steel' : 'concrete';
      box(stepX - .50, stepY - .39, .32, px, y0 + stepY / 2,
        panelZ, material, 'sdi-closed-gate-infill');
      for (let rib = 1; rib <= 3; rib++) {
        box(stepX - .58, .085, .17, px, y0 + stepY * rib / 4,
          panelZ + .22, 'steel', 'sdi-gate-sheet-rib');
      }
    }
  }
  for (let bay = 0; bay <= bays; bay++) {
    const px = -gateWidth / 2 + bay * stepX;
    box(.66, gateHeight + .65, 1.3, px, (gateBottom + gateTop) / 2,
      frameZ, 'rust', 'sdi-gate-vertical-frame');
    box(1.05, gateHeight + .7, .22, px, (gateBottom + gateTop) / 2,
      frameZ + .68, 'rust', 'sdi-gate-frame-flange');
  }
  for (let row = 0; row <= levels; row++) {
    const yy = gateBottom + row * stepY;
    box(gateWidth + 1, .52, 1.5, 0, yy, frameZ,
      'rust', 'sdi-gate-horizontal-frame');
    box(gateWidth + 1.2, .18, .35, 0, yy + .31, frameZ + .76,
      'steel', 'sdi-gate-frame-cap');
  }
  for (let row = 0; row < levels; row += 2) {
    const y0 = gateBottom + row * stepY + .28;
    const y1 = gateBottom + (row + 2) * stepY - .28;
    for (let bay = 0; bay < bays; bay++) {
      const x0 = -gateWidth / 2 + bay * stepX + .38;
      const x1 = x0 + stepX - .76;
      rod([x0, y0, frameZ + .84], [x1, y1, frameZ + .84], .16,
        'rust', 'sdi-gate-diagonal-brace');
      rod([x1, y0, frameZ + .84], [x0, y1, frameZ + .84], .16,
        'rust', 'sdi-gate-diagonal-brace');
    }
  }
  // Side-depth ties of the door frame are visible in oblique photographs.
  for (const side of [-1, 1]) {
    const px = side * (gateWidth / 2 + .1);
    for (let row = 0; row < levels; row += 2) {
      const yy = gateBottom + row * stepY;
      rod([px, yy, panelZ - .6], [px, yy + stepY * 2, frameZ + .5],
        .18, 'rust', 'sdi-gate-edge-depth-brace');
    }
  }

  // The surviving horizontal door guide projects sideways just below the
  // white head. Its short top truss is attached to the building: no hoist,
  // operator cabin or speculative yellow bridge crane is added.
  const guideStart = W / 2 - 2, guideEnd = W / 2 + 31;
  const guideY = gateTop + .65, guideTop = guideY + 7.5;
  for (const zz of [front + .1, front + 5.2]) {
    box(guideEnd - guideStart, 1.1, .75, (guideStart + guideEnd) / 2,
      guideY, zz, 'rust', 'sdi-projecting-door-guide');
    rod([guideStart, guideTop, zz], [guideEnd - 7, guideTop, zz],
      .37, 'rust', 'sdi-guide-upper-chord');
    rod([guideEnd - 7, guideTop, zz], [guideEnd, guideY + .5, zz],
      .32, 'rust', 'sdi-guide-end-diagonal');
    const nodes = [guideStart, guideStart + 8.6, guideStart + 17.2, guideEnd - 7];
    for (let i = 0; i < nodes.length; i++) {
      rod([nodes[i], guideY + .5, zz], [nodes[i], guideTop, zz],
        .27, 'rust', 'sdi-guide-vertical');
      if (i + 1 < nodes.length) {
        rod([nodes[i], i % 2 ? guideTop : guideY + .5, zz],
          [nodes[i + 1], i % 2 ? guideY + .5 : guideTop, zz],
          .28, 'rust', 'sdi-guide-diagonal');
      }
    }
  }
  for (let xx = guideStart; xx < guideEnd; xx += 5.5) {
    box(.36, .42, 6.4, xx, guideY - .18, front + 2.65,
      'rust', 'sdi-guide-cross-tie');
  }

  // Asymmetric rear services seen from both sides. They stop behind the
  // main gate plane, leaving the full-height entrance unobstructed.
  const office = {x: 35.5, z: -9, w: 21, d: 30, h: 20.2};
  box(office.w, office.h, office.d, office.x, office.h / 2, office.z,
    'wall', 'sdi-control-annex');
  box(office.w + .8, .6, office.d + .8, office.x, office.h + .3, office.z,
    'concrete', 'sdi-control-annex-roof');
  for (let floor = 0; floor < 4; floor++) {
    const yy = 3.2 + floor * 4.45;
    for (let bay = 0; bay < 5; bay++) {
      const xx = office.x - office.w / 2 + 2.2 + bay * 4.1;
      box(2.4, 2.5, .22, xx, yy, office.z + office.d / 2 + .13,
        'dark', 'sdi-control-annex-window');
      box(.10, 2.5, .28, xx, yy, office.z + office.d / 2 + .28,
        'wall', 'sdi-annex-window-mullion');
    }
    for (let bay = 0; bay < 7; bay++) {
      const zz = office.z - office.d / 2 + 2.6 + bay * 4.1;
      box(.22, 2.5, 2.4, office.x + office.w / 2 + .13, yy, zz,
        'dark', 'sdi-control-annex-side-window');
    }
    box(office.w + .2, .24, .35, office.x, yy - 1.55,
      office.z + office.d / 2 + .15, 'concrete', 'sdi-control-annex-floor-band');
  }
  box(5.5, 3.6, .3, office.x + 1, 1.8, office.z + office.d / 2 + .2,
    'dark', 'sdi-control-annex-door');
  box(7, .35, 2.4, office.x + 1, 4.1, office.z + office.d / 2 + 1,
    'concrete', 'sdi-control-annex-porch');
  const service = {x: -1, z: -36, w: 76, d: 23, h: 10.5};
  box(service.w, service.h, service.d, service.x, service.h / 2, service.z,
    'light', 'sdi-low-rear-service-wing');
  box(service.w + .9, .55, service.d + .9, service.x, service.h + .275, service.z,
    'roof', 'sdi-low-service-roof');
  box(service.w - 3, .9, .22, service.x, 8.1, service.z - service.d / 2 - .13,
    'glass', 'sdi-rear-service-window-ribbon');
  for (let xx = service.x - service.w / 2 + 5; xx < service.x + service.w / 2 - 2; xx += 10.5) {
    box(6.2, 2.5, .25, xx, 2.2, service.z - service.d / 2 - .16,
      'dark', 'sdi-rear-service-ground-window');
    box(.28, service.h, .30, xx - 4.8, service.h / 2,
      service.z - service.d / 2 - .16, 'wall', 'sdi-rear-service-pilaster');
  }
  // The rear lower sheet-metal enclosure under the single glazing slot.
  box(W - 1, 19.6, .36, 0, 21.2, -D / 2 - .26,
    'steel', 'sdi-rear-lower-metal-cladding');
  for (let xx = -W / 2 + 1; xx < W / 2; xx += 1.5) {
    box(.10, 19.6, .25, xx, 21.2, -D / 2 - .54,
      'roof', 'sdi-rear-cladding-rib');
  }
  for (const [xx, zz] of [[-20, -37], [8, -42], [28, -35]]) {
    box(2, 1.3, 2, xx, service.h + 1.1, zz,
      'concrete', 'sdi-service-roof-vent');
    box(2.7, .25, 2.7, xx, service.h + 1.9, zz,
      'steel', 'sdi-service-vent-cap');
  }

  group.updateMatrix();
  const point = p => new THREE.Vector3(...p).applyMatrix4(group.matrix).toArray();
  return {
    revision: SDI_PHOTO_REVISION,
    position: [x, 0, z], yaw,
    dimensions: {width, depth, height},
    dimensionBasis: 'photo-proportions-approximate',
    state: 'closed-sliding-gate',
    closedWallCount: 3,
    sideGlazingSlots: 4,
    rearGlazingSlots: 1,
    gateLevels: levels,
    gateBays: bays,
    gateFace: '+Z',
    gateThreshold: point([0, 1.2, front + .6]),
    gateCentre: point([0, (gateBottom + gateTop) / 2, frameZ]),
    guideTip: point([guideEnd, guideY, front + 2.65]),
    roofCentre: point([0, H, 0]),
    guideType: 'attached-horizontal-sliding-door-guide',
    detachedCrane: false,
    rocketPresent: false,
    annexes: [office, service].map(a => ({
      center: point([a.x, a.h / 2, a.z]),
      size: [a.w * width / W, a.h * height / H, a.d * depth / D]
    })),
    photoReferences: [
      '1XmeVD5GIK453oImr1ReRdR38WyyR5z3R',
      '183m5J6bYMtuXR6IKg3cCP9PRQl-56cjm',
      '10op0vOetBmAxcj8HuWCZAGYQEW0bUP-2',
      '1I4h885nVNAcSZYPic13iP25sA-LkHqqs',
      '1P02KKMPdBGvbYrwOl-TjuXuxR_unRpmR'
    ]
  };
}
