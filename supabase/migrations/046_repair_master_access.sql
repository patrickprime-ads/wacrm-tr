-- Repair installations where migrations 041-043 were skipped.
-- Safe to run more than once.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_master_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_master_admin
  ON public.profiles(is_master_admin)
  WHERE is_master_admin = TRUE;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS enabled_features TEXT[] NOT NULL DEFAULT ARRAY[
    'dashboard', 'contacts', 'follow_ups', 'settings'
  ];

CREATE TABLE IF NOT EXISTS public.account_features (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  enabled_features TEXT[] NOT NULL DEFAULT ARRAY[
    'dashboard', 'contacts', 'follow_ups', 'settings'
  ],
  agent_enabled_features TEXT[] NOT NULL DEFAULT ARRAY[
    'dashboard', 'pipeline', 'inbox', 'contacts', 'follow_ups'
  ],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.account_features
  ADD COLUMN IF NOT EXISTS agent_enabled_features TEXT[] NOT NULL DEFAULT ARRAY[
    'dashboard', 'pipeline', 'inbox', 'contacts', 'follow_ups'
  ];

CREATE INDEX IF NOT EXISTS idx_account_features_account_id
  ON public.account_features(account_id);

INSERT INTO public.account_features (account_id, plan, enabled_features)
SELECT id, COALESCE(plan, 'free'), COALESCE(enabled_features, ARRAY[
  'dashboard', 'contacts', 'follow_ups', 'settings'
])
FROM public.accounts
ON CONFLICT (account_id) DO NOTHING;

ALTER TABLE public.account_features ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_features_read_own ON public.account_features;
DROP POLICY IF EXISTS account_features_update_own ON public.account_features;
DROP POLICY IF EXISTS account_features_master_admin ON public.account_features;
DROP POLICY IF EXISTS "account_features_read_own" ON public.account_features;
DROP POLICY IF EXISTS "account_features_update_own" ON public.account_features;
DROP POLICY IF EXISTS "account_features_master_admin" ON public.account_features;

CREATE POLICY account_features_read_own ON public.account_features
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY account_features_update_own ON public.account_features
  FOR UPDATE USING (is_account_member(account_id, 'owner'))
  WITH CHECK (is_account_member(account_id, 'owner'));
CREATE POLICY account_features_master_admin ON public.account_features
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND is_master_admin = TRUE
    )
  );

CREATE TABLE IF NOT EXISTS public.crm_plans (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled_features TEXT[] NOT NULL DEFAULT ARRAY[
    'dashboard', 'contacts', 'follow_ups', 'settings'
  ],
  agent_enabled_features TEXT[] NOT NULL DEFAULT ARRAY[
    'dashboard', 'pipeline', 'inbox', 'contacts', 'follow_ups'
  ],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.crm_plans (key, name, enabled_features, agent_enabled_features) VALUES
('free', 'Grátis', ARRAY['dashboard','contacts','follow_ups','settings'], ARRAY['dashboard','contacts','follow_ups']),
('pro', 'Pro', ARRAY['dashboard','contacts','follow_ups','settings','pipeline','inbox','lead_scoring','reports'], ARRAY['dashboard','pipeline','inbox','contacts','follow_ups']),
('business', 'Business', ARRAY['dashboard','contacts','follow_ups','settings','pipeline','inbox','lead_scoring','reports','lead_tracking','ai_agents','automations','broadcasts','flows'], ARRAY['dashboard','pipeline','inbox','contacts','follow_ups']),
('enterprise', 'Enterprise', ARRAY['dashboard','contacts','pipeline','inbox','lead_scoring','follow_ups','lead_tracking','ai_agents','automations','reports','broadcasts','flows','integrations','templates','settings'], ARRAY['dashboard','pipeline','inbox','contacts','follow_ups'])
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.crm_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_plans_read ON public.crm_plans;
CREATE POLICY crm_plans_read ON public.crm_plans
  FOR SELECT TO authenticated USING (TRUE);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_features TO authenticated;
GRANT ALL ON public.account_features TO service_role;
GRANT SELECT ON public.crm_plans TO authenticated;
GRANT ALL ON public.crm_plans TO service_role;
