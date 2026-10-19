import assert from 'node:assert/strict';
import {getTableViewportHeight} from '../src/lib/tableViewport.ts';
assert.equal(getTableViewportHeight(220,868,92),548);
assert.equal(getTableViewportHeight(190,690,92),400);
assert.equal(getTableViewportHeight(260,690,92),330);
assert.equal(getTableViewportHeight(190,690,60),432);
assert.equal(getTableViewportHeight(650,690,92),80);
console.log('measured table viewport tests passed');
