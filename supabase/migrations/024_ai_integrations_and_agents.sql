-- AI provider credentials, outbound webhooks and configurable AI agents.
-- Provider secrets are encrypted by the application before storage and are
-- never selected by browser clients.

CREATE TABLE IF NOT EXISTS ai_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'openai',
  base_url TEXT,
  api_key_encrypted TEXT,
  default_model TEXT NOT NULL DEFAULT 'gpt-5.6-luna',
  webhook_url TEXT,
  webhook_secret_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Atendimento',
  description TEXT,
  instructions TEXT NOT NULL DEFAULT '',
  model TEXT,
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.40 CHECK (temperature BETWEEN 0 AND 2),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_account ON ai_agents(account_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON ai_integrations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON ai_agents;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE ai_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_integrations_select ON ai_integrations;
CREATE POLICY ai_integrations_select ON ai_integrations FOR SELECT
  USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS ai_integrations_insert ON ai_integrations;
CREATE POLICY ai_integrations_insert ON ai_integrations FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS ai_integrations_update ON ai_integrations;
CREATE POLICY ai_integrations_update ON ai_integrations FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_agents_select ON ai_agents;
CREATE POLICY ai_agents_select ON ai_agents FOR SELECT
  USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS ai_agents_insert ON ai_agents;
CREATE POLICY ai_agents_insert ON ai_agents FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS ai_agents_update ON ai_agents;
CREATE POLICY ai_agents_update ON ai_agents FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS ai_agents_delete ON ai_agents;
CREATE POLICY ai_agents_delete ON ai_agents FOR DELETE
  USING (is_account_member(account_id, 'admin'));
