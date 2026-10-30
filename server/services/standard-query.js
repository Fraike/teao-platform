import { canDirectRetire } from './standard-retirement-permissions.js';
import { getDB } from './standard-store.js';
import { standardBusinessFields } from './standard-fields.js';

function badQuery(message) { const error = new Error(message); error.status = 400; throw error; }
function text(value, name) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 2000) badQuery(`${name}格式无效`);
  return value.trim();
}
function integer(value, fallback, maximum, name) {
  if (value === undefined) return fallback;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) badQuery(`${name}格式无效`);
  return Math.min(result, maximum);
}

function visibleQuery(options) {
  const allowObsolete = !options.onlyPublished || options.includeObsolete || options.status === 'obsolete';
  const deleted = !options.onlyPublished && options.status === 'deleted' ? `(SELECT id FROM product_standard_versions WHERE standard_id=s.id AND status='deleted' ORDER BY version_no DESC LIMIT 1)` : null;
  const chosen = deleted || (options.onlyPublished ? `COALESCE(w.id,p.id, ${allowObsolete ? 'o.id' : 'NULL'})` : 'COALESCE(w.id, p.id, o.id)');
  const working = options.onlyPublished && !options.reviewerId ? 'NULL' : `(SELECT id FROM product_standard_versions WHERE standard_id=s.id AND status IN ('draft','pending_review') ${options.onlyPublished ? "AND status='pending_review' AND assigned_reviewer_id=@viewerId" : ""} ORDER BY version_no DESC LIMIT 1)`;
  return `WITH visible AS (
    SELECT s.id AS standard_key, s.serial_no AS standard_serial, v.*,
      rr.id AS retirement_id,rr.reviewer_id AS retirement_reviewer_id,rr.reviewer_name AS retirement_reviewer_name,
      rr.applicant_id AS retirement_applicant_id,rr.applicant_name AS retirement_applicant_name,rr.reason AS retirement_reason,
      rr.revision AS retirement_revision,rr.version_revision AS retirement_version_revision,rr.version_id AS retirement_version_id,
      CASE WHEN v.status IN ('draft','pending_review') AND p.id IS NOT NULL THEN 1 ELSE 0 END AS has_pending,
      CASE WHEN v.status='deleted' THEN COALESCE(v.updated_at,v.created_at) WHEN w.id IS NOT NULL THEN COALESCE(CASE WHEN w.status='pending_review' THEN w.submitted_at END,w.updated_at,w.created_at)
        WHEN p.id IS NOT NULL THEN COALESCE(p.published_at,p.updated_at,p.created_at) ELSE COALESCE(v.updated_at,v.created_at) END AS display_updated_at,
      CASE WHEN v.status='deleted' THEN COALESCE(NULLIF(v.updated_by,''),v.created_by) WHEN w.id IS NOT NULL THEN COALESCE(NULLIF(w.updated_by,''),w.created_by)
        WHEN p.id IS NOT NULL THEN COALESCE(NULLIF(p.reviewed_by,''),NULLIF(p.updated_by,''),p.created_by) ELSE COALESCE(NULLIF(v.updated_by,''),v.created_by) END AS display_updated_by,
      w.submitted_by_id AS working_submitter_id,w.submitted_by AS working_submitter,
      EXISTS(SELECT 1 FROM product_standard_versions previous WHERE previous.standard_id=s.id AND previous.version_no<v.version_no AND previous.published_at IS NOT NULL) AS has_previous_publication
    FROM product_standards s
    LEFT JOIN product_standard_versions w ON w.id=${working}
    LEFT JOIN product_standard_versions p ON p.id=(SELECT id FROM product_standard_versions WHERE standard_id=s.id AND status='published' ORDER BY version_no DESC LIMIT 1)
    LEFT JOIN product_standard_versions o ON o.id=(SELECT id FROM product_standard_versions WHERE standard_id=s.id AND status='obsolete' ORDER BY version_no DESC LIMIT 1)
    JOIN product_standard_versions v ON v.id=${chosen}
    LEFT JOIN standard_retirement_requests rr ON rr.standard_id=s.id AND rr.status='pending' AND v.id=p.id AND rr.version_id=p.id AND rr.version_revision=p.revision
  )`;
}

function filters(options) {
  const where = [], params = options.reviewerId ? {viewerId:text(options.reviewerId,"reviewerId")} : {};
  const equality = {category:'category_key', status:'status', standardType:'standard_type'};
  for (const [name,column] of Object.entries(equality)) {
    const value=text(options[name],name);
    if (value && value !== 'all') { where.push(`${column}=@${name}`); params[name]=value; }
  }
  for (const [name,column] of Object.entries({serialNo:'standard_serial',customer:'customer',model:'model',customerPartNo:'customer_part_no',vehicleModel:'vehicle_model'})) {
    const value=text(options[name],name);
    if (value) { where.push(`instr(lower(COALESCE(${column},'')),lower(@${name}))>0`); params[name]=value; }
  }
  const search=text(options.search,'search');
  if(search){where.push("instr(lower(standard_serial || ' ' || customer || ' ' || model || ' ' || customer_part_no || ' ' || vehicle_model || ' ' || COALESCE(json_extract(CASE WHEN json_valid(fields) THEN fields ELSE '{}' END,'$.customer_model'),'') || ' ' || COALESCE(json_extract(CASE WHEN json_valid(fields) THEN fields ELSE '{}' END,'$.test_standard'),'') || ' ' || COALESCE(json_extract(CASE WHEN json_valid(fields) THEN fields ELSE '{}' END,'$.winter_test_standard'),'')),lower(@search))>0");params.search=search;}
  if(options.excludeObsolete) where.push("status!='obsolete'");
  return {where:where.length ? `WHERE ${where.join(' AND ')}` : '',params};
}

function listItem(row, categoryNames, onlyPublished) {
  let fields;try{fields=JSON.parse(row.fields);}catch{fields={};}
  fields=standardBusinessFields(row.category_key,fields);
  return {
    createdById:row.created_by_id||'',id:row.standard_key,versionId:row.id,revision:row.revision,serialNo:row.standard_serial,categoryKey:row.category_key,categoryName:categoryNames.get(row.category_key)||row.category_key,
    standardType:row.standard_type,status:row.status,versionNo:row.version_no,customer:row.customer||'',model:row.model||'',
    customerPartNo:row.customer_part_no||'',vehicleModel:row.vehicle_model||'',fields,hasPending:Boolean(row.has_pending),
    updatedAt:row.display_updated_at,updatedBy:row.display_updated_by,
    submittedById:row.working_submitter_id||'',submittedBy:row.working_submitter||'',reviewComment:onlyPublished?'':row.review_comment||'',
    retirementRequest:row.retirement_id ? {id:row.retirement_id,reviewerId:row.retirement_reviewer_id,reviewerName:row.retirement_reviewer_name,
      applicantId:row.retirement_applicant_id,applicantName:row.retirement_applicant_name,reason:row.retirement_reason,
      revision:row.retirement_revision,versionRevision:row.retirement_version_revision,versionId:row.retirement_version_id,status:'pending'} : null,
    assignedReviewerId:row.assigned_reviewer_id||'',
    publishedAt:row.published_at||'',reviewedAt:row.reviewed_at||'',hasPreviousPublication:Boolean(row.has_previous_publication),
  };
}

export function getStandardQueryVersion() {
  return String(getDB().prepare('SELECT revision FROM standard_query_state WHERE id=1').get().revision);
}

const pageCaches = new WeakMap();

export function listStandardPage(options={}) {
  const d=getDB(),page=integer(options.page,1,1000000,'page');
  const pageSize=options.pageSize===null ? null : integer(options.pageSize,50,200,'pageSize');
  const {where,params}=filters(options),cte=visibleQuery(options);
  const version=getStandardQueryVersion();
  let cache=pageCaches.get(d);
  if(!cache || cache.version!==version){cache={version,pages:new Map()};pageCaches.set(d,cache);}
  const key=JSON.stringify([Boolean(options.onlyPublished),options.reviewerId||"",Boolean(options.includeObsolete),options.status,where,params,page,pageSize]);
  if(pageSize!==null && cache.pages.has(key)) return structuredClone(cache.pages.get(key));
  const metadata=d.prepare(`${cte} SELECT COUNT(*) AS total,MAX(display_updated_at) AS updatedAt,
    (SELECT COUNT(*) FROM visible WHERE status IN ('draft','pending_review','published')) AS overallTotal FROM visible ${where}`).get(params);
  const names=new Map(d.prepare('SELECT key,name FROM standard_categories').all().map(r=>[r.key,r.name]));
  const sql=`${cte} SELECT * FROM visible ${where} ORDER BY standard_serial ASC,standard_key ASC ${pageSize===null?'':'LIMIT @limit OFFSET @offset'}`;
  const rows=d.prepare(sql).all(pageSize===null?params:{...params,limit:pageSize,offset:(page-1)*pageSize});
  // 删除归档是独立查看模式；总数始终使用正常可见版本，并忽略筛选条件。
  const overallTotal=options.status==='deleted'
    ? d.prepare(`${visibleQuery({...options,status:undefined})} SELECT COUNT(*) AS total FROM visible WHERE status IN ('draft','pending_review','published')`).get(options.reviewerId ? {viewerId:options.reviewerId} : {}).total
    : metadata.overallTotal;
  const result={data:rows.map(r=>listItem(r,names,options.onlyPublished)),total:metadata.total,overallTotal,page,pageSize,updatedAt:metadata.updatedAt||'',version};
  if(pageSize!==null){cache.pages.set(key,result);while(cache.pages.size>32)cache.pages.delete(cache.pages.keys().next().value);}
  return structuredClone(result);
}

export function listPendingStandardNotifications(user,{limit=20}={}) {
  if(!user) return {total:0,items:[]};
  const d=getDB(),params={userId:user.id,userName:user.name||user.username||''};
  const legacyAllowed=user.role==='admin'||user.permissions?.includes('engineering_review');
  const where=`WHERE v.status='pending_review' AND (v.assigned_reviewer_id=@userId ${legacyAllowed ? "OR COALESCE(v.assigned_reviewer_id,'')=''" : ""}) AND NOT (COALESCE(v.submitted_by_id,'')=@userId OR (COALESCE(v.submitted_by_id,'')='' AND COALESCE(v.submitted_by,'')=@userName))
    AND NOT EXISTS (SELECT 1 FROM product_standard_versions newer WHERE newer.standard_id=v.standard_id AND newer.status IN ('draft','pending_review') AND newer.version_no>v.version_no)`;
  const total=d.prepare(`SELECT COUNT(*) AS total FROM product_standard_versions v ${where}`).get(params).total;
  const rows=d.prepare(`SELECT s.id,s.serial_no,v.customer,v.model,v.category_key,COALESCE(v.submitted_at,v.updated_at,v.created_at) AS time
    FROM product_standard_versions v JOIN product_standards s ON s.id=v.standard_id ${where} ORDER BY time DESC,s.id ASC LIMIT @limit`).all({...params,limit:Math.min(20,Math.max(1,Number(limit)||20))});
  const retirementWhere="WHERE r.status='pending' AND r.reviewer_id=@userId AND r.applicant_id<>@userId AND v.status='published' AND v.revision=r.version_revision";
  const retirementCount=canDirectRetire(user) ? d.prepare(`SELECT COUNT(*) AS total FROM standard_retirement_requests r JOIN product_standard_versions v ON v.id=r.version_id ${retirementWhere}`).get({userId:user.id}).total : 0;
  const retirementRows=retirementCount ? d.prepare(`SELECT r.id AS request_id,s.id,s.serial_no,v.customer,v.model,v.category_key,r.created_at AS time
    FROM standard_retirement_requests r JOIN product_standards s ON s.id=r.standard_id JOIN product_standard_versions v ON v.id=r.version_id
    ${retirementWhere} ORDER BY r.created_at DESC,r.id ASC LIMIT 20`).all({userId:user.id}) : [];
  const items=[...rows.map(r=>({id:r.id,serialNo:r.serial_no,customer:r.customer,model:r.model,categoryKey:r.category_key,updatedAt:r.time})),
    ...retirementRows.map(r=>({id:r.id,requestId:r.request_id,kind:'retirement',serialNo:r.serial_no,customer:r.customer,model:r.model,categoryKey:r.category_key,updatedAt:r.time}))]
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,Math.min(20,Math.max(1,Number(limit)||20)));
  return {total:total+retirementCount,items};
}
