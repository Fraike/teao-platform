import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCommentHistory, planCommentRepair } from '../server/services/standard-comment-repair.js';

test('dates start blocks; material numbers and embedded dates remain intact', () => {
  assert.deepEqual(parseCommentHistory('2022.1.23新增\n U9号：2010.0431.0805\n包装一袋装100PCS，一箱300PCS', 'asus'), [
    { changedAt: '2022-01-23', description: '新增\nU9号：2010.0431.0805\n包装一袋装100PCS，一箱300PCS' },
  ]);
  assert.deepEqual(parseCommentHistory('2024.2.30 不合法日期\n无日期说明', ''), [{changedAt:'',description:'2024.2.30 不合法日期\n无日期说明'}]);
  assert.deepEqual(parseCommentHistory('ta-05:\n2024/7/26', 'asus'), [{changedAt:'2024-07-26',description:'（原批注仅记录日期）'}]);
  assert.deepEqual(parseCommentHistory('原2021.11.1新增\n料号4016.0152', ''), [{changedAt:'',description:'原2021.11.1新增\n料号4016.0152'}]);
});

test('full seasonal chronology includes cancellation and multiline changes without guessing values', () => {
  const rows = parseCommentHistory('2025.2.18\n原90-130改120-160（夏季标准）\n2025.11.01扭矩改100-140（冬季标准）\n2026.2.4\n取消冬季扭矩');
  assert.equal(rows.length, 3);
  assert.equal(rows[2].description, '取消冬季扭矩');
  assert.equal(rows[2].changedAt, '2026-02-04');
  assert.deepEqual(parseCommentHistory('Administrator:\n', 'Administrator'), []);
});

test('whole-text imports also need strict date verification',()=>{
 const comment={id:'c',standard_id:'s',version_id:'v',source_cell:'F1',field_key:'test_standard',field_label:'测试范围',author:'a',text:'U9号：2010.0431.0805'};
 const row={...comment,id:'r',description:comment.text,changed_at:'2010-04',created_at:'new-import'};
 const plan=planCommentRepair([comment],[row],{legacyCreatedPrefix:'legacy'});
 assert.deepEqual(plan.dateEdits,[{id:'r',changed_at:''}]);
});

test('repair only replaces proven legacy import rows and is idempotent, never overwrites manual history', () => {
  const comment={id:'c',standard_id:'s',version_id:'v',source_cell:'F487',field_key:'test_standard',field_label:'测试范围',author:'asus',text:'2025.2.18 夏季120-160\n2025.11.1 冬季100-140'};
  const old={id:'old',standard_id:'s',version_id:'v',source_cell:'',field_key:'test_standard',author:'asus',description:'夏季120-160',changed_at:'2025-02-18',created_at:'legacy-batch',seq:1};
  const manual={...old,id:'manual',created_at:'manual',description:'人工记录'};
  const plan=planCommentRepair([comment],[old,manual],{legacyCreatedPrefix:'legacy-batch'});
  assert.deepEqual(plan.removeIds,[]);
  assert.deepEqual(plan.link.map(row=>row.id),['old']);
  assert.equal(plan.insert.length,1);
  assert.equal(plan.insert[0].source_cell,'F487');
  const completed=[...plan.insert.map((r,i)=>({...r,id:`new${i}`,created_at:'now'})),{...old,source_cell:'F487'}];
  const repeat=planCommentRepair([comment],[manual,...completed],{legacyCreatedPrefix:'legacy-batch'});
  assert.equal(repeat.removeIds.length,0);
  assert.equal(repeat.insert.length,0);
  assert.throws(()=>planCommentRepair([comment,{...comment,id:'c2',source_cell:'H487'}],[old],{legacyCreatedPrefix:'legacy-batch'}),/多个批注/);
});
