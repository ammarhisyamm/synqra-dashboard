CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  activity INTEGER NOT NULL DEFAULT 1 CHECK(activity IN (0,1)),
  reminders INTEGER NOT NULL DEFAULT 1 CHECK(reminders IN (0,1)),
  mentions INTEGER NOT NULL DEFAULT 1 CHECK(mentions IN (0,1))
);
CREATE TABLE user_mfa (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  last_counter INTEGER NOT NULL DEFAULT -1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE mfa_recovery (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  PRIMARY KEY(user_id, code_hash)
);
CREATE TABLE file_cleanup (
  object_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX file_cleanup_due ON file_cleanup(next_attempt);
CREATE TABLE attachment_backups (
  object_key TEXT PRIMARY KEY,
  etag TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  backed_up_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE reminder_delivery (
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  due TEXT NOT NULL,
  PRIMARY KEY(review_id,user_id,kind,due)
);
CREATE TABLE operational_events (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  code TEXT NOT NULL,
  release TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX operational_events_time ON operational_events(created_at);
CREATE TABLE office_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX reviews_project_updated ON reviews(project_id, archived, updated_at DESC, id);
CREATE INDEX reviews_due_status ON reviews(archived,due,status);
CREATE INDEX notifications_user_time ON notifications(user_id,created_at DESC);
CREATE TABLE creation_receipts (
  kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(kind,entity_id)
);
ALTER TABLE projects ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_at TEXT
);
