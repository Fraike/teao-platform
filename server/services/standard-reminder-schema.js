// Shared schema initialization without user/auth/config or worker side effects.
export function initializeReminderSchema(d) {
  d.exec(`CREATE TABLE IF NOT EXISTS standard_review_reminders (
    version_id TEXT NOT NULL, submitted_at TEXT NOT NULL,
    last_attempt_at INTEGER NOT NULL, last_sent_at INTEGER,
    status TEXT NOT NULL, PRIMARY KEY (version_id,submitted_at)
  )`);
  d.exec(`CREATE TABLE IF NOT EXISTS standard_review_daily_reminders (
    reviewer_id TEXT NOT NULL, reminder_date TEXT NOT NULL,
    attempted_at INTEGER NOT NULL, PRIMARY KEY (reviewer_id,reminder_date)
  )`);
}
