CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES users(id),
  type         TEXT NOT NULL DEFAULT 'issue_mention',
  issue_id     UUID REFERENCES issues(id) ON DELETE CASCADE,
  comment_id   UUID REFERENCES issue_comments(id) ON DELETE CASCADE,
  read         BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, read, created_at DESC);
