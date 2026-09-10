ALTER TABLE reviews ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'Open';
ALTER TABLE reviews ADD COLUMN submitted_by TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN meeting_id TEXT;

CREATE INDEX IF NOT EXISTS idx_reviews_meeting ON reviews (meeting_id);

CREATE TABLE IF NOT EXISTS review_comments (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_review_comments_review ON review_comments (review_id, created_at);

CREATE TABLE IF NOT EXISTS review_activity (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_review_activity_review ON review_activity (review_id, created_at DESC);

UPDATE reviews SET status = CASE stage
  WHEN 'Completed' THEN 'Resolved'
  WHEN 'Final' THEN 'Review'
  WHEN 'In Progress' THEN 'In Progress'
  ELSE 'Open'
END WHERE status = 'Open';
