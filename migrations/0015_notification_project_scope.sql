ALTER TABLE notifications ADD COLUMN project_id TEXT;
UPDATE notifications SET project_id=(SELECT project_id FROM reviews WHERE reviews.id=notifications.review_id) WHERE review_id IS NOT NULL;
CREATE INDEX idx_notifications_project_user ON notifications(project_id, user_id);
