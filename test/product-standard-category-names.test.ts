import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STANDARD_CATEGORY_NAMES, STANDARD_CATEGORY_ALIASES } from '../server/shared/product-classification.ts';
import { parseStandardImportRows } from '../src/lib/standardImport.ts';
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'category-names-'));
const store = await import('../server/services/standard-store.js');
store.initDB();
try {
  for (const [key, name] of Object.entries(STANDARD_CATEGORY_NAMES)) {
    assert.equal(store.listCategories().find(c => c.key === key)?.name, name);
  }
  const standard = store.createStandard({ serialNo: 'RENAME', categoryKey: 'gear_damper', customer: '客户', model: 'M', fields: { gear_spec: '20齿' } }, { id: 'admin', name: '管理员', role: 'admin' });
  const before = store.getDB().prepare('SELECT * FROM product_standard_versions').all();
  store.getDB().prepare("UPDATE standard_categories SET name='齿形阻尼器' WHERE key='gear_damper'").run();
  store.initDB();
  assert.equal(store.listCategories().find(c => c.key === 'gear_damper')?.name, '齿轮阻尼器');
  assert.deepEqual(store.getDB().prepare('SELECT * FROM product_standard_versions').all(), before);
  assert.equal(standard.versions[0].fields.gear_spec, '20齿');
  for (const [name, key] of Object.entries(STANDARD_CATEGORY_ALIASES)) {
    if (key === 'sanitary_damper') continue;
    const result = parseStandardImportRows([[name], ['SP-NAME', '客户', 'M', '', '10', '12', '黑']]);
    assert.equal(result.records[0]?.categoryKey, key, name);
    assert.equal(result.records[0]?.fields.torque_standard, '10', name);
  }
  console.log('Canonical category names update without standard versions; all old/new import titles supported');
} finally { store.closeDB(); }
