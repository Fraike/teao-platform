import assert from 'node:assert/strict';
import {sharedDrawingSeries} from '../server/shared/product-drawing-series.ts';
assert.deepEqual(sharedDrawingSeries('RD-T028-V028/成品图/RD-T028&V028.pdf','T028'),['T028','V028']);
assert.deepEqual(sharedDrawingSeries('RD-T068-V068/成品图/RD-T068-成品图.pdf','T068'),['T068','V068']);
assert.deepEqual(sharedDrawingSeries('RD-T036-V036/成品图/RD-T036A-V036A成品图.pdf','T036A'),['T036A','V036A']);
assert.deepEqual(sharedDrawingSeries('RD-T036-V036/成品图/RD-T036A.pdf','T036A'),['T036A']);
assert.deepEqual(sharedDrawingSeries('RD-T028/成品图/RD-T028.pdf','T028'),['T028']);
assert.deepEqual(sharedDrawingSeries('RD-T028-V038/成品图/RD-T028.pdf','T028'),['T028']);
console.log('explicit T/V shared drawing family matching passed');

assert.deepEqual(sharedDrawingSeries('RD-T028-V028/成品图/RD-T028-V028A.pdf','T028'),['T028']);
assert.deepEqual(sharedDrawingSeries('RD-T028-V028/成品图/RD-T028&V028-CW.pdf','T028-CW'),['T028-CW','V028-CW']);
