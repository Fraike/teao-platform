import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStandardPublication, buildStandardPublicationMessages, publicationSections } from '../server/services/standard-publication.js';
const standard = { serialNo: 'SP-MIN', categoryKey: 'gear_damper', sourceComments: [{ versionId: 'v', text: '原始审计批注' }] };
const version = { id: 'v', versionNo: 3, customer: '冗余客户', reviewComment: '独立审核意见', fields: { torque: 0, enabled: false, test_standard: '第一行\n第二行', winter_test_standard: '冬季完整要求', extension: '扩展值' } };
const category = { fields: [{ key: 'torque', label: '扭矩 N·m' }, { key: 'enabled', label: '开关' }, { key: 'test_standard', label: '测试标准' }] };
test('new publications contain identity and complete parameters without audit or redundant metadata', () => {
  assert.deepEqual(publicationSections(standard, version, category).map(s => s.title), ['完整标准参数']);
  for (const directPublish of [false, true]) {
    const messages = buildStandardPublicationMessages(standard, version, category, { directPublish, comment: '独立审核意见', reviewerName: '审核员' });
    assert.deepEqual(messages[0].mentions, ['@all']);
    for (const content of [messages.map(m => m.content).join('\n'), buildStandardPublication(standard, version, category, { directPublish })]) {
      for (const text of ['SP-MIN', 'V3', '扭矩 N·m', '0', 'false', '第一行', '第二行', '冬季完整要求', '扩展值']) assert(content.includes(text), text);
      for (const text of ['基本信息', '审核人', '发布时间', '独立审核意见', '原始审计批注', '冗余客户', '以系统', '请查看']) assert(!content.includes(text), text);
    }
  }
});

test('every stored category and sanitary variant publishes every applicable parameter and unit', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'publication-completeness-'));
  const store = await import('../server/services/standard-store.js');
  store.initDB();
  try {
    for (const category of store.listCategories()) {
      for (const variant of category.key === 'sanitary_damper' ? ['component', 'paired'] : ['component']) {
        const definitions = category.fields.filter(f => !f.variant || f.variant === variant);
        const fields = Object.fromEntries(definitions.map((field, i) => [field.key, field.key === 'part_type' ? '盖' : `参数${i}单位gf.cm\n完整第二行${i}`]));
        fields.extra = '未知扩展值';
        const item = { ...standard, categoryKey: category.key };
        const value = { ...version, fields };
        const rows = publicationSections(item, value, category)[0].rows;
        assert.equal(rows.length, definitions.length + 1, `${category.key}/${variant}`);
        for (const field of definitions) assert(rows.some(([label, text]) => label === field.label && text === fields[field.key]), `${category.key}/${variant}/${field.key}`);
        const content = buildStandardPublicationMessages(item, value, category).map(m => m.content).join('\n');
        for (const text of Object.values(fields)) for (const line of text.split('\n')) assert(content.includes(line), `${category.key}/${variant}/${line}`);
      }
    }
  } finally { store.closeDB(); }
});

test('escaped Unicode multiline values remain complete across byte safe segments', () => {
  const chunk = '😀中文|*`_~<>[]\\';
  const value = chunk.repeat(900) + '\n最后一行';
  const messages = buildStandardPublicationMessages(standard, { ...version, fields: { extension: value } }, { fields: [] });
  assert(messages.length > 2);
  for (const [i, message] of messages.entries()) {
    assert(Buffer.byteLength(message.content) <= (i === 0 ? 2048 : 4096));
    if (i > 0) { assert(message.content.includes('V3')); assert(message.content.includes(`第${i}/${messages.length - 1}部分`)); }
  }
  const raw = messages.slice(1).flatMap(m => m.content.split('\n')).filter(line => line.startsWith('| extension')).map(line => line.replace(/^\| extension(?:（续）)? \| /, '').replace(/ \|$/, '').replace(/\\([\\|*`_~<>\[\]])/g, '$1')).join('');
  assert.equal(raw, chunk.repeat(900) + '最后一行');
});
