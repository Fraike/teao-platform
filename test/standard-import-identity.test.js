import assert from 'node:assert/strict';
import {standardImportIdentity, normalizeStandardImportProject} from '../server/services/standard-import-identity.js';
const record={serialNo:'SP0024-D',customer:'成都瑞博▲',model:'RD-02-1',fields:{marking:'型号E115'}};
assert.notEqual(standardImportIdentity(record),standardImportIdentity({...record,fields:{marking:'A02'}}));
assert.equal(standardImportIdentity(record),standardImportIdentity({...record,vehicleModel:'E115'}));
assert.equal(standardImportIdentity({...record,customer:'利民FS11-A2▲',fields:{}}),standardImportIdentity({...record,customer:'利民▲',vehicleModel:'FS11-A2',fields:{}}));
assert.notEqual(standardImportIdentity(record),standardImportIdentity({...record,customer:'其他客户▲'}));
assert.notEqual(standardImportIdentity(record),standardImportIdentity({...record,model:'RD-02-2'}));
for (const [raw, customer, project] of [
 ['青岛新泉 ▲', '青岛新泉▲', ''],
 ['青岛新泉\n\t▲*', '青岛新泉▲*', ''],
 ['美国Jordi Sim ▲', '美国Jordi Sim▲', ''],
 ['美国Jordi Sim', '美国Jordi Sim', ''],
 ['比亚迪\nSFHA-5303200 /CQHA ▲*', '比亚迪▲*', 'SFHA-5303200/CQHA'],
]) {
 const input = {...record,customer:raw,fields:{}};
 const normalized = {customer,vehicleModel:project};
 assert.deepEqual(normalizeStandardImportProject(input),normalized,raw);
 assert.equal(standardImportIdentity(input),standardImportIdentity({...input,...normalized}),raw);
 assert.equal(input.customer,raw);
}
assert.notEqual(standardImportIdentity({...record,customer:'美国Jordi Sim ▲'}),standardImportIdentity({...record,customer:'美国JordiSim▲'}));
console.log('standard project identity regression passed');
