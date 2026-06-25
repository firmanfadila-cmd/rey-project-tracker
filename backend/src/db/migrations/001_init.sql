CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client       TEXT NOT NULL,
  project      TEXT NOT NULL,
  sub          TEXT,
  product      TEXT,
  status       TEXT DEFAULT 'active',
  phase        TEXT,
  pm           TEXT,
  revenue      TEXT,
  next         TEXT,
  remarks      TEXT,
  plan_start   DATE,
  plan_end     DATE,
  actual_start DATE,
  actual_end   DATE,
  mono         TEXT,
  mono_color   TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  status       TEXT DEFAULT 'not-started',
  progress     INT DEFAULT 0,
  plan_start   DATE,
  plan_end     DATE,
  actual_start DATE,
  actual_end   DATE,
  remarks      TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
