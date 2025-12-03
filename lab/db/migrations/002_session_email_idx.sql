-- Adds index for faster session lookups by email
CREATE INDEX IF NOT EXISTS exam_sessions_email_idx ON exam_sessions(email);
