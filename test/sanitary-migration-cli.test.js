import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { SOURCE, OLD_SOURCE, OLD_SHEET, normalizePayload, validatePayload, migrationPlan, previewMigration, executeMigration } from '../server/scripts/sanitary-migrate.js';
import { digest } from '../server/scripts/release-common.js';
import { buildLegacyWhitelist } from '../server/scripts/sanitary-whitelist.js';

const confirmed = ['SP0009-G','SP0010-G','SP0024-G','SP0025-G','SP0011-G','SP0012-G'];
function payloadFixture() {
  const serials = [...confirmed, ...Array.from({length:39}, (_, i) => `SP${1000+i}-G`)];
  return { format: 'teao-sanitary-migration-v1', sourceHash: SOURCE, sourceSheet: OLD_SHEET, records: serials.map((serialNo, i) => ({
    serialNo, categoryKey:'sanitary_damper', standardType:'formal', customer:'隔离测试客户', model:'RD-V088', customerPartNo:'',
    sourceHash:SOURCE, sourceSheet:OLD_SHEET, sourceRow:7+Math.floor(i/2),
    fields: {part_type:i<25?'盖':'座', product_standard:'CW20', import_note:i<6?'原表产品型号为空；用户于2026-10-17确认补为RD-V088。':''},
    comments:Array.from({length:i<5?2:1}, (_, j) => ({cell:`${j?'G':'F'}${7+Math.floor(i/2)}`,fieldKey:'product_standard',fieldLabel:'产品标准',author:'原作者',text:`批注${i}-${j}`,changedAt:''})),
  })) };
}
test('controlled contract accepts envelope/array; rejects wrong XLS/hash/count/comments/model/whitelist', () => {
  const payload = payloadFixture();
  assert.equal(validatePayload(payload, SOURCE).length,45);
  assert.equal(validatePayload(normalizePayload(payload.records), SOURCE).length,45);
  assert.throws(() => validatePayload(payload, 'bad'), /hash/);
  for (const mutate of [p=>p.records.pop(),p=>p.records[0].comments.pop(),p=>p.records[0].model='RD-other',p=>p.records[0].fields.part_type='座',p=>p.records[0].sourceSheet='different',p=>p.legacyWhitelist=[]]) {
    const invalid=structuredClone(payload);mutate(invalid);assert.throws(()=>validatePayload(invalid,SOURCE));
  }
  assert.throws(()=>normalizePayload(payload,{sourceHash:'bad',sourceSheet:OLD_SHEET,records:[]}),/来源/);
});

test('CLI with wrong XLS fails before opening/creating business DB; never defaults apply', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sanitary-cli-input-'));
  fs.writeFileSync(path.join(root,'payload.json'),JSON.stringify(payloadFixture()));
  fs.writeFileSync(path.join(root,'source.xls'),'synthetic input');
  const result=spawnSync(process.execPath,['server/scripts/sanitary-migrate.js','--payload',path.join(root,'payload.json'),'--xls',path.join(root,'source.xls'),'--data-dir',path.join(root,'missing-data')],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/hash/);assert(!fs.existsSync(path.join(root,'missing-data')));
});

test('70 exact legacy rows, immutable preview, transaction backup/rollback, 45 inserts and 50 comments, idempotency', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sanitary-migration-db-'));
  process.env.DATA_DIR=path.join(root,'data');fs.mkdirSync(process.env.DATA_DIR);
  const stateRoot=path.join(root,'state');fs.mkdirSync(stateRoot);
  const store=await import('../server/services/standard-store.js');store.initDB();
  const actor={id:'fixture-admin',name:'测试管理员',role:'admin'};
  const legacy=Array.from({length:70},(_,i)=>({serialNo:`WY-fixture-${i}`,categoryKey:'sanitary_damper',standardType:'formal',customer:'旧客户',model:'RD-V088',sourceHash:OLD_SOURCE,sourceSheet:OLD_SHEET,sourceRow:i+1,fields:{lid_standard:`CW${i}`,seat_standard:`CCW${i}`}}));
  let p=store.previewStandardImport(legacy,actor);await store.confirmStandardImport(legacy,actor,p.token);
  const unrelated={serialNo:'UNRELATED',categoryKey:'gear_damper',customer:'其他产品',model:'RD-T001',fields:{torque_standard:'10'}};
  p=store.previewStandardImport([unrelated],actor);await store.confirmStandardImport([unrelated],actor,p.token);
  const payload=payloadFixture();
  const db=store.getDB();
  const oldRows=db.prepare("SELECT * FROM product_standard_versions WHERE category_key='sanitary_damper' ORDER BY serial_no").all();
  // Generate from the original parser records, then compare with the isolated
  // database. Never derive the whitelist from the target rows under migration.
  payload.legacyWhitelist=buildLegacyWhitelist(legacy,OLD_SOURCE).records;
  assert.throws(()=>buildLegacyWhitelist(legacy,'wrong'),/hash/);
  assert.throws(()=>buildLegacyWhitelist(legacy.slice(1),OLD_SOURCE),/70/);
  const altered=structuredClone(legacy);altered[0].sourceHash=SOURCE;
  assert.throws(()=>buildLegacyWhitelist(altered,OLD_SOURCE),/来源/);
  const otherBefore=JSON.stringify(db.prepare("SELECT * FROM product_standard_versions WHERE serial_no='UNRELATED'").get());
  const payloadHash=digest(JSON.stringify(payload));
  const options={dataDir:process.env.DATA_DIR,stateRoot};
  const offline={requireOffline:()=>{}};
  try {
    await t.test('default preview is immutable and contains full retirement list', async()=>{
      const before=fs.readFileSync(path.join(options.dataDir,'standards.db'));
      const plan=await executeMigration(payload,payloadHash,options,offline);
      assert.equal(plan.mode,'preview');assert.equal(plan.insert,45);assert.equal(plan.retire,70);
      assert.deepEqual(fs.readFileSync(path.join(options.dataDir,'standards.db')),before);
      assert(!fs.existsSync(path.join(stateRoot,'lock')));
      const without={...payload,legacyWhitelist:undefined};
      assert.throws(()=>migrationPlan(db,without),/legacy-whitelist/);
    });
    await t.test('wrong source, extra revision and incomplete whitelist are rejected',()=>{
      const row=oldRows[0];
      db.prepare('UPDATE product_standard_import_sources SET source_hash=? WHERE version_id=?').run('a'.repeat(64),row.id);
      assert.throws(()=>migrationPlan(db,payload),/来源/);
      db.prepare('UPDATE product_standard_import_sources SET source_hash=? WHERE version_id=?').run(OLD_SOURCE,row.id);
      db.prepare('UPDATE product_standard_versions SET revision=2 WHERE id=?').run(row.id);
      assert.throws(()=>migrationPlan(db,payload),/修订/);
      db.prepare('UPDATE product_standard_versions SET revision=1 WHERE id=?').run(row.id);
      const bad={...payload,legacyWhitelist:payload.legacyWhitelist.slice(1)};
      assert.throws(()=>validatePayload(bad,SOURCE),/70/);
    });
    await t.test('fingerprint binds payload and all stored fields/comments',async()=>{
      const plan=previewMigration(options.dataDir,payload,payloadHash);
      await assert.rejects(executeMigration(payload,payloadHash,{...options,apply:true,confirm:'wrong'},offline),/confirm/);
      db.prepare('UPDATE product_standard_versions SET customer=? WHERE serial_no=?').run('变化','UNRELATED');
      await assert.rejects(executeMigration(payload,payloadHash,{...options,apply:true,confirm:plan.fingerprint},offline),/confirm/);
      db.prepare('UPDATE product_standard_versions SET customer=? WHERE serial_no=?').run('其他产品','UNRELATED');
    });
    await t.test('service transaction backs up then rolls entire 45+70 batch back on retirement failure',async()=>{
      const preview=store.previewStandardImport(payload.records,actor);
      await assert.rejects(store.confirmStandardImport(payload.records,actor,preview.token,()=>{}, {retirePairedSanitaryIds:[oldRows[0].standard_id,'missing-id']}));
      assert.equal(db.prepare("SELECT count(*) n FROM product_standard_versions WHERE serial_no LIKE 'SP%'").get().n,0);
      assert.equal(db.prepare("SELECT count(*) n FROM product_standard_versions WHERE category_key='sanitary_damper' AND status='published'").get().n,70);
      assert(fs.readdirSync(options.dataDir).some(name=>name.includes('.bak-')));
    });
    await t.test('apply imports 45, archives 50 comments, retires exact70 and preserves unrelated product/outbox',async()=>{
      const plan=previewMigration(options.dataDir,payload,payloadHash);
      const result=await executeMigration(payload,payloadHash,{...options,apply:true,confirm:plan.fingerprint},offline);
      assert.equal(result.inserted,45);assert.equal(result.retired,70);
      const after=store.getDB();
      assert.equal(after.prepare("SELECT count(*) n FROM product_standard_versions WHERE category_key='sanitary_damper' AND status='obsolete'").get().n,70);
      assert.equal(after.prepare('SELECT count(*) n FROM product_standard_excel_comments WHERE source_hash=?').get(SOURCE).n,50);
      assert.equal(JSON.stringify(after.prepare("SELECT * FROM product_standard_versions WHERE serial_no='UNRELATED'").get()),otherBefore);
      assert.equal(after.prepare('SELECT count(*) n FROM standard_publication_outbox').get().n,0);
      const backup=new DatabaseSync(result.backupPath,{readOnly:true});
      assert.equal(backup.prepare('SELECT count(*) n FROM product_standard_versions').get().n,71);backup.close();
    });
    await t.test('repeat execution is no-op and does not create another backup/import',async()=>{
      const before=fs.readdirSync(options.dataDir).filter(name=>name.includes('.bak-')).length;
      const plan=previewMigration(options.dataDir,payload,payloadHash);
      assert.equal(plan.insert,0);assert.equal(plan.skipped,45);assert.equal(plan.retire,0);
      const result=await executeMigration(payload,payloadHash,{...options,apply:true,confirm:plan.fingerprint},offline);
      assert.equal(result.mode,'unchanged');
      assert.equal(fs.readdirSync(options.dataDir).filter(name=>name.includes('.bak-')).length,before);
      assert(!fs.existsSync(path.join(stateRoot,'lock')));
    });
  } finally {store.closeDB();}
});
