import assert from 'node:assert/strict';
import { splitGearSpecifications } from '../src/lib/gearSpecification.ts';
assert.deepEqual(splitGearSpecifications('T023-11齿3.0MM齿轮-1-黑\nT023-11齿3.0MM齿轮-2-黑'),['T023-11齿3.0MM齿轮-1-黑','T023-11齿3.0MM齿轮-2-黑']);
assert.deepEqual(splitGearSpecifications('T001-11齿齿轮   T002-12齿齿轮'),['T001-11齿齿轮','T002-12齿齿轮']);
assert.deepEqual(splitGearSpecifications('T001-11齿 3.0MM齿轮'),['T001-11齿 3.0MM齿轮']);
console.log('multiple gear specifications retain complete text');
