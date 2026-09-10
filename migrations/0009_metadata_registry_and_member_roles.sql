CREATE TABLE IF NOT EXISTS project_metadata (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'default',
  type TEXT NOT NULL CHECK (type IN ('epic', 'feature', 'label')),
  name TEXT NOT NULL,
  parent_id TEXT,
  color TEXT NOT NULL DEFAULT '#111b30',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, type, name)
);
CREATE INDEX IF NOT EXISTS idx_project_metadata_project_type ON project_metadata(project_id, type);

INSERT OR IGNORE INTO project_metadata (id, project_id, type, name)
SELECT lower(hex(randomblob(16))), project_id, 'epic', epic FROM reviews WHERE trim(epic) <> '';
INSERT OR IGNORE INTO project_metadata (id, project_id, type, name)
SELECT lower(hex(randomblob(16))), project_id, 'feature', feature FROM reviews WHERE trim(feature) <> '';

CREATE TABLE IF NOT EXISTS project_member_roles (
  member_id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES project_members(id) ON DELETE CASCADE
);
