import { randomUUID } from 'node:crypto';
import { getDB, getStandard, retireStandard, recordStandardOperation } from './standard-store.js';
import { getUserById, listUsers } from './users.js';
import { canDirectRetire } from './standard-retirement-permissions.js';
export { canDirectRetire };
const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };

export function retirementRequestRow(r) {
  return {id:r.id,standardId:r.standard_id,versionId:r.version_id,versionRevision:r.version_revision,
    applicantId:r.applicant_id,applicantName:r.applicant_name,reviewerId:r.reviewer_id,reviewerName:r.reviewer_name,
    reason:r.reason,status:r.status,revision:r.revision,createdAt:r.created_at,reviewedAt:r.reviewed_at||'',
    reviewedBy:r.reviewed_by||'',reviewComment:r.review_comment||''};
}

export function retirementReviewers(user) {
  return listUsers().filter(u=>u.status==='active' && u.id!==user.id && canDirectRetire(u))
    .map(u=>({id:u.id,name:u.name||u.username}));
}

export function listRetirementRequests(id) {
  return getDB().prepare('SELECT * FROM standard_retirement_requests WHERE standard_id=? ORDER BY created_at DESC,id DESC LIMIT 20').all(id).map(retirementRequestRow);
}

function publishedSnapshot(d,id,expected) {
  const latest=d.prepare("SELECT * FROM product_standard_versions WHERE standard_id=? AND status!='deleted' ORDER BY version_no DESC LIMIT 1").get(id);
  if(!latest || latest.id!==expected?.versionId || latest.revision!==expected?.revision) fail(409,'标准版本已变化，请刷新后重试');
  if(latest.status!=='published') fail(409,'请先处理修订稿，仅可申请停用当前已发布标准');
  return latest;
}

export function createRetirementRequest(id,input,user) {
  if(user.role!=='admin' && !user.permissions?.includes('engineering_submit')) fail(403,'无申请停用权限');
  if(typeof input?.reason!=='string' || !input.reason.trim() || input.reason.length>2000) fail(400,'停用原因必填，最多2000字');
  const reviewer=getUserById(input.reviewerId);
  if(!reviewer || reviewer.status!=='active' || reviewer.id===user.id || !canDirectRetire(reviewer)) fail(400,'请选择有直接停用权限且不是本人的审核人');
  const d=getDB(),requestId=randomUUID(),now=new Date().toISOString();
  d.transaction(()=>{
    const current=publishedSnapshot(d,id,input);
    if(d.prepare("SELECT id FROM standard_retirement_requests WHERE standard_id=? AND status='pending'").get(id)) fail(409,'已有停用申请待审核，请勿重复提交');
    d.prepare(`INSERT INTO standard_retirement_requests(id,standard_id,version_id,version_revision,applicant_id,applicant_name,reviewer_id,reviewer_name,reason,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(requestId,id,current.id,current.revision,user.id,user.name||user.username,reviewer.id,reviewer.name||reviewer.username,input.reason.trim(),now);
    recordStandardOperation(id,`申请停用，审核人：${reviewer.name||reviewer.username}；原因：${input.reason.trim()}`,user,current.id);
  })();
  return retirementRequestRow(d.prepare('SELECT * FROM standard_retirement_requests WHERE id=?').get(requestId));
}

export function reviewRetirementRequest(id,requestId,input,user) {
  if(!canDirectRetire(user)) fail(403,'无直接停用权限');
  if(typeof input?.approve!=='boolean') fail(400,'审核结果必须为布尔值');
  const comment=input.comment??'';
  if(typeof comment!=='string' || comment.length>2000 || (!input.approve && !comment.trim())) fail(400,'驳回原因必填，最多2000字');
  const d=getDB(),now=new Date().toISOString();
  d.transaction(()=>{
    const r=d.prepare('SELECT * FROM standard_retirement_requests WHERE id=? AND standard_id=?').get(requestId,id);
    if(!r || r.status!=='pending' || r.revision!==input.revision) fail(409,'停用申请已变化，请刷新后重试');
    if(r.applicant_id===user.id || (r.reviewer_id!==user.id && !(user.role==='admin' && !input.approve))) fail(403,'不是指定审核人，不能处理此申请');
    publishedSnapshot(d,id,{versionId:r.version_id,revision:r.version_revision});
    // Mark first so version invalidation triggers do not invalidate the request being approved.
    // Both updates share the transaction: a failed retirement rolls this state back too.
    d.prepare(`UPDATE standard_retirement_requests SET status=?,revision=revision+1,reviewed_at=?,reviewed_by_id=?,reviewed_by=?,review_comment=? WHERE id=?`)
      .run(input.approve?'approved':'rejected',now,user.id,user.name||user.username,comment.trim(),requestId);
    if(input.approve) retireStandard(id,{versionId:r.version_id,revision:r.version_revision,reason:r.reason},user);
    recordStandardOperation(id,input.approve?'停用申请审核通过':`停用申请被驳回：${comment.trim()}`,user,r.version_id);
  })();
  return {data:getStandard(id),request:retirementRequestRow(d.prepare('SELECT * FROM standard_retirement_requests WHERE id=?').get(requestId))};
}
