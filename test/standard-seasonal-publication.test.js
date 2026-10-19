import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildStandardPublication, buildStandardPublicationMessages, publicationSections } from '../server/services/standard-publication.js';

const category = { fields: [{ key: 'test_standard', label: '测试标准gf.cm' }] };
const standard = { serialNo: 'SP0006-C', categoryKey: 'gear_damper' };
const version = { versionNo: 1, fields: { test_standard: '120-160', winter_test_standard: '100-140\n完整冬季要求', unknown: '保留未知值' } };

test('both publication formats distinguish seasons and preserve full winter and unknown values once', () => {
  const rows = publicationSections(standard, version, category)[1].rows;
  assert.deepEqual(rows, [['夏季／常规测试标准gf.cm', '120-160'], ['冬季测试标准', '100-140\n完整冬季要求'], ['unknown', '保留未知值']]);
  for (const text of [buildStandardPublication(standard, version, category, {}),
    buildStandardPublicationMessages(standard, version, category).map(m => m.content).join('\n')]) {
    for (const value of ['夏季／常规测试标准gf.cm', '冬季测试标准', '100-140', '完整冬季要求', '保留未知值']) assert(text.includes(value), value);
    assert(!text.includes('winter_test_standard'));
  }
});

test('blank winter produces no placeholder notification in either format, including already augmented categories', () => {
  const augmented = { fields: [...category.fields, { key: 'winter_test_standard', label: '冬季测试标准' }] };
  for (const value of [undefined, '', '  ']) {
    const summer = { ...version, fields: { test_standard: '120-160', winter_test_standard: value } };
    assert(!publicationSections(standard, summer, augmented)[1].rows.some(([label]) => label.includes('冬季')));
    assert(!buildStandardPublication(standard, summer, augmented, {}).includes('冬季测试标准'));
    assert(!buildStandardPublicationMessages(standard, summer, augmented).some(m => m.content.includes('冬季测试标准')));
  }
});

test('category read augments stored old definitions without rewriting them; winter validates as normal text', async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'standard-seasonal-'));
  const store = await import('../server/services/standard-store.js');
  store.initDB();
  try {
    const db = store.getDB();
    db.prepare('UPDATE standard_categories SET fields=? WHERE key=?').run(JSON.stringify(category.fields), 'gear_damper');
    const before = db.prepare('SELECT fields FROM standard_categories WHERE key=?').get('gear_damper').fields;
    const categories = store.listCategories();
    assert.deepEqual(categories.find(c => c.key === 'gear_damper').fields.map(f => f.key), ['test_standard', 'winter_test_standard']);
    assert.equal(db.prepare('SELECT fields FROM standard_categories WHERE key=?').get('gear_damper').fields, before);
    for (const item of categories) {
      if (item.fields.some(f => f.key === 'test_standard')) assert.equal(item.fields.filter(f => f.key === 'winter_test_standard').length, 1);
      else assert(!item.fields.some(f => f.key === 'winter_test_standard'));
    }
    const created = store.createStandard({ serialNo: 'SP-SEASON', categoryKey: 'gear_damper', customer: '客户', model: '型号', fields: version.fields }, { id: 'admin', name: '管理员', role: 'admin' });
    assert.equal(created.versions[0].fields.winter_test_standard, version.fields.winter_test_standard);
    assert.throws(() => store.createStandard({ categoryKey: 'gear_damper', fields: { winter_test_standard: {} } }, { role: 'admin' }), /规格参数必须为文本/);
  } finally { store.closeDB(); }
});
