CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO spaces (id, name, key) VALUES ('default', 'Main space', 'MAIN');

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  access_mode TEXT NOT NULL DEFAULT 'link',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(space_id) REFERENCES spaces(id) ON DELETE CASCADE
);
INSERT OR IGNORE INTO projects (id, space_id, name, description, access_mode)
  SELECT 'default', 'default', name, description, access_mode FROM project_settings WHERE id = 'default';

ALTER TABLE reviews ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE reviews ADD COLUMN parent_id TEXT;
ALTER TABLE reviews ADD COLUMN item_type TEXT NOT NULL DEFAULT 'task';
ALTER TABLE reviews ADD COLUMN sprint_id TEXT;
CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id, archived, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_parent ON reviews(parent_id);

CREATE TABLE IF NOT EXISTS workflow_statuses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  position INTEGER NOT NULL DEFAULT 0,
  is_terminal INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, name),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
INSERT OR IGNORE INTO workflow_statuses (id, project_id, name, color, position, is_terminal) VALUES
 ('status-planning','default','Planning','#8b5cf6',0,0),
 ('status-review','default','Review','#3b82f6',1,0),
 ('status-progress','default','In Progress','#a855f7',2,0),
 ('status-final','default','Final','#06b6d4',3,0),
 ('status-completed','default','Completed','#22c55e',4,1);

CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, name),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  review_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS review_attachments (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  user_id TEXT,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
