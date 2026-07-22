CREATE TABLE IF NOT EXISTS conversation_ai_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'assist' CHECK (mode IN ('off', 'assist')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversation_ai_settings_account ON conversation_ai_settings(account_id);
DROP TRIGGER IF EXISTS set_updated_at ON conversation_ai_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON conversation_ai_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE conversation_ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_ai_settings_select ON conversation_ai_settings;
CREATE POLICY conversation_ai_settings_select ON conversation_ai_settings FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS conversation_ai_settings_insert ON conversation_ai_settings;
CREATE POLICY conversation_ai_settings_insert ON conversation_ai_settings FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS conversation_ai_settings_update ON conversation_ai_settings;
CREATE POLICY conversation_ai_settings_update ON conversation_ai_settings FOR UPDATE USING (is_account_member(account_id, 'agent')) WITH CHECK (is_account_member(account_id, 'agent'));

