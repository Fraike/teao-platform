/** Independent, read-only reconciliation. Never import standard-store (its initialization writes).
 * Usage: node server/scripts/audit-standard-excel.js [--excel file] [--db file] [--output file]
 * Scope: first/main sheet only; 智能卫浴 is explicitly deferred.
 * Compare latest version per standard, not a historical version chosen to hide current differences.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import XLSX from 'xlsx';
import Database from 'better-sqlite3';

const ROOT = path.resolve(import.meta.dirname, '../..');
const TITLES = { 齿形阻尼器: 'gear_damper', 齿轮阻尼器: 'gear_damper', 筒型阻尼器: 'barrel_damper', 齿条阻尼器: 'rack_damper', '锁类、同步器': 'lock_sync', '锁类·同步器': 'lock_sync', 空气拉绳阻尼器: 'air_pull_cord', 空气拉柄阻尼器: 'air_pull_handle' };
const COMMON = { 0: 'serial_no', 1: 'customer', 2: 'model', 3: 'customer_part_no', 4: 'torque_standard', 5: 'test_standard', 6: 'marking' };
const LAYOUTS = {
  gear_damper: { 7: 'gear_spec', 9: 'remark' },
  barrel_damper: { 7: 'rib_return', 9: 'remark' },
  rack_damper: { 7: 'torque_direction', 8: 'lock_direction', 9: 'remark' },
  lock_sync: { 7: 'spring', 8: 'lock_direction', 9: 'remark' },
  air_pull_cord: { 7: 'clip', 9: 'seat', 10: 'axis_core', 11: 'spring', 13: 'pull_cord', 15: 'remark' },
  air_pull_handle: { 7: 'material', 15: 'remark' },
};
const HEADERS = { 序号: 'serial_no', 客户名: 'customer', 型号: 'model', '型号gf.cm': 'model', 客户料号: 'customer_part_no', 扭矩标准: 'torque_standard', '测试标准gf.cm': 'test_standard', 测试范围: 'test_standard', '打点颜色/喷码': 'marking', 打码: 'marking', 喷码: 'marking', 齿轮规格: 'gear_spec', 筋条是否归位: 'rib_return', 扭矩方向: 'torque_direction', 装锁方向: 'lock_direction', 弹簧: 'spring', 扣件: 'clip', 下座: 'seat', 轴芯: 'axis_core', 拉绳: 'pull_cord', 物料: 'material', 备注: 'remark' };
const text = value => String(value ?? '').trim().replace(/^(\d+)\.0+$/, '$1');
const compact = value => text(value).replace(/\s/g, '');
const customerName = value => compact(value).replace(/[▲*]/g, '');
const flags = value => [...new Set(text(value).match(/[▲*]/g) ?? [])].sort().join('');
function markingProject(fields) {
  const values = typeof fields === 'string' ? JSON.parse(fields) : fields;
  return text(values?.marking).match(/^(?:型号)?([A-Z]+\d[A-Z0-9\-/.]*)$/)?.[1] ?? '';
}
function inferredProject(record) {
  const suffix = text(record.customer).replace(/[▲*]+$/, '').match(/[一-龥]([A-Z0-9][A-Z0-9\-/.]*)$/)?.[1];
  return record.vehicleModel || (suffix && /[A-Z]/.test(suffix) ? suffix : '') || markingProject(record.fields);
}
const identity = record => {
  const project = inferredProject(record);
  return JSON.stringify([compact(record.serialNo), compact(record.model), customerName(project ? record.customer.replace(project, '') : record.customer), project]);
};

function commentsOf(sheet) {
  return Object.entries(sheet).filter(([cell]) => !cell.startsWith('!')).flatMap(([cell, data]) =>
    (data.c ?? []).map(comment => ({ ...XLSX.utils.decode_cell(cell), cell, author: comment.a ?? '', rawReadableText: String(comment.t ?? '').split('\0')[0] })));
}

function mergedCustomer(sheet, row) {
  const merge = (sheet['!merges'] ?? []).find(m => m.s.c === 1 && m.e.c === 1 && m.s.r <= row && m.e.r >= row);
  return merge ? text(sheet[XLSX.utils.encode_cell(merge.s)]?.v) : '';
}

function sourceRecord(sheet, row, index, section, comments) {
  const fields = Object.fromEntries(Object.values(section.columns).filter(k => !Object.values(COMMON).slice(0, 4).includes(k)).map(k => [k, '']));
  const notes = [];
  row.forEach((value, col) => {
    if (col < 4) return;
    if (section.columns[col]) fields[section.columns[col]] = text(value);
    else {
      const note = text(value).replace(/临时标准|新增序号/g, '').trim();
      if (note) notes.push(note);
    }
  });
  fields.import_note = notes.join('\n');
  const standardType = row.some(v => text(v).includes('临时标准')) ? 'temporary' : row.some(v => text(v).includes('新增序号')) ? 'new_pending' : 'formal';
  return { row: index + 1, serialNo: text(row[0]), customer: text(row[1]) || mergedCustomer(sheet, index), model: text(row[2]), customerPartNo: text(row[3]), categoryKey: section.categoryKey, standardType, fields,
    comments: comments.filter(c => c.r === index).map(c => ({ ...c, field: section.columns[c.c] ?? 'import_note', header: section.headers[c.c] ?? '', row: index + 1 })) };
}

export function readMainSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', range: 0 });
  const comments = commentsOf(sheet), records = [], sections = [], unclassifiedRows = [];
  let section;
  rows.forEach((row, index) => {
    const heading = row.slice(0, 4).map(text).filter(Boolean);
    if (heading.length === 1 && TITLES[heading[0]]) {
      const categoryKey = TITLES[heading[0]];
      section = { row: index + 1, title: heading[0], categoryKey, columns: { ...COMMON, ...LAYOUTS[categoryKey] }, headers: [] };
      sections.push(section); return;
    }
    if (text(row[0]) === '序号' && section) {
      section.headers = row.map(text); section.headerRow = index + 1;
      // Real labels override the fallback layout, including moved columns.
      row.forEach((label, col) => {
        const key = HEADERS[text(label)]; if (!key) return;
        for (const [oldCol, oldKey] of Object.entries(section.columns)) if (oldKey === key) delete section.columns[oldCol];
        section.columns[col] = key;
      }); return;
    }
    if (!/^SP/i.test(text(row[0]))) return;
    if (!section) { unclassifiedRows.push(index + 1); return; }
    records.push(sourceRecord(sheet, row, index, section, comments));
  });
  const dataRows = new Set(records.map(r => r.row - 1));
  return { records, sections, unclassifiedRows, totalSPRows: rows.filter(r => /^SP/i.test(text(r[0]))).length, commentCells: new Set(comments.map(c => c.cell)).size, commentStrings: comments.length,
    commentsOutsideDataRows: comments.filter(c => !dataRows.has(c.r)) };
}

function sourceCustomer(source, db) {
  // Remove only the actual stored literal project code; never guess a suffix.
  return customerName(db.vehicle_model ? text(source.customer).replace(db.vehicle_model, '') : source.customer);
}

function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) { const k = key(item); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(item); }
  return groups;
}

function compareFields(source, db, diffs) {
  const actual = typeof db.fields === 'string' ? JSON.parse(db.fields) : db.fields;
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) throw new Error(`Invalid fields for standard ${db.standard_id}`);
  const pairs = { serial_no: [source.serialNo, db.serial_no], customer: [sourceCustomer(source, db), customerName(db.customer)], customer_flags: [flags(source.customer), flags(db.customer)], model: [source.model, db.model], customer_part_no: [source.customerPartNo, db.customer_part_no], category_key: [source.categoryKey, db.category_key], standard_type: [source.standardType, db.standard_type] };
  const project = inferredProject(source);
  if (project) pairs.vehicle_model = [project, db.vehicle_model ?? ''];
  for (const key of new Set([...Object.keys(source.fields), ...Object.keys(actual)])) pairs[key] = [source.fields[key] ?? '', actual[key] ?? ''];
  for (const [field, [expected, value]] of Object.entries(pairs)) {
    // Trim only: whitespace inside data fields can be meaningful and must remain visible.
    if (text(expected) !== text(value)) diffs.push({ row: source.row, serialNo: source.serialNo, standardId: db.standard_id, field, expected, actual: value });
  }
  return Object.keys(pairs).length;
}

const DATE = /^(20\d{2})[.年/-](\d{1,2})(?:[.月/-](\d{1,2}))?(?:月|日)?[\s:：.,，-]*/;
function readableLines(raw, author = '') {
  const lines = []; let block = 0;
  for (const original of String(raw).split('\0')[0].split(/\r?\n/)) {
    let value = original.trim();
    // XLS metadata author can differ from a copied, standalone readable author prefix.
    if (/^[A-Za-z][A-Za-z0-9_. @-]{0,39}[:：]$/.test(value)) continue;
    if (author && value.startsWith(author) && /^[\s:：]/.test(value.slice(author.length))) value = value.slice(author.length).replace(/^[\s:：]+/, '');
    const match = value.match(DATE);
    if (match) block++;
    const date = match ? `${match[1]}-${match[2].padStart(2, '0')}${match[3] ? `-${match[3].padStart(2, '0')}` : ''}` : '';
    value = value.replace(DATE, '').trim();
    if (value) lines.push({ text: value, normalized: compact(value), date, block });
  }
  return lines;
}

function matchCommentLines(lines, entries, comment, used) {
  const matches = new Map();
  const eligible = entry => !used.has(entry) && entry.change.field_key === comment.field && (!entry.change.source_cell || entry.change.source_cell === comment.cell);
  for (const block of groupBy(lines, line => line.block).values()) {
    const normalized = block.map(line => line.normalized).join('');
    const candidates = entries.filter(entry => eligible(entry) && entry.normalized === normalized);
    const date = block.find(line => line.date)?.date;
    const entry = candidates.find(e => date && e.date === date) ?? candidates[0];
    if (entry) { used.add(entry); for (const line of block) matches.set(line, entry); }
  }
  for (const line of lines) {
    if (matches.has(line)) continue;
    const candidates = entries.filter(entry => eligible(entry) && entry.normalized === line.normalized);
    const entry = candidates.find(e => line.date && e.date === line.date) ?? candidates[0];
    if (entry) { used.add(entry); matches.set(line, entry); }
  }
  return matches;
}

function commentAudit(source, matches, changes) {
  const byStandard = groupBy(changes, c => c.standard_id);
  const summary = { sourceCellComments: 0, parsedHistoryChanges: changes.length, sourceLines: 0, matchedLines: 0, unmatchedLines: 0, fullyMatchedComments: 0, exactDateLines: 0, partialSourceDateLines: 0, missingSourceDateLines: 0, dateMismatchLines: 0, emptyReadableComments: 0, dateOrAuthorOnlyComments: 0 };
  const unmatched = [], dateIssues = [], matched = [];
  for (const record of source.records) {
    const db = matches.get(record), history = db ? byStandard.get(db.standard_id) ?? [] : [];
    const entries = history.flatMap(change => [...groupBy(readableLines(change.description, change.author), line => line.block).values()].map(lines => ({ normalized: lines.map(line => line.normalized).join(''), change, date: lines.find(line => line.date)?.date || text(change.changed_at) })));
    const used = new Set();
    for (const comment of record.comments) {
      summary.sourceCellComments++;
      const lines = readableLines(comment.rawReadableText, comment.author), missing = [];
      const lineMatches = matchCommentLines(lines, entries, comment, used);
      for (const line of lines) {
        summary.sourceLines++;
        if (!line.date) summary.missingSourceDateLines++;
        else if (line.date.length !== 10) summary.partialSourceDateLines++;
        const entry = lineMatches.get(line);
        if (!entry) { missing.push(line); summary.unmatchedLines++; continue; }
        summary.matchedLines++;
        const dateStatus = !line.date ? 'source_date_missing' : line.date.length !== 10 ? 'source_date_partial' : entry.date === line.date ? 'exact' : 'mismatch';
        if (dateStatus === 'exact') summary.exactDateLines++;
        if (line.date && (dateStatus === 'mismatch' || (dateStatus === 'source_date_partial' && !entry.date.startsWith(line.date)))) {
          summary.dateMismatchLines++; dateIssues.push({ row: record.row, cell: comment.cell, field: comment.field, text: line.text, sourceDate: line.date, dbDate: entry.date });
        }
        matched.push({ row: record.row, cell: comment.cell, field: comment.field, changeId: entry.change.id, text: line.text, sourceDate: line.date, dbDate: entry.date, dateStatus });
      }
      if (!comment.rawReadableText.trim()) summary.emptyReadableComments++;
      else if (!lines.length) summary.dateOrAuthorOnlyComments++;
      if (missing.length || !lines.length) unmatched.push({ row: record.row, serialNo: record.serialNo, standardId: db?.standard_id, cell: comment.cell, field: comment.field, author: comment.author, rawReadableText: comment.rawReadableText, lines: missing, reason: !db ? 'record_not_uniquely_matched' : !lines.length ? 'no_readable_content_lines' : 'history_content_not_matched' });
      else summary.fullyMatchedComments++;
    }
  }
  return { summary, unmatched, dateIssues, matched };
}

function rawArchiveAudit(source, matches, archive) {
  const key = (standardId, cell, author, body) => JSON.stringify([standardId, cell, author, body]);
  const rows = archive ?? [];
  const groups = groupBy(rows, c => key(c.standard_id, c.source_cell, c.author, c.text));
  const used = new Set(), missing = [];
  const summary = { archiveRows: rows.length, sourceReadableComments: 0, rawBodyComments: 0, dateOnlyComments: 0, authorOnlyComments: 0, skippedEmptyComments: 0, matchedComments: 0, missingComments: 0, duplicateArchiveEntries: [...groups.values()].reduce((n, g) => n + g.length - 1, 0), unmatchedArchiveRows: 0 };
  for (const record of source.records) {
    const db = matches.get(record);
    for (const comment of record.comments) {
      // Import/archive stores split-at-first-NUL text with outer trim. Internal text is exact.
      const body = comment.rawReadableText.trim();
      if (!body) { summary.skippedEmptyComments++; continue; }
      summary.sourceReadableComments++;
      const bodyLines = readableLines(body, comment.author);
      const kind = bodyLines.length ? 'rawBodyComments' : /20\d{2}[.年/-]\d{1,2}/.test(body) ? 'dateOnlyComments' : 'authorOnlyComments';
      summary[kind]++;
      const entry = db && (groups.get(key(db.standard_id, comment.cell, comment.author, body)) ?? []).find(c => !used.has(c));
      if (entry) { used.add(entry); summary.matchedComments++; }
      else missing.push({ row: record.row, serialNo: record.serialNo, standardId: db?.standard_id, cell: comment.cell, field: comment.field, author: comment.author, rawReadableText: body, classification: kind, reason: archive === null ? 'archive_table_absent' : !db ? 'record_not_uniquely_matched' : 'exact_archive_entry_missing' });
    }
  }
  summary.missingComments = missing.length;
  const unmatchedArchiveRows = rows.filter(c => !used.has(c)).map(c => ({ id: c.id, standardId: c.standard_id, cell: c.source_cell, author: c.author }));
  summary.unmatchedArchiveRows = unmatchedArchiveRows.length;
  return { available: archive !== null, policy: 'matched standard ID + exact source_cell + author + split-at-first-NUL outer-trimmed readable text; no internal normalization', summary, missing, unmatchedArchiveRows };
}

export function reconcile(source, versions, changes, archive = null) {
  const sourceGroups = groupBy(source.records, identity);
  const duplicateSourceIdentities = [...sourceGroups.values()].filter(g => g.length > 1).map(g => ({ serialNo: g[0].serialNo, customer: g[0].customer, model: g[0].model, project: inferredProject(g[0]), rows: g.map(r => r.row) }));
  const dbGroups = groupBy(versions, v => JSON.stringify([compact(v.serial_no), compact(v.model)]));
  const proposals = new Map(), missingRecords = [], ambiguousMatches = [];
  for (const record of source.records) {
    const sameSerialModel = dbGroups.get(JSON.stringify([compact(record.serialNo), compact(record.model)])) ?? [];
    const project = inferredProject(record);
    const candidates = sameSerialModel.filter(v => sourceCustomer(record, v) === customerName(v.customer) && (!project || project === (v.vehicle_model || markingProject(v.fields))));
    if (sourceGroups.get(identity(record)).length > 1) { ambiguousMatches.push({ row: record.row, serialNo: record.serialNo, reason: 'duplicate_source_identity' }); continue; }
    if (!candidates.length) missingRecords.push({ row: record.row, serialNo: record.serialNo, customer: record.customer, model: record.model, project, candidateRecords: sameSerialModel.map(v => ({ standardId: v.standard_id, customer: v.customer, project: v.vehicle_model || markingProject(v.fields) })) });
    else if (candidates.length > 1) ambiguousMatches.push({ row: record.row, serialNo: record.serialNo, reason: 'multiple_db_candidates', standardIds: candidates.map(v => v.standard_id) });
    else proposals.set(record, candidates[0]);
  }
  const reverse = groupBy([...proposals], ([, v]) => v.standard_id), matches = new Map();
  for (const [record, db] of proposals) {
    if (reverse.get(db.standard_id).length > 1) ambiguousMatches.push({ row: record.row, serialNo: record.serialNo, reason: 'multiple_source_rows_for_db_identity', standardId: db.standard_id });
    else matches.set(record, db);
  }
  const fieldDiffs = []; let comparedFields = 0;
  for (const [record, db] of matches) comparedFields += compareFields(record, db, fieldDiffs);
  const matchedIds = new Set([...matches.values()].map(v => v.standard_id));
  const extraDbRecords = versions.filter(v => !matchedIds.has(v.standard_id)).map(v => ({ standardId: v.standard_id, serialNo: v.serial_no, customer: v.customer, model: v.model, reason: 'not_uniquely_matched' }));
  const comments = commentAudit(source, matches, changes);
  const rawArchiveCoverage = rawArchiveAudit(source, matches, archive);
  return { summary: { sourceRecords: source.records.length, dbRecords: versions.length, matchedRecords: matches.size, comparedFields, fieldDiffs: fieldDiffs.length, missingRecords: missingRecords.length, ambiguousMatches: ambiguousMatches.length, duplicateSourceIdentities: duplicateSourceIdentities.length, extraDbRecords: extraDbRecords.length }, duplicateSourceIdentities, missingRecords, ambiguousMatches, extraDbRecords, fieldDiffs, comments, rawArchiveCoverage };
}

function options(args) {
  const result = { excel: path.join(ROOT, '客户标准参数一览表-整理版.xls'), db: process.env.STANDARDS_DB_PATH || path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'standards.db'), output: '/tmp/teao-standard-excel-audit.json' };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2);
    if (!args[i].startsWith('--') || !Object.hasOwn(result, key) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: audit-standard-excel.js [--excel file] [--db file] [--output file]');
    result[key] = args[i + 1];
  }
  for (const key of Object.keys(result)) result[key] = path.resolve(result[key]);
  const canonical = file => fs.existsSync(file) ? fs.realpathSync(file) : path.join(fs.realpathSync(path.dirname(file)), path.basename(file));
  const output = canonical(result.output), db = canonical(result.db);
  if ([canonical(result.excel), db, `${db}-wal`, `${db}-shm`, `${db}-journal`].includes(output)) throw new Error('Output must not overwrite workbook or SQLite files');
  if (fs.existsSync(result.output)) {
    const outStat = fs.statSync(result.output);
    if ([result.db, result.excel].some(f => { const stat = fs.statSync(f); return stat.dev === outStat.dev && stat.ino === outStat.ino; })) throw new Error('Output aliases an input file');
  }
  return result;
}

export function runAudit(args = process.argv.slice(2)) {
  const opts = options(args), workbook = XLSX.readFile(opts.excel, { cellComments: true });
  const sheetName = workbook.SheetNames[0], source = readMainSheet(workbook.Sheets[sheetName]);
  if (!source.records.length || source.unclassifiedRows.length) throw new Error('Main sheet contains no records or unclassified SP rows');
  const db = new Database(opts.db, { readonly: true, fileMustExist: true });
  let result;
  try {
    result = db.transaction(() => {
      const versions = db.prepare(`SELECT v.standard_id, v.serial_no, v.customer, v.model, v.customer_part_no,
        v.vehicle_model, v.category_key, v.standard_type, v.fields, s.category_key AS parent_category_key
        FROM product_standards s JOIN product_standard_versions v ON v.standard_id = s.id
        WHERE v.version_no = (SELECT MAX(version_no) FROM product_standard_versions WHERE standard_id = s.id)`).all();
      const columns = db.prepare('PRAGMA table_info(product_standard_changes)').all().map(c => c.name);
      const changes = db.prepare(`SELECT id, standard_id, field_key, author, description, changed_at${columns.includes('source_cell') ? ', source_cell' : ''} FROM product_standard_changes`).all();
      const archiveExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'product_standard_excel_comments'").get();
      const archive = archiveExists ? db.prepare('SELECT id, standard_id, source_cell, author, text FROM product_standard_excel_comments').all() : null;
      const report = reconcile(source, versions, changes, archive);
      report.parentCategoryDiffs = versions.filter(v => v.parent_category_key !== v.category_key).map(v => ({ standardId: v.standard_id, serialNo: v.serial_no, parentCategory: v.parent_category_key, versionCategory: v.category_key }));
      return report;
    })();
  } finally { db.close(); }
  const report = { generatedAt: new Date().toISOString(), scope: { sheet: sheetName, excludedSheets: workbook.SheetNames.slice(1), deferred: '智能卫浴', versionPolicy: 'latest per standard', customerPolicy: 'remove actual DB vehicle_model literal from source, compare markers separately', projectPolicy: 'explicit project, then Chinese customer suffix, then exact marking code; E115 and A02 remain separate', fieldPolicy: 'trim outer whitespace only', commentPolicy: 'exact normalized line or full dated block; content and dates separate; no source date is never exact verification' }, ...result,
    source: { totalSPRows: source.totalSPRows, commentCells: source.commentCells, commentStrings: source.commentStrings, sections: source.sections, commentsOutsideDataRows: source.commentsOutsideDataRows } };
  fs.writeFileSync(opts.output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report.summary, parentCategoryDiffs: report.parentCategoryDiffs.length, comments: report.comments.summary, rawArchiveCoverage: { available: report.rawArchiveCoverage.available, ...report.rawArchiveCoverage.summary }, commentsOutsideDataRows: source.commentsOutsideDataRows.length, output: opts.output }));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { runAudit(); } catch (error) { console.error(`Audit failed: ${error.message}`); process.exitCode = 1; }
}
