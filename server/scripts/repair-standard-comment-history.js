/** Read-only preview by default. Apply only the exact saved preview after SQLite backup. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import Database from 'better-sqlite3';
import {createRequire} from 'node:module';
import {parseCommentHistory,planCommentRepair} from '../services/standard-comment-repair.js';
import {readMainSheet,reconcile} from './audit-standard-excel.js';
import {parseSanitaryImportRows} from '../../src/lib/sanitaryStandardImport.ts';
import {parseSanitaryComponentRows,isSanitaryComponentSheet} from '../../src/lib/sanitaryComponentImport.ts';
import {firstCommentDate} from '../../src/lib/standardCommentDate.ts';
const require=createRequire(import.meta.url),XLSX=require('xlsx');
const ROOT=path.resolve(import.meta.dirname,'../..');
const MAIN_HASH='f6267272947847810a542d7124f908bc03629ec243c6a65bf44719d34db89723';
const LEGACY_PREFIX='2026-10-13T18:27:26';
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');

function readSources(files) {
  return files.map(file=>{
    const bytes=fs.readFileSync(file),hash=createHash('sha256').update(bytes).digest('hex');
    const workbook=XLSX.read(bytes,{type:'buffer',cellComments:true});
    const comments=[];
    for(const sheetName of workbook.SheetNames)for(const [cell,data]of Object.entries(workbook.Sheets[sheetName])) {
      if(cell.startsWith('!'))continue;
      for(const c of data.c??[])comments.push({sheetName,cell,author:c.a||'',text:String(c.t||'').split('\0')[0].trim()});
    }
    return {file:path.resolve(file),hash,comments,workbook};
  });
}

export function repairFingerprint(d) {
  const tables=['product_standards','product_standard_versions','product_standard_changes','product_standard_excel_comments','product_standard_import_sources','standard_categories','standard_query_state','standard_publication_outbox','standard_review_reminders'];
  const exists=d.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
  return digest(tables.map(table=>[table,exists.get(table)?d.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all():null]));
}

export function assertSourceCoverage(sources,archive,excluded=[]) {
  for(const source of sources)for(const comment of source.comments) {
    if(!comment.text || excluded.some(e=>e.hash===source.hash&&e.sheetName===comment.sheetName&&e.cell===comment.cell))continue;
    if(!archive.some(c=>c.source_hash===source.hash&&c.source_cell===comment.cell&&c.author===comment.author&&c.text===comment.text))throw new Error(`来源批注缺失：${comment.sheetName}/${comment.cell}`);
  }
}

function verifySanitaryAssociations(d,sources,archive,versions) {
  const imports=d.prepare('SELECT * FROM product_standard_import_sources').all();
  const clean=value=>String(value??'').replace(/\s/g,'');
  for(const source of sources)for(const sheetName of source.workbook.SheetNames.filter(name=>name.includes('智能卫浴'))) {
    const sheet=source.workbook.Sheets[sheetName],rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',range:0});
    const component=isSanitaryComponentSheet(rows);
    const comments=source.comments.filter(c=>c.sheetName===sheetName).map(c=>({...c,row:XLSX.utils.decode_cell(c.cell).r,column:XLSX.utils.decode_cell(c.cell).c}));
    const parsed=(component?parseSanitaryComponentRows:parseSanitaryImportRows)(rows,{comments,mergedRanges:sheet['!merges']});
    if(parsed.errors.length)throw new Error('卫浴来源解析存在错误');
    for(const record of parsed.records) {
      const candidates=imports.filter(s=>s.source_hash===source.hash&&s.source_sheet===sheetName&&s.source_row===record.sourceRow)
        .map(s=>versions.find(v=>v.id===s.version_id)).filter(v=>v&&(!component||v.serial_no===record.serialNo));
      if(candidates.length!==1)throw new Error(`卫浴来源身份不唯一：${sheetName}/${record.sourceRow}`);
      const v=candidates[0],fields=JSON.parse(v.fields);
      const model=record.model||((source.hash==='78435a7348396f85ba413026a2e1a57e50a598125a9ab3e34114e3f80a9ad97f'&&[7,8,9].includes(record.sourceRow))?'RD-V088':'');
      if(clean(v.customer)!==clean(record.customer)||clean(v.model)!==clean(model)||clean(fields.customer_model)!==clean(record.fields.customer_model)||(component&&fields.part_type!==record.fields.part_type))throw new Error('卫浴来源与版本完整身份不一致');
      for(const note of record.comments??[])if(archive.filter(c=>c.version_id===v.id&&c.standard_id===v.standard_id&&c.source_hash===source.hash&&c.source_cell===note.cell&&c.field_key===note.fieldKey&&c.author===note.author&&c.text===note.text).length!==1)throw new Error(`卫浴产品批注缺失或重复：${v.serial_no}/${note.cell}`);
    }
  }
}

export function buildRepairPreview(d,files) {
  const sources=readSources(files);
  const main=sources.find(source=>source.hash===MAIN_HASH);
  if(!main)throw new Error('缺少已核实的原始主表；不允许对新文件套用旧修复决策');
  const comments=d.prepare('SELECT * FROM product_standard_excel_comments ORDER BY id').all();
  const changes=d.prepare('SELECT * FROM product_standard_changes ORDER BY seq,id').all();
  const versions=d.prepare('SELECT * FROM product_standard_versions ORDER BY standard_id,version_no').all();
  const mainSheet=main.workbook.SheetNames.find(name=>name==='客户阻力值标准一览表-最新');
  if(!mainSheet)throw new Error('原始主工作表不存在');
  const source=readMainSheet(main.workbook.Sheets[mainSheet]);
  assertSourceCoverage(sources,comments,source.commentsOutsideDataRows.map(c=>({hash:MAIN_HASH,sheetName:mainSheet,cell:c.cell})));
  verifySanitaryAssociations(d,sources,comments,versions);
  const mainAudit=reconcile(source,versions.filter(v=>v.version_no===1),changes,comments);
  if(mainAudit.summary.matchedRecords!==source.records.length || mainAudit.rawArchiveCoverage.summary.missingComments)throw new Error('产品身份或原始批注归档不完整，停止推断历史归属');
  for(const comment of comments){
    const file=sources.find(source=>source.hash===comment.source_hash);
    if(!file || !file.comments.some(c=>c.cell===comment.source_cell&&c.author===comment.author&&c.text===comment.text))throw new Error(`来源批注无法复核：${comment.source_cell}`);
    if(!versions.some(v=>v.id===comment.version_id&&v.standard_id===comment.standard_id))throw new Error('批注版本归属错误');
  }
  const repair=planCommentRepair(comments,changes,{legacyCreatedPrefix:LEGACY_PREFIX});
  const commentDateEdits=comments.filter(c=>c.changed_at!==firstCommentDate(c.text)).map(c=>({id:c.id,changed_at:firstCommentDate(c.text)}));
  if(repair.issues.length)throw new Error(`存在${repair.issues.length}条不能证明归属的旧记录`);
  const target=versions.filter(v=>v.serial_no==='SP0006-C'&&v.customer==='常州新泉▲'&&v.model==='RD-V128-170'&&v.customer_part_no==='2010.0431.0805');
  if(target.length!==1 || versions.filter(v=>v.standard_id===target[0].standard_id).length!==1 || target[0].status!=='published')throw new Error('季节标准产品存在歧义或后续修订，停止直接补录');
  const v=target[0],fields=JSON.parse(v.fields);
  const seasonal=comments.find(c=>c.version_id===v.id&&c.source_hash===MAIN_HASH&&c.source_cell==='F487'&&c.field_key==='test_standard');
  if(!seasonal || !parseCommentHistory(seasonal.text).some(b=>b.changedAt==='2025-11-01'&&b.description.includes('100-140（冬季标准）')) || fields.test_standard!=='120-160')throw new Error('冬夏原始依据或夏季当前值变化');
  if(fields.winter_test_standard && fields.winter_test_standard!=='100-140')throw new Error('已有人工冬季值，禁止覆盖');
  const fieldEdit=fields.winter_test_standard?null:{versionId:v.id,standardId:v.standard_id,serialNo:v.serial_no,previousFields:v.fields,revision:v.revision,fields:{...fields,winter_test_standard:'100-140'}};
  return {format:'teao-comment-history-repair-v1',dbFingerprint:repairFingerprint(d),sources:sources.map(s=>({file:s.file,hash:s.hash,sheets:s.workbook.SheetNames})),
    coverage:{products:source.records.length,sourceProductComments:mainAudit.rawArchiveCoverage.summary.sourceReadableComments,archiveRows:comments.length,unmatchedHistoryLines:mainAudit.comments.summary.unmatchedLines},
    tableNotes:source.commentsOutsideDataRows,repair,fieldEdit,commentDateEdits,
    summary:{sourceLinks:repair.link.length,replacedLegacyRows:repair.removeIds.length,completeRowsToInsert:repair.insert.length,winterFieldsToFill:fieldEdit?1:0,historyDates:repair.dateEdits.length,commentDates:commentDateEdits.length}};
}

export function applyRepair(d,preview,validate=()=>{}) {
  const current=repairFingerprint(d);
  if(current!==preview.dbFingerprint)throw new Error('数据库已变化，请重新生成预览');
  const remove=d.prepare('DELETE FROM product_standard_changes WHERE id=? AND created_at LIKE ? AND source_cell=\'\'');
  const link=d.prepare('UPDATE product_standard_changes SET source_cell=? WHERE id=? AND source_cell=\'\'');
  const insert=d.prepare(`INSERT INTO product_standard_changes(id,standard_id,version_id,field_key,field_label,author,changed_at,description,sort_date,seq,created_at,source_cell) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  let seq=d.prepare('SELECT COALESCE(MAX(seq),0) n FROM product_standard_changes').get().n;
  const now=new Date().toISOString();
  d.transaction(()=>{
    if(repairFingerprint(d)!==preview.dbFingerprint)throw new Error('写入前数据库发生变化');
    for(const row of preview.repair.link)if(link.run(row.source_cell,row.id).changes!==1)throw new Error('来源关联记录已变化');
    for(const id of preview.repair.removeIds)if(remove.run(id,`${LEGACY_PREFIX}%`).changes!==1)throw new Error('待纠错记录不属于指定机器导入批次');
    for(const row of preview.repair.insert)insert.run(randomUUID(),row.standard_id,row.version_id,row.field_key,row.field_label,row.author,row.changed_at,row.description,Number(row.changed_at.replaceAll('-','').padEnd(8,'0'))||0,++seq,now,row.source_cell);
    for(const row of preview.repair.dateEdits??[])d.prepare('UPDATE product_standard_changes SET changed_at=?,sort_date=? WHERE id=?').run(row.changed_at,Number(row.changed_at.replaceAll('-','').padEnd(8,'0'))||0,row.id);
    for(const row of preview.commentDateEdits??[])d.prepare('UPDATE product_standard_excel_comments SET changed_at=? WHERE id=?').run(row.changed_at,row.id);
    const edit=preview.fieldEdit;
    if(edit&&d.prepare("UPDATE product_standard_versions SET fields=?,revision=revision+1 WHERE id=? AND revision=? AND fields=? AND status='published'").run(JSON.stringify(edit.fields),edit.versionId,edit.revision,edit.previousFields).changes!==1)throw new Error('季节标准已变化');
    if(preview.repair.link.length||preview.repair.removeIds.length||preview.repair.insert.length||preview.repair.dateEdits?.length||preview.commentDateEdits?.length||edit)d.prepare('UPDATE standard_query_state SET revision=revision+1 WHERE id=1').run();
    if(d.prepare('PRAGMA foreign_key_check').all().length)throw new Error('外键核验失败');
    if(d.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('数据库完整性检查失败');
    validate();
  }).immediate();
}

function argumentsOf(args){
  const options={db:path.join(ROOT,'data/standards.db'),main:path.join(ROOT,'客户标准参数一览表-整理版.xls'),sanitary:'/Users/mikewang/Downloads/临时/客户标准参数一览表-整理版-卫浴.xls',output:'',applyPreview:''};
  for(let i=0;i<args.length;i+=2){const key={'--db':'db','--main':'main','--sanitary':'sanitary','--output':'output','--apply-preview':'applyPreview'}[args[i]];if(!key||!args[i+1])throw new Error('参数无效');options[key]=path.resolve(args[i+1]);}
  return options;
}

export async function runRepair(args=process.argv.slice(2)){
  const opts=argumentsOf(args),applying=Boolean(opts.applyPreview);
  const d=new Database(opts.db,{readonly:!applying,fileMustExist:true});
  try{
    const preview=d.transaction(()=>buildRepairPreview(d,[opts.main,opts.sanitary]))();
    preview.database=fs.realpathSync(opts.db);
    preview.planHash=digest(preview);
    if(!applying){
      const output=opts.output||path.join(path.dirname(opts.db),`comment-repair-preview-${Date.now()}.json`);
      fs.writeFileSync(output,JSON.stringify(preview,null,2),{flag:'wx'});
      console.log(JSON.stringify({preview:output,planHash:preview.planHash,...preview.summary}));return;
    }
    const accepted=JSON.parse(fs.readFileSync(opts.applyPreview,'utf8'));
    if(accepted.planHash!==preview.planHash||accepted.database!==preview.database)throw new Error('预览与当前来源、数据库不一致');
    const backup=`${opts.db}.bak-comment-repair-${Date.now()}`;
    await d.backup(backup);
    // Preserve every affected original row and the approved plan next to the backup.
    fs.writeFileSync(`${backup}.manifest.json`,JSON.stringify(accepted,null,2),{flag:'wx'});
    let repeat;
    applyRepair(d,preview,()=>{
      repeat=buildRepairPreview(d,[opts.main,opts.sanitary]);
      if(Object.values(repeat.summary).some(Number)||repeat.coverage.unmatchedHistoryLines)throw new Error('最终批注覆盖或幂等校验失败，回滚修复');
    });
    console.log(JSON.stringify({applied:true,backup,...preview.summary,repeat:repeat.summary}));
  }finally{d.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)runRepair().catch(error=>{console.error(error.message);process.exitCode=1;});
