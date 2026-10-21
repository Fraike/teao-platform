import { getDB } from './standard-store.js';
import { canDirectRetire } from './standard-retirement-permissions.js';

function pageNumber(value, fallback, maximum) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw Object.assign(new Error('分页参数无效'), { status: 400 });
  }
  return parsed;
}

function pendingQuery(user) {
  const admin = user.role === 'admin';
  const legacy = user.permissions?.includes('engineering_review');
  const self = `NOT (COALESCE(v.submitted_by_id,'')=@userId OR (COALESCE(v.submitted_by_id,'')='' AND COALESCE(v.submitted_by,'')=@userName))`;
  const standardAccess = admin ? '1=1' : `(${self} AND (v.assigned_reviewer_id=@userId ${legacy ? "OR COALESCE(v.assigned_reviewer_id,'')=''" : ''}))`;
  const retirementAccess = admin ? '1=1' : canDirectRetire(user) ? 'r.reviewer_id=@userId AND r.applicant_id<>@userId' : '0=1';
  return `WITH pending AS (
    SELECT 'review:'||v.id AS task_id,'standard' AS kind,s.id,s.serial_no,v.category_key,v.customer,v.model,
      v.assigned_reviewer_id AS reviewer_id,v.assigned_reviewer_name AS reviewer_name,
      COALESCE(v.submitted_at,v.updated_at,v.created_at) AS submitted_at
    FROM product_standard_versions v JOIN product_standards s ON s.id=v.standard_id
    WHERE v.status='pending_review' AND ${standardAccess}
      AND NOT EXISTS (SELECT 1 FROM product_standard_versions newer WHERE newer.standard_id=v.standard_id
        AND newer.version_no>v.version_no AND newer.status IN ('draft','pending_review','published','obsolete'))
    UNION ALL
    SELECT 'retirement:'||r.id,'retirement',s.id,s.serial_no,v.category_key,v.customer,v.model,r.reviewer_id,r.reviewer_name,r.created_at
    FROM standard_retirement_requests r JOIN product_standard_versions v ON v.id=r.version_id
    JOIN product_standards s ON s.id=r.standard_id
    WHERE r.status='pending' AND v.status='published' AND v.revision=r.version_revision AND ${retirementAccess}
  )`;
}

export function listPendingReviews(user, options = {}) {
  const page = pageNumber(options.page, 1, 1000000), pageSize = pageNumber(options.pageSize, 20, 20);
  if (options.category !== undefined && typeof options.category !== 'string') throw Object.assign(new Error('分类参数无效'), { status: 400 });
  const category = options.category?.trim() || '';
  const d = getDB(), cte = pendingQuery(user);
  // Keep one bounded shape for admin and ordinary callers; unused parameters are excluded below.
  const scoped = user.role === 'admin' ? {} : { userId: user.id, userName: user.name || user.username || '' };
  const categories = d.prepare(`${cte} SELECT p.category_key AS categoryKey,COALESCE(c.name,p.category_key) AS categoryName,
    COUNT(*) AS total,SUM(p.kind='standard') AS standardCount,SUM(p.kind='retirement') AS retirementCount
    FROM pending p LEFT JOIN standard_categories c ON c.key=p.category_key GROUP BY p.category_key ORDER BY p.category_key`).all(scoped);
  const where = category ? 'WHERE p.category_key=@category' : '';
  const params = category ? { ...scoped, category } : scoped;
  const total = d.prepare(`${cte} SELECT COUNT(*) AS total FROM pending p ${where}`).get(params).total;
  const data = d.prepare(`${cte} SELECT p.*,COALESCE(c.name,p.category_key) AS category_name
    FROM pending p LEFT JOIN standard_categories c ON c.key=p.category_key ${where}
    ORDER BY p.submitted_at DESC,p.task_id ASC LIMIT @limit OFFSET @offset`).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize })
    .map(row => ({ taskId: row.task_id, kind: row.kind, id: row.id, serialNo: row.serial_no, categoryKey: row.category_key,
      categoryName: row.category_name, customer: row.customer, model: row.model, reviewerId: row.reviewer_id || '',
      reviewerName: row.reviewer_name || '未指定（历史任务）', submittedAt: row.submitted_at }));
  return { data, total, overallTotal: categories.reduce((sum, item) => sum + item.total, 0), categories, page, pageSize };
}
