-- Lead attribution, conversion destinations and configurable AI follow-up.

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS tone TEXT NOT NULL DEFAULT 'equilibrado',
  ADD COLUMN IF NOT EXISTS response_length TEXT NOT NULL DEFAULT 'curto',
  ADD COLUMN IF NOT EXISTS use_emojis BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS followup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS followup_delay_hours INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS followup_max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS followup_start_hour INTEGER NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS followup_end_hour INTEGER NOT NULL DEFAULT 18;

ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_tone_check;
ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_tone_check
  CHECK (tone IN ('direto', 'equilibrado', 'consultivo', 'amigavel', 'formal'));
ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_response_length_check;
ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_response_length_check
  CHECK (response_length IN ('muito_curto', 'curto', 'detalhado'));
ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_followup_limits_check;
ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_followup_limits_check CHECK (
  followup_delay_hours BETWEEN 1 AND 720 AND
  followup_max_attempts BETWEEN 1 AND 10 AND
  followup_start_hour BETWEEN 0 AND 23 AND
  followup_end_hour BETWEEN 0 AND 23
);

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lead_source TEXT NOT NULL DEFAULT 'organico',
  ADD COLUMN IF NOT EXISTS source_detail TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS click_id TEXT,
  ADD COLUMN IF NOT EXISTS conversion_status TEXT NOT NULL DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_attribution
  ON contacts(account_id, lead_source, created_at DESC);

CREATE TABLE IF NOT EXISTS lead_tracking_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  meta_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  meta_pixel_id TEXT,
  meta_access_token_encrypted TEXT,
  google_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  google_customer_id TEXT,
  google_conversion_action TEXT,
  google_access_token_encrypted TEXT,
  conversion_event TEXT NOT NULL DEFAULT 'qualified_lead',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_followup_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'running', 'completed', 'cancelled', 'failed')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_followup_jobs_due
  ON ai_followup_jobs(status, next_run_at) WHERE status = 'scheduled';

ALTER TABLE lead_tracking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_followup_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_tracking_settings_select ON lead_tracking_settings;
CREATE POLICY lead_tracking_settings_select ON lead_tracking_settings FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS lead_tracking_settings_write ON lead_tracking_settings;
CREATE POLICY lead_tracking_settings_write ON lead_tracking_settings FOR ALL
  USING (is_account_member(account_id, 'admin')) WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_followup_jobs_select ON ai_followup_jobs;
CREATE POLICY ai_followup_jobs_select ON ai_followup_jobs FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS ai_followup_jobs_write ON ai_followup_jobs;
CREATE POLICY ai_followup_jobs_write ON ai_followup_jobs FOR ALL
  USING (is_account_member(account_id, 'agent')) WITH CHECK (is_account_member(account_id, 'agent'));

