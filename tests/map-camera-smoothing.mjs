import assert from 'node:assert/strict';
import {MAP_CAMERA_SMOOTHING_VERSION,MUSEUM_DAMPING_AT_60FPS,smoothingAlpha,
 normalizedWheelPixels,wheelZoomScale} from '../src/map-camera-smoothing.js';

assert.match(MAP_CAMERA_SMOOTHING_VERSION,/camera-smoothing/);
assert(MUSEUM_DAMPING_AT_60FPS>0&&MUSEUM_DAMPING_AT_60FPS<.15);
assert.equal(smoothingAlpha(0),0);
assert(smoothingAlpha(1/120)<smoothingAlpha(1/60));
assert(smoothingAlpha(1/60)<smoothingAlpha(1/30));
assert(Math.abs((1-smoothingAlpha(1/120))**2-(1-smoothingAlpha(1/60)))<1e-9,
 'Two 120 Hz steps equal one 60 Hz step');
assert.equal(normalizedWheelPixels(4,1),128);
assert.equal(normalizedWheelPixels(-3,2),-650);
assert(wheelZoomScale(-240,0,.9)<1,'Wheel up zooms in');
assert(wheelZoomScale(240,0,.9)>1,'Wheel down zooms out');
assert(Math.abs(wheelZoomScale(-240,0,.9)*wheelZoomScale(240,0,.9)-1)<1e-12,
 'Equal opposite wheel gestures invert exactly');
assert(wheelZoomScale(1000000)<2,'A huge wheel jump is capped');
assert(wheelZoomScale(-1000000)>.5,'A huge zoom-in jump is capped');
assert.equal(wheelZoomScale(0),1);
console.log('SMOOTH_MAP_CAMERA_UNIT_PASS');
