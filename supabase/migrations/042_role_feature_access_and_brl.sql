-- Separate menu access for account administrators and sellers.
ALTER TABLE account_features
  ADD COLUMN IF NOT EXISTS agent_enabled_features TEXT[] NOT NULL DEFAULT ARRAY[
    'dashboard', 'pipeline', 'inbox', 'contacts', 'follow_ups'
  ];

-- Repair accounts created with a paid plan but the old free-only feature default.
UPDATE account_features
SET enabled_features = CASE plan
  WHEN 'pro' THEN ARRAY['dashboard','contacts','follow_ups','settings','pipeline','inbox','lead_scoring','reports']
  WHEN 'business' THEN ARRAY['dashboard','contacts','follow_ups','settings','pipeline','inbox','lead_scoring','reports','lead_tracking','ai_agents','automations','broadcasts','flows']
  WHEN 'enterprise' THEN ARRAY['dashboard','contacts','pipeline','inbox','lead_scoring','follow_ups','lead_tracking','ai_agents','automations','reports','broadcasts','flows','integrations','templates','settings']
  ELSE enabled_features
END
WHERE plan <> 'free'
  AND enabled_features <@ ARRAY['dashboard','contacts','follow_ups','settings']::TEXT[];

UPDATE accounts SET default_currency = 'BRL' WHERE default_currency IS DISTINCT FROM 'BRL';
ALTER TABLE accounts ALTER COLUMN default_currency SET DEFAULT 'BRL';
UPDATE deals SET currency = 'BRL' WHERE currency IS DISTINCT FROM 'BRL';
ALTER TABLE deals ALTER COLUMN currency SET DEFAULT 'BRL';
