import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { buildOfficialBaseline } from '../scripts/standard-baseline-build.js';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const official=path.join(root,'客户标准参数一览表-整理版.xls');
const sanitary=path.join(root,'客户标准参数一览表-整理版-卫浴.xls');
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hasApprovedSources=fs.existsSync(official)&&fs.existsSync(sanitary)
  &&digest(official)==='b23fbed1f4d9812281fab5a30b261910678ec8faaf870313acabaf70dfbb2cb0'
  &&digest(sanitary)==='78435a7348396f85ba413026a2e1a57e50a598125a9ab3e34114e3f80a9ad97f';

test('CLI refuses unrelated XLS and creates no database or live DATA_DIR content',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'baseline-cli-')),file=path.join(temp,'wrong.xls'),output=path.join(temp,'output');
  fs.writeFileSync(file,'unapproved source');
  const result=spawnSync(process.execPath,['--import','./scripts/standard-source-loader.js','scripts/standard-baseline-build.js','--main',file,'--sanitary',file,'--output',output],
    {cwd:root,encoding:'utf8',env:{...process.env,DATA_DIR:path.join(temp,'live')}});
  assert.notEqual(result.status,0);assert.match(result.stderr,/hash不匹配/);
  assert.equal(fs.existsSync(output),false);assert.equal(fs.existsSync(path.join(temp,'live')),false);
});

test('CLI validates canonical UTC build time before accessing sources',()=>{
  const result=spawnSync(process.execPath,['--import','./scripts/standard-source-loader.js','scripts/standard-baseline-build.js','--created-at','yesterday','--output','/tmp/not-used'],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/ISO.*UTC/);
});

test('real CLI accepts a fixed build time and reproduces the identical database bytes', {skip:!hasApprovedSources},()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'baseline-cli-repeat-')),createdAt='2026-10-19T00:00:00.000Z';
  const run=name=>{
    const result=spawnSync(process.execPath,['--import','./scripts/standard-source-loader.js','scripts/standard-baseline-build.js','--main',official,'--sanitary',sanitary,'--output',path.join(temp,name),'--created-at',createdAt],{cwd:root,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
  };
  const first=run('first'),second=run('second');
  assert.equal(first.createdAt,createdAt);assert.equal(first.database.sha256,second.database.sha256);assert.equal(first.recordsHash,second.recordsHash);
});

test('official XLS rebuild is reproducible and contains all 11 F490 changes, no old or pending records', {skip:!hasApprovedSources}, async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'baseline-official-')),output=path.join(temp,'first'),createdAt='2026-10-19T00:00:00.000Z';
  const first=await buildOfficialBaseline({main:official,sanitary,output,createdAt});
  const second=await buildOfficialBaseline({main:official,sanitary,output:path.join(temp,'second'),createdAt});
  assert.equal(first.records,809);assert.equal(first.comments,1264);assert.equal(first.uniqueProductComments,1241);assert.equal(first.sourceHistory,1604);
  assert.equal(first.database.sha256,second.database.sha256);assert.equal(first.recordsHash,second.recordsHash);
  const db=new DatabaseSync(path.join(output,'standards.db'),{readOnly:true});
  try{
    const statuses=Object.fromEntries(db.prepare('SELECT status,count(*) n FROM product_standard_versions GROUP BY status').all().map(r=>[r.status,r.n]));
    assert.deepEqual(statuses,{obsolete:1,published:808});
    const row=db.prepare("SELECT * FROM product_standard_versions WHERE serial_no='SP0006-C'").get();
    assert.equal(JSON.parse(row.fields).test_standard,'120-160');assert.equal(JSON.parse(row.fields).winter_test_standard,'100-140');
    assert.equal(db.prepare("SELECT count(*) n FROM product_standard_changes WHERE version_id=? AND source_cell='F490'").get(row.id).n,11);
    assert.equal(db.prepare("SELECT count(*) n FROM product_standards WHERE serial_no LIKE 'WY-%' OR serial_no IN ('SP0306','SP0001-A-测试','SP0001-A-副本')").get().n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM standard_review_reminders').get().n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM standard_publication_outbox').get().n,0);
  }finally{db.close();}
  await assert.rejects(buildOfficialBaseline({main:official,sanitary,output,createdAt}),/存在|覆盖/);
});
