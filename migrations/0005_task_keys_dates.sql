ALTER TABLE reviews ADD COLUMN key TEXT;
ALTER TABLE reviews ADD COLUMN start_date TEXT;
UPDATE reviews SET key = 'AR-' || rowid WHERE key IS NULL OR key = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_key ON reviews (key);
