-- Veritas Self-Hosted PostgreSQL Schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Admin', 'Researcher', 'Reviewer', 'Viewer')),
  avatar_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detections (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  file_name TEXT,
  mime_type TEXT,
  word_count INTEGER NOT NULL,
  character_count INTEGER NOT NULL,
  full_text TEXT NOT NULL,
  ai_probability NUMERIC(5,2) NOT NULL,
  human_probability NUMERIC(5,2) NOT NULL,
  confidence NUMERIC(5,2) NOT NULL,
  verdict TEXT NOT NULL,
  suspected_model_family TEXT,
  detected_language TEXT NOT NULL,
  language_confidence NUMERIC(5,2) NOT NULL,
  summary TEXT NOT NULL,
  sentences JSONB NOT NULL DEFAULT '[]'::jsonb,
  readability JSONB NOT NULL DEFAULT '{}'::jsonb,
  writing_quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  seo_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  academic_integrity JSONB NOT NULL DEFAULT '{}'::jsonb,
  authenticity JSONB NOT NULL DEFAULT '{}'::jsonb,
  fact_check JSONB,
  plagiarism JSONB NOT NULL DEFAULT '{}'::jsonb,
  plugin_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  media_forensics JSONB,
  humanized_versions JSONB NOT NULL DEFAULT '[]'::jsonb,
  adversarial_security JSONB,
  paraphrase_spin JSONB,
  geo_analysis JSONB,
  cross_lingual_matches JSONB DEFAULT '[]'::jsonb,
  assigned_to_user_id TEXT REFERENCES users(id),
  created_by_user_id TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS code_reports (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  line_count INTEGER NOT NULL,
  ai_code_probability NUMERIC(5,2) NOT NULL,
  verdict TEXT NOT NULL,
  confidence NUMERIC(5,2) NOT NULL,
  ast_fingerprint TEXT NOT NULL,
  cyclomatic_complexity INTEGER NOT NULL,
  report JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS author_profiles (
  id TEXT PRIMARY KEY,
  author_name TEXT NOT NULL,
  department_or_role TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 1,
  total_words_profiled INTEGER NOT NULL DEFAULT 0,
  vector JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS veritas_proofs (
  proof_id TEXT PRIMARY KEY,
  version TEXT NOT NULL DEFAULT '1.0',
  document_title TEXT NOT NULL,
  author_label TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  ed25519_public_key TEXT NOT NULL,
  signature TEXT NOT NULL,
  process_metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS citations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors JSONB NOT NULL DEFAULT '[]'::jsonb,
  year TEXT NOT NULL,
  publisher_or_journal TEXT NOT NULL,
  url TEXT,
  doi TEXT,
  source_type TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  linked_record_id TEXT REFERENCES detections(id) ON DELETE SET NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  detection_id TEXT NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queue_jobs (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  concurrency INTEGER NOT NULL DEFAULT 4,
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_record_ids JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  rate_limit_rpm INTEGER NOT NULL DEFAULT 120,
  request_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  weight NUMERIC(5,2) NOT NULL DEFAULT 0,
  pattern TEXT NOT NULL,
  is_regex BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_detections_created_at ON detections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
