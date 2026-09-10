CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer')),
  status TEXT NOT NULL DEFAULT 'invited',
  invited_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_members_email ON project_members(email);
