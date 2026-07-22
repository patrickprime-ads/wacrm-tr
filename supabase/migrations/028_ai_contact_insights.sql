CREATE TABLE IF NOT EXISTS ai_contact_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  interest_level TEXT NOT NULL CHECK (interest_level IN ('cold', 'warm', 'hot')),
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  next_action TEXT NOT NULL,
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_contact_insights_account_score ON ai_contact_insights(account_id, score DESC);
DROP TRIGGER IF EXISTS set_updated_at ON ai_contact_insights;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_contact_insights FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE ai_contact_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_contact_insights_select ON ai_contact_insights;
CREATE POLICY ai_contact_insights_select ON ai_contact_insights FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS ai_contact_insights_insert ON ai_contact_insights;
CREATE POLICY ai_contact_insights_insert ON ai_contact_insights FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS ai_contact_insights_update ON ai_contact_insights;
CREATE POLICY ai_contact_insights_update ON ai_contact_insights FOR UPDATE USING (is_account_member(account_id, 'agent')) WITH CHECK (is_account_member(account_id, 'agent'));

