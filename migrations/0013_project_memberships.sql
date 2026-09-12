CREATE TABLE IF NOT EXISTS project_memberships (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_memberships_user ON project_memberships(user_id, project_id);

-- Preserve access for existing accounts to the original workspace.
INSERT OR IGNORE INTO project_memberships (project_id, user_id, role)
SELECT 'default', id, CASE WHEN role IN ('admin', 'super_admin') THEN 'editor' ELSE 'editor' END
FROM users;
