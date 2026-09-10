CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('Design', 'Engineering', 'Marketing')),
  priority TEXT NOT NULL CHECK (priority IN ('Blocker', 'Major', 'Minor')),
  stage TEXT NOT NULL CHECK (stage IN ('Planning', 'Review', 'In Progress', 'Final', 'Completed')),
  assignee TEXT NOT NULL,
  due TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reviews_active_stage ON reviews (archived, stage);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews (created_at DESC);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  ai INTEGER NOT NULL DEFAULT 0 CHECK (ai IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings (date DESC);

INSERT OR IGNORE INTO reviews (id, title, area, priority, stage, assignee, due, archived, created_at) VALUES
('r1', 'Pricing page copy needs tightening', 'Marketing', 'Major', 'Review', 'Aria', '2026-09-12', 0, '2026-09-09T12:00:00Z'),
('r2', 'Empty states illustration set', 'Design', 'Minor', 'Planning', 'Mia', '2026-09-16', 0, '2026-09-09T12:00:00Z'),
('r3', 'Homepage hero lacks clear value proposition', 'Marketing', 'Major', 'Planning', 'Leo', '2026-09-14', 0, '2026-09-08T12:00:00Z'),
('r4', 'Dark mode contrast fails WCAG AA on cards', 'Design', 'Major', 'In Progress', 'Mia', '2026-09-11', 0, '2026-09-07T12:00:00Z'),
('r5', 'API rate limiting for public endpoints', 'Engineering', 'Minor', 'Review', 'Leo', '2026-09-15', 0, '2026-09-06T12:00:00Z'),
('r6', 'Checkout flow drops on mobile Safari', 'Engineering', 'Blocker', 'In Progress', 'Aria', '2026-09-09', 0, '2026-09-05T12:00:00Z'),
('r7', 'Footer links audit', 'Marketing', 'Minor', 'Final', 'Aria', '2026-09-08', 0, '2026-09-04T12:00:00Z'),
('r8', 'Analytics events naming', 'Engineering', 'Minor', 'Completed', 'Leo', '2026-09-07', 0, '2026-09-03T12:00:00Z'),
('r9', 'Onboarding checklist states', 'Design', 'Major', 'Final', 'Mia', '2026-09-09', 0, '2026-09-02T12:00:00Z');

INSERT OR IGNORE INTO meetings (id, title, date, ai, notes, item_count) VALUES
('m1', 'Weekly product sync', '2026-09-09', 1, 'Fix onboarding flow. Update the pricing page. Audit dashboard metrics.', 3),
('m2', 'Design review — checkout', '2026-09-06', 1, 'Improve checkout mobile layout. Review dark mode contrast.', 2),
('m3', 'Marketing alignment', '2026-09-03', 0, 'Clarify hero proposition. Tighten pricing page copy.', 2);
