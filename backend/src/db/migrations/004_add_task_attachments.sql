CREATE TABLE IF NOT EXISTS task_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime_type   TEXT,
  size_bytes  INTEGER,
  data        BYTEA NOT NULL,
  uploaded_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);
