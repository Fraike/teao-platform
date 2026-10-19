import { createHash, randomUUID } from 'node:crypto';

const text = value => String(value ?? '').trim();
const name = value => text(value).replace(/[▲*\s]/g, '');

export function previewStandardReclassification(db, source) {
  const rows = db.prepare(`SELECT v.* FROM product_standard_versions v WHERE v.version_no =
    (SELECT MAX(version_no) FROM product_standard_versions WHERE standard_id = v.standard_id)`).all();
  const plans = [], conflicts = [];
  for (const row of rows) {
    if (row.category_key !== 'gear_damper') continue;
    const candidates = source.filter(s => ['rack_damper', 'barrel_damper'].includes(s.categoryKey) && s.serialNo === row.serial_no && s.model === row.model);
    if (!candidates.length) continue;
    const matches = !row.customer && candidates.length === 1 ? candidates : candidates.filter(s => name(s.customer.replace(row.vehicle_model || '\u0000', '')) === name(row.customer));
    if (matches.length !== 1) { conflicts.push({id:row.standard_id,serialNo:row.serial_no,reason:'客户身份匹配不唯一'}); continue; }
    const fields = JSON.parse(row.fields), expected = matches[0].fields;
    const categoryKey = matches[0].categoryKey, directionKey = categoryKey === 'rack_damper' ? 'torque_direction' : 'rib_return';
    if (fields.gear_spec !== undefined && expected[directionKey] !== fields.gear_spec) {
      conflicts.push({id:row.standard_id,serialNo:row.serial_no,reason:'已有分类参数与原表不同，需要审核确认'}); continue;
    }
    if (fields.lock_direction && expected.lock_direction !== fields.lock_direction) {
      conflicts.push({id:row.standard_id,serialNo:row.serial_no,reason:'已有装锁方向与原表不同，需要审核确认'}); continue;
    }
    plans.push({id:row.standard_id,serialNo:row.serial_no,customer:row.customer,model:row.model,categoryKey,directionKey,customerCorrection:!row.customer ? matches[0].customer : null,lockDirection:expected.lock_direction || ''});
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM product_standard_versions ORDER BY id').all().map(v=>({id:v.id,standardId:v.standard_id,version:v.version_no,revision:v.revision || 1,category:v.category_key,customer:v.customer,model:v.model,partNo:v.customer_part_no,project:v.vehicle_model,status:v.status,fields:v.fields,standardType:v.standard_type})))).digest('hex');
  return { plans, conflicts, fingerprint };
}

export function applyStandardReclassification(db, source, preview) {
  const current = previewStandardReclassification(db, source);
  if (current.fingerprint !== preview.fingerprint || JSON.stringify(current.plans) !== JSON.stringify(preview.plans)) throw new Error('数据已变化，请重新预览');
  return db.transaction(() => {
    for (const plan of current.plans) {
      const versions = db.prepare('SELECT * FROM product_standard_versions WHERE standard_id = ?').all(plan.id);
      for (const v of versions) {
        if (v.category_key !== 'gear_damper') continue;
        const fields = JSON.parse(v.fields);
        if (fields.gear_spec !== undefined) { fields[plan.directionKey] = fields.gear_spec; delete fields.gear_spec; }
        if (!fields.lock_direction && plan.lockDirection) fields.lock_direction = plan.lockDirection;
        db.prepare('UPDATE product_standard_versions SET category_key = ?, fields = ?, customer = ?, revision = revision + 1 WHERE id = ?')
          .run(plan.categoryKey, JSON.stringify(fields), !v.customer && plan.customerCorrection ? plan.customerCorrection : v.customer, v.id);
      }
      const latest = versions.reduce((a,b)=>a.version_no>b.version_no?a:b);
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO product_standard_changes (id,standard_id,version_id,field_key,field_label,author,changed_at,description,sort_date,seq,created_at)
        VALUES (?,?,?,'category_key','产品分类','Excel 分类核对',?, ?, ?, (SELECT COALESCE(MAX(seq),0)+1 FROM product_standard_changes), ?)`)
        .run(randomUUID(),plan.id,latest.id,now.slice(0,10),`依据原 Excel 纠正分类为${plan.categoryKey === 'rack_damper' ? '齿条阻尼器' : '筒型阻尼器'}；保留原审批状态及版本，补齐原表遗漏字段。`,Number(now.slice(0,10).replaceAll('-','')),now);
      db.prepare('UPDATE product_standards SET category_key = ? WHERE id = ?').run(plan.categoryKey, plan.id);
      db.prepare(`UPDATE product_standard_changes SET field_key = ?, field_label = ?
        WHERE standard_id = ? AND (field_key = 'gear_spec' OR field_label = '齿轮规格')`).run(plan.directionKey, plan.categoryKey === 'rack_damper' ? '扭矩方向' : '筋条是否归位', plan.id);
      db.prepare(`UPDATE product_standard_changes SET field_label = '测试范围' WHERE standard_id = ? AND field_label = '测试标准gf.cm'`).run(plan.id);
      if (plan.categoryKey === 'rack_damper') db.prepare(`UPDATE product_standard_changes SET field_label = '打码' WHERE standard_id = ? AND field_label IN ('打点颜色/喷码', '打点颜色')`).run(plan.id);
    }
    return {moved:current.plans.length,conflicts:current.conflicts};
  })();
}
