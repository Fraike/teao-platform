import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStandardPublication, buildStandardPublicationMessages, publicationSections } from '../server/services/standard-publication.js';
const standard = { serialNo: 'SP-MIN', categoryKey: 'gear_damper', sourceComments: [{ versionId: 'v', text: '原始审计批注' }] };
const version = { id: 'v', versionNo: 3, customer: '发布版本客户', reviewComment: '独立审核意见', fields: { torque: 0, enabled: false, test_standard: '第一行\n第二行', winter_test_standard: '冬季完整要求', extension: '扩展值' } };
const category = { fields: [{ key: 'torque', label: '扭矩 N·m' }, { key: 'enabled', label: '开关' }, { key: 'test_standard', label: '测试标准' }] };
test('new publications contain identity and complete parameters without audit or redundant metadata', () => {
  assert.deepEqual(publicationSections(standard, version, category).map(s => s.title), ['完整标准参数']);
  for (const directPublish of [false, true]) {
    const messages = buildStandardPublicationMessages(standard, version, category, { directPublish, comment: '独立审核意见', reviewerName: '审核员' });
    assert.equal(messages.length,1);
    assert(messages.every(m=>m.type==='markdown_v2'&&!m.mentions?.length&&!m.content.includes('@all')));
    for (const content of [messages.map(m => m.content).join('\n'), buildStandardPublication(standard, version, category, { directPublish, reviewerName: '审核员' })]) {
      for (const text of ['SP-MIN', 'V3', '扭矩 N·m', '0', 'false', '第一行', '第二行', '冬季完整要求', '扩展值', '客户：发布版本客户', `${directPublish?'发布人':'审核人'}：审核员`]) assert(content.includes(text), text);
      for (const text of ['基本信息', '发布时间', '独立审核意见', '原始审计批注', '以系统', '请查看']) assert(!content.includes(text), text);
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
    assert(Buffer.byteLength(message.content) <= 4096);
    assert(message.content.includes('V3'));assert(message.content.includes('客户：发布版本客户'));assert(message.content.includes('SP-MIN'));assert(message.content.includes(`第${i+1}/${messages.length}部分`));
  }
  const raw = messages.flatMap(m => m.content.split('\n')).filter(line => line.startsWith('| extension')).map(line => line.replace(/^\| extension(?:（续）)? \| /, '').replace(/ \|$/, '').replace(/\\([\\|*`_~<>\[\]])/g, '$1')).join('');
  assert.equal(raw, chunk.repeat(900) + '最后一行');
});


test('same internal number distinguishes full published customers and uses the actual reviewer',()=>{
 const customer='客户完整名称'.repeat(20)+'|A';
 const first=buildStandardPublicationMessages({...standard,customer:'错误当前客户'},{...version,customer,reviewedBy:'历史审核员'},category,{reviewerName:'本次审核员'});
 const second=buildStandardPublicationMessages(standard,{...version,customer:'另一客户'},category,{});
 assert.equal(first.length,1);assert(first[0].content.includes(customer.replace('|','\\|')));assert(!first[0].content.includes('错误当前客户'));
 assert(first[0].content.includes('审核人：本次审核员'));assert(!first[0].content.includes('历史审核员'));assert(second[0].content.includes('客户：另一客户'));assert(second[0].content.includes('审核人：未记录'));
 const fallback=buildStandardPublicationMessages(standard,{...version,reviewedBy:'已记录审核员'},category,{});assert(fallback[0].content.includes('审核人：已记录审核员'));
 const direct=buildStandardPublicationMessages(standard,{...version,reviewedBy:'实际发布人',updatedBy:'旧编辑者'},category,{directPublish:true});assert(direct[0].content.includes('发布人：实际发布人'));assert(!direct[0].content.includes('审核人：'));
});

test('empty parameter data still produces one identifiable detail',()=>{
 const messages=buildStandardPublicationMessages(standard,{...version,fields:{}},{fields:[]},{reviewerName:'审核员'});
 assert.equal(messages.length,1);assert(messages[0].content.includes('完整标准参数'));
 assert(messages[0].content.includes('客户：发布版本客户'));assert(messages[0].content.includes('审核人：审核员'));
});
