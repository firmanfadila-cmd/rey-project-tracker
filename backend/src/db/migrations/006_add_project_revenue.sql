CREATE TABLE IF NOT EXISTS project_revenue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  month             DATE NOT NULL,
  potential_revenue NUMERIC,
  actual_revenue    NUMERIC,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, month)
);
CREATE INDEX IF NOT EXISTS idx_project_revenue_project_id ON project_revenue(project_id);
