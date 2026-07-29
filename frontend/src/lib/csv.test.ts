import assert from 'node:assert';
import { parseCsvPoints } from './csv';

// 1. Headerless CSV → positional first-3 columns.
let r = parseCsvPoints('1,2,3\n4,5,6\n7,8,9');
assert(r.points.length === 3, 'headerless: 3 points');
assert(r.header === false, 'headerless: header=false');
assert(r.points[0].x === 1 && r.points[0].y === 2 && r.points[0].z === 3, 'headerless: positional order');
assert(!r.mapping, 'headerless: no mapping');

// 2. Headered CSV with standard x,y,z columns.
r = parseCsvPoints('x,y,z\n0,10,20\n30,40,50');
assert(r.points.length === 2, 'header x,y,z: 2 points');
assert(r.header === true, 'header x,y,z: header=true');
assert(r.points[0].x === 0 && r.points[0].y === 10 && r.points[0].z === 20, 'header x,y,z: values by name');
assert(r.mapping?.x === 'x' && r.mapping?.y === 'y' && r.mapping?.z === 'z', 'header x,y,z: mapping recorded');

// 3. Columns out of canonical order — must match by NAME, not position.
r = parseCsvPoints('z,x,y\n1,2,3');
assert(r.points[0].x === 2 && r.points[0].y === 3 && r.points[0].z === 1, 'reordered z,x,y: matched by name');

// 4. Case-insensitive + alias matching (pos_x, PZ).
r = parseCsvPoints('pos_x,py,Z\n5,6,7');
assert(r.points[0].x === 5 && r.points[0].y === 6 && r.points[0].z === 7, 'aliases pos_x/py/Z matched');

// 5. Extra columns — only x/y/z used, rest ignored.
r = parseCsvPoints('id,x,y,z,label\n1,1,2,3,a\n2,4,5,6,b');
assert(r.points.length === 2 && r.points[0].x === 1 && r.points[0].z === 3, 'extra columns ignored');

// 6. Header present but a position column is missing → error, zero points.
r = parseCsvPoints('x,y\n1,2\n3,4');
assert(r.points.length === 0, 'missing z: no points');
assert(!!r.error && r.error.includes('z'), 'missing z: error mentions z');

// 7. Malformed numeric row → ignored, others kept.
r = parseCsvPoints('x,y,z\n1,2,3\nbad,2,3\n4,5,6');
assert(r.points.length === 2, 'one bad row ignored');
assert(r.ignored === 1, 'ignored count = 1');

console.log('csv.test OK');
