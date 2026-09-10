ALTER TABLE reviews ADD COLUMN reporter TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN estimate_hours REAL;
ALTER TABLE reviews ADD COLUMN epic TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN feature TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN sprint TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN labels TEXT NOT NULL DEFAULT '[]';
ALTER TABLE meetings ADD COLUMN attendees TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS review_subtasks (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_review_subtasks_review ON review_subtasks (review_id, created_at);

CREATE TABLE IF NOT EXISTS review_status_history (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_review_status_history_review ON review_status_history (review_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_settings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  access_mode TEXT NOT NULL DEFAULT 'link',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO project_settings (id, name, description, access_mode) VALUES ('default', 'Acme Redesign', '', 'link');
