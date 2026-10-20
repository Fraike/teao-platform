export function initializeRetirementSchema(d) {
  d.exec(`CREATE TABLE IF NOT EXISTS standard_retirement_requests (
    id TEXT PRIMARY KEY,standard_id TEXT NOT NULL,version_id TEXT NOT NULL,version_revision INTEGER NOT NULL,
    applicant_id TEXT NOT NULL,applicant_name TEXT NOT NULL,reviewer_id TEXT NOT NULL,reviewer_name TEXT NOT NULL,
    reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,reviewed_at TEXT,reviewed_by_id TEXT,reviewed_by TEXT,review_comment TEXT DEFAULT ''
  );
  CREATE UNIQUE INDEX IF NOT EXISTS retirement_one_pending ON standard_retirement_requests(standard_id) WHERE status='pending';
  CREATE INDEX IF NOT EXISTS retirement_reviewer ON standard_retirement_requests(status,reviewer_id,created_at);
  CREATE INDEX IF NOT EXISTS retirement_history ON standard_retirement_requests(standard_id,created_at DESC);
  CREATE TRIGGER IF NOT EXISTS retirement_invalidate_insert AFTER INSERT ON product_standard_versions
    WHEN NEW.status IN ('draft','pending_review','published','obsolete') BEGIN
    UPDATE standard_retirement_requests SET status='invalidated',revision=revision+1,
      review_comment='标准版本或状态已变化，请重新申请'
    WHERE standard_id=NEW.standard_id AND status='pending'; END;
  CREATE TRIGGER IF NOT EXISTS retirement_invalidate_update AFTER UPDATE ON product_standard_versions BEGIN
    UPDATE standard_retirement_requests SET status='invalidated',revision=revision+1,
      review_comment='标准版本或状态已变化，请重新申请'
    WHERE standard_id=NEW.standard_id AND status='pending' AND (
      (version_id=NEW.id AND (NEW.status!='published' OR version_revision!=NEW.revision))
      OR NEW.status IN ('draft','pending_review')); END;
  CREATE TRIGGER IF NOT EXISTS retirement_invalidate_delete AFTER DELETE ON product_standard_versions BEGIN
    UPDATE standard_retirement_requests SET status='invalidated',revision=revision+1,
      review_comment='标准版本已变化，请重新申请'
    WHERE version_id=OLD.id AND status='pending'; END;`);
  for (const event of ['INSERT','UPDATE','DELETE']) d.exec(`CREATE TRIGGER IF NOT EXISTS retirement_query_${event.toLowerCase()}
    AFTER ${event} ON standard_retirement_requests BEGIN UPDATE standard_query_state SET revision=revision+1 WHERE id=1; END`);
}
