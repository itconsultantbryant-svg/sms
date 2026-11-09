export const offlineSyncSchema = `
CREATE TABLE IF NOT EXISTS offline_operations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_offline_operations_owner ON offline_operations(user_id, institution_id);
CREATE TABLE IF NOT EXISTS offline_revisions (
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  record_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (institution_id, resource, record_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_assignment_identity ON teacher_assignments (
  institution_id, employee_id, class_id, COALESCE(section_id, ''), subject_id, COALESCE(session_id, '')
);
`;
