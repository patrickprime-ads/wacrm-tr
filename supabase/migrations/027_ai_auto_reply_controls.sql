ALTER TABLE conversation_ai_settings DROP CONSTRAINT IF EXISTS conversation_ai_settings_mode_check;
ALTER TABLE conversation_ai_settings
  ADD CONSTRAINT conversation_ai_settings_mode_check CHECK (mode IN ('off', 'assist', 'auto')),
  ADD COLUMN IF NOT EXISTS max_auto_replies_24h INTEGER NOT NULL DEFAULT 3 CHECK (max_auto_replies_24h BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS active_hour_start SMALLINT NOT NULL DEFAULT 8 CHECK (active_hour_start BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS active_hour_end SMALLINT NOT NULL DEFAULT 20 CHECK (active_hour_end BETWEEN 1 AND 24),
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS require_unassigned BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE ai_agent_runs
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_conversation_created
  ON ai_agent_runs(conversation_id, created_at DESC);

