import assert from 'node:assert';
import { eulerToDirXY } from './euler';

// Identity pose (0,0,0): tool Z is straight up -> no XY projection.
let r = eulerToDirXY(0, 0, 0);
assert(r.dx === 0 && r.dy === 0, 'identity should have no XY direction');

// rz=90: tool Z still vertical (rz only rotates around Z) -> still no XY.
r = eulerToDirXY(0, 0, 90);
assert(r.dx === 0 && r.dy === 0, 'pure rz keeps tool vertical');

// ry=90: tool Z tilts to +X -> dx=1, dy=0
r = eulerToDirXY(0, 90, 0);
assert(Math.abs(r.dx - 1) < 1e-6 && Math.abs(r.dy) < 1e-6, 'ry=90 -> +X');

console.log('euler.test OK');