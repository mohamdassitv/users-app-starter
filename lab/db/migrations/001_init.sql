-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Core exam session table
CREATE TABLE IF NOT EXISTS exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_name TEXT,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_email ON exam_sessions(email);

-- Answers table (versioned, last-write-wins)
CREATE TABLE IF NOT EXISTS answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  content JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS answers_session_task_uniq ON answers(session_id, task_id);
CREATE INDEX IF NOT EXISTS answers_session_idx ON answers(session_id);

-- Events audit table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS events_session_idx ON events(session_id);
CREATE INDEX IF NOT EXISTS events_type_created_idx ON events(type, created_at);

-- Helper view (optional) for latest answer timestamps per session
CREATE OR REPLACE VIEW session_answer_activity AS
SELECT a.session_id, MAX(a.updated_at) AS last_answer_update
FROM answers a GROUP BY a.session_id;

-- Basic test seed (remove in prod)
-- INSERT INTO exam_sessions(candidate_name,email) VALUES ('Test User','test@example.com');
