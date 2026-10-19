import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { standardImportIdentity } from './standard-import-identity.js';
import { parseCommentHistory } from './standard-comment-repair.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=rows=>rows.map(row=>JSON.stringify(row)).sort().join('\n');
const fail=message=>{throw new Error(message);};
const identity=record=>JSON.stringify([record.categoryKey,standardImportIdentity(record)]);
const idFor=record=>'baseline-'+hash(JSON.stringify([record.sourceHash,record.sourceSheet,record.sourceRow,identity(record)])).slice(0,32);
const sourceHistory=record=>record.comments.flatMap(comment=>parseCommentHistory(comment.text,comment.author).map(block=>({
  source_cell:comment.cell,field_key:comment.fieldKey,field_label:comment.fieldLabel,author:comment.author,
  changed_at:block.changedAt,description:block.description,
})));

function validateRecords(records) {
  if(!Array.isArray(records)||!records.length||records.length>10000) fail('基线记录数量无效');
  const seen=new Set();
  for(const record of records){
    if(!['published','obsolete'].includes(record.initialStatus)) fail('基线状态必须为生效或停用');
    if(!record.customer||!record.model||!record.serialNo||!record.categoryKey||!Array.isArray(record.comments)) fail('基线必填字段缺失');
    if(!/^[a-f0-9]{64}$/.test(record.sourceHash)||!record.sourceSheet||!Number.isSafeInteger(record.sourceRow)||record.sourceRow<1) fail('基线来源不完整');
    if(seen.has(identity(record))) fail('基线业务身份重复'); seen.add(identity(record));
    if(!record.fields||Object.values(record.fields).some(value=>typeof value!=='string')) fail('规格字段必须为文本');
    if(record.comments.some(c=>['cell','fieldKey','fieldLabel','author','text','changedAt'].some(key=>typeof c[key]!=='string'))) fail('原始批注字段不完整');
    if(new Set(record.comments.map(c=>JSON.stringify([c.cell,c.author,c.text]))).size!==record.comments.length) fail('原始批注重复');
  }
}

function initializeSchema(database) {
  const worker=fileURLToPath(new URL('../scripts/standard-baseline-schema.js',import.meta.url));
  const result=spawnSync(process.execPath,[worker,path.dirname(database)],{encoding:'utf8',env:{...process.env,DATA_DIR:path.dirname(database)}});
  if(result.status!==0) fail(`隔离 schema 初始化失败：${result.stderr.slice(-2000)}`);
}

function insertRecords(db,records,now) {
  const standard=db.prepare('INSERT INTO product_standards(id,serial_no,category_key,created_at,updated_at) VALUES(?,?,?,?,?)');
  const version=db.prepare(`INSERT INTO product_standard_versions(id,standard_id,version_no,serial_no,customer,model,customer_part_no,vehicle_model,
    category_key,standard_type,fields,status,created_by,created_at,updated_at,updated_by,published_at)
    VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const source=db.prepare('INSERT INTO product_standard_import_sources VALUES(?,?,?,?,?,?,?)');
  const comment=db.prepare(`INSERT INTO product_standard_excel_comments(id,standard_id,version_id,source_cell,field_key,field_label,author,text,changed_at,source_hash) VALUES(?,?,?,?,?,?,?,?,?,?)`);
  const change=db.prepare(`INSERT INTO product_standard_changes(id,standard_id,version_id,source_cell,field_key,field_label,author,changed_at,description,sort_date,seq,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  let seq=0;
  for(const record of records){
    const id=idFor(record),vid=id+'-v1';
    standard.run(id,record.serialNo,record.categoryKey,now,now);
    version.run(vid,id,record.serialNo,record.customer,record.model,record.customerPartNo||'',record.vehicleModel||'',record.categoryKey,
      record.standardType,JSON.stringify(record.fields),record.initialStatus,'上线基线初始化',now,now,'上线基线初始化',record.initialStatus==='published'?now:null);
    source.run(vid,record.sourceHash,record.sourceSheet,record.sourceRow,'',now,record.initialStatus);
    change.run(id+'-init',id,vid,'','','','',now,'上线基线初始化（管理员核定正式Excel；未经过系统审批）',Date.parse(now),++seq,now);
    record.comments.forEach((c,index)=>comment.run(`${id}-c${index}`,id,vid,c.cell,c.fieldKey,c.fieldLabel,c.author,c.text,c.changedAt,record.sourceHash));
    sourceHistory(record).forEach((c,index)=>change.run(`${id}-h${index}`,id,vid,c.source_cell,c.field_key,c.field_label,c.author,c.changed_at,c.description,
      c.changed_at?Date.parse(c.changed_at.length===7?`${c.changed_at}-01`:c.changed_at)||0:0,++seq,now));
  }
}

export function verifyBaselineDatabase(database,records) {
  validateRecords(records);
  const db=new DatabaseSync(database,{readOnly:true});
  try {
    if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length) fail('基线数据库完整性失败');
    for(const table of ['product_standards','product_standard_versions','product_standard_import_sources'])
      if(db.prepare(`SELECT count(*) n FROM ${table}`).get().n!==records.length) fail('基线记录数量不匹配');
    if(db.prepare('SELECT count(*) n FROM standard_publication_outbox').get().n) fail('初始化不能包含发布队列');
    if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='standard_review_reminders'").get()
      &&db.prepare('SELECT count(*) n FROM standard_review_reminders').get().n) fail('初始化不能包含催审任务');
    for(const record of records) verifyRecord(db,record);
    const comments=records.reduce((n,r)=>n+r.comments.length,0),history=records.reduce((n,r)=>n+sourceHistory(r).length,0);
    if(db.prepare('SELECT count(*) n FROM product_standard_excel_comments').get().n!==comments
      ||db.prepare('SELECT count(*) n FROM product_standard_changes').get().n!==records.length+history) fail('批注或历史数量不匹配');
    return {records:records.length,comments,sourceHistory:history,revision:db.prepare('SELECT revision FROM standard_query_state WHERE id=1').get().revision};
  }finally{db.close();}
}

function verifyRecord(db,r) {
  const id=idFor(r),v=db.prepare('SELECT * FROM product_standard_versions WHERE standard_id=?').get(id);
  const standard=db.prepare('SELECT serial_no,category_key FROM product_standards WHERE id=?').get(id);
  if(!standard||standard.serial_no!==r.serialNo||standard.category_key!==r.categoryKey) fail(`标准主记录字段不匹配：${r.serialNo}`);
  const expected={serial_no:r.serialNo,customer:r.customer,model:r.model,customer_part_no:r.customerPartNo||'',vehicle_model:r.vehicleModel||'',category_key:r.categoryKey,standard_type:r.standardType,status:r.initialStatus,fields:JSON.stringify(r.fields)};
  if(!v||Object.entries(expected).some(([key,value])=>v[key]!==value)) fail(`规格字段不匹配：${r.serialNo}`);
  if(v.version_no!==1||v.revision!==1||v.submitted_by_id||v.submitted_by||v.assigned_reviewer_id||v.reviewed_by||v.reviewed_by_id||v.reviewed_at||v.submitted_at||v.review_comment) fail('基线不得伪造审批');
  const src=db.prepare('SELECT source_hash,source_sheet,source_row,initial_status FROM product_standard_import_sources WHERE version_id=?').get(v.id);
  if(JSON.stringify(src)!==JSON.stringify({source_hash:r.sourceHash,source_sheet:r.sourceSheet,source_row:r.sourceRow,initial_status:r.initialStatus})) fail('来源不匹配');
  const comments=db.prepare('SELECT source_cell,field_key,field_label,author,text,changed_at,source_hash FROM product_standard_excel_comments WHERE version_id=?').all(v.id);
  const wanted=r.comments.map(c=>({source_cell:c.cell,field_key:c.fieldKey,field_label:c.fieldLabel,author:c.author,text:c.text,changed_at:c.changedAt,source_hash:r.sourceHash}));
  if(canonical(comments)!==canonical(wanted)) fail(`批注不匹配：${r.serialNo}`);
  const history=db.prepare("SELECT source_cell,field_key,field_label,author,changed_at,description FROM product_standard_changes WHERE version_id=? AND source_cell!=''").all(v.id);
  if(canonical(history)!==canonical(sourceHistory(r))) fail(`变更历史不匹配：${r.serialNo}`);
}

// Transport-independent materializer; the CLI separately enforces approved XLS hashes and full counts.
export function materializeBaseline(records,database,{createdAt=new Date().toISOString(),tableNotes=[],transformations=[],sources=[]}={}) {
  validateRecords(records);
  if(path.basename(database)!=='standards.db'||!path.isAbsolute(database)||fs.existsSync(path.dirname(database))) fail('隔离目录已存在，拒绝覆盖');
  if(!Number.isFinite(Date.parse(createdAt))) fail('初始化日期无效');
  fs.mkdirSync(path.dirname(database),{mode:0o700});
  initializeSchema(database);
  const db=new DatabaseSync(database);
  try{
    if(db.prepare('SELECT count(*) n FROM product_standards').get().n) fail('隔离库必须为空');
    db.exec('BEGIN IMMEDIATE');
    try{
      insertRecords(db,records,createdAt);
      db.exec('CREATE TABLE standard_baseline_metadata(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL)');
      db.prepare('INSERT INTO standard_baseline_metadata VALUES(1,?)').run(JSON.stringify({format:'teao-standard-baseline-v1',recordsHash:hash(JSON.stringify(records)),createdAt,tableNotes,transformations}));
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE');
  }finally{db.close();}
  fs.chmodSync(database,0o600);
  const verified=verifyBaselineDatabase(database,records);
  const read=new DatabaseSync(database,{readOnly:true});
  let schemaHash;
  try{schemaHash=hash(JSON.stringify(read.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all()));}finally{read.close();}
  const result={format:'teao-standard-baseline-build-v1',createdAt,recordsHash:hash(JSON.stringify(records)),...verified,
    database:{sha256:hash(fs.readFileSync(database)),schemaHash},transformations,tableNotes,sources};
  fs.writeFileSync(path.join(path.dirname(database),'baseline-manifest.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  return result;
}
