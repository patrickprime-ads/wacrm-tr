CREATE TABLE IF NOT EXISTS ai_agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  triggered_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'playground',
  input_preview TEXT,
  output_preview TEXT,
  model TEXT,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  latency_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_account_created
  ON ai_agent_runs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_agent_created
  ON ai_agent_runs(agent_id, created_at DESC);

ALTER TABLE ai_agent_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_agent_runs_select ON ai_agent_runs;
CREATE POLICY ai_agent_runs_select ON ai_agent_runs FOR SELECT
  USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS ai_agent_runs_insert ON ai_agent_runs;
CREATE POLICY ai_agent_runs_insert ON ai_agent_runs FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

