CREATE TABLE IF NOT EXISTS issue_comment_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  UUID NOT NULL REFERENCES issue_comments(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'file',  -- 'file' | 'link'
  filename    TEXT,
  mime_type   TEXT,
  size_bytes  INT,
  data        BYTEA,
  url         TEXT,
  label       TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_comment_attachments_comment_id ON issue_comment_attachments(comment_id);
