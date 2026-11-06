-- Plans managed by the Master administrator.
DO $$ DECLARE item RECORD;
BEGIN
  FOR item IN SELECT conname, conrelid::regclass AS table_name FROM pg_constraint WHERE conrelid IN ('accounts'::regclass, 'account_features'::regclass) AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%plan%'
  LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', item.table_name, item.conname); END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS crm_plans (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled_features TEXT[] NOT NULL DEFAULT ARRAY['dashboard','contacts','follow_ups','settings'],
  agent_enabled_features TEXT[] NOT NULL DEFAULT ARRAY['dashboard','pipeline','inbox','contacts','follow_ups'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO crm_plans (key, name, enabled_features, agent_enabled_features) VALUES
('free','Grátis',ARRAY['dashboard','contacts','follow_ups','settings'],ARRAY['dashboard','contacts','follow_ups']),
('pro','Pro',ARRAY['dashboard','contacts','follow_ups','settings','pipeline','inbox','lead_scoring','reports'],ARRAY['dashboard','pipeline','inbox','contacts','follow_ups']),
('business','Business',ARRAY['dashboard','contacts','follow_ups','settings','pipeline','inbox','lead_scoring','reports','lead_tracking','ai_agents','automations','broadcasts','flows'],ARRAY['dashboard','pipeline','inbox','contacts','follow_ups']),
('enterprise','Enterprise',ARRAY['dashboard','contacts','pipeline','inbox','lead_scoring','follow_ups','lead_tracking','ai_agents','automations','reports','broadcasts','flows','integrations','templates','settings'],ARRAY['dashboard','pipeline','inbox','contacts','follow_ups'])
ON CONFLICT (key) DO NOTHING;

ALTER TABLE crm_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_plans_read ON crm_plans;
CREATE POLICY crm_plans_read ON crm_plans FOR SELECT TO authenticated USING (TRUE);
