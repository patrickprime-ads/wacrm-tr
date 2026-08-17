-- ============================================================
-- 041_account_features.sql — Menu visibility and feature control
--
-- Adds support for per-account feature flags that control menu
-- visibility and feature access. Each account can have a plan
-- and a set of enabled features.
--
-- This allows:
--   1. Different pricing tiers with different feature sets
--   2. Admin control over which features are visible to team members
--   3. Feature-based menu filtering in the UI
--
-- Features include:
--   - pipeline: Pipeline de Vendas
--   - inbox: Caixa de Entrada
--   - lead_scoring: Lead Scoring
--   - lead_journey: Jornada do Lead
--   - follow_ups: Follow-ups (always enabled)
--   - lead_tracking: Tracking de Leads
--   - ai_agents: Agentes IA
--   - automations: Automações
--   - reports: Relatórios
--   - broadcasts: Disparos
--   - flows: Fluxos
--   - integrations: Integrações
--   - templates: Modelos de Mensagens
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Add plan column to accounts
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free', 'pro', 'business', 'enterprise'));

-- Add enabled features as a JSON array
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS enabled_features TEXT[] DEFAULT ARRAY[
    'dashboard',
    'contacts',
    'follow_ups',
    'settings'
  ];

-- Create a feature control table for audit trail and detailed settings
CREATE TABLE IF NOT EXISTS account_features (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'business', 'enterprise')),
  enabled_features TEXT[] NOT NULL DEFAULT ARRAY[
    'dashboard',
    'contacts',
    'follow_ups',
    'settings'
  ],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE account_features ENABLE ROW LEVEL SECURITY;

-- Create index on account_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_account_features_account_id
  ON account_features(account_id);

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS set_updated_at ON account_features;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON account_features
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update the accounts table to sync with account_features
-- (initially both are the same, but account_features is the source of truth)
INSERT INTO account_features (account_id, plan, enabled_features)
SELECT
  id,
  COALESCE(plan, 'free'),
  COALESCE(enabled_features, ARRAY['dashboard', 'contacts', 'follow_ups', 'settings'])
FROM accounts
ON CONFLICT (account_id) DO NOTHING;

-- RLS policy: allow account admins to read their own features
CREATE POLICY "account_features_read_own"
  ON account_features
  FOR SELECT
  USING (is_account_member(account_id, 'admin'));

-- RLS policy: allow account admins to update their own features
CREATE POLICY "account_features_update_own"
  ON account_features
  FOR UPDATE
  USING (is_account_member(account_id, 'owner'))
  WITH CHECK (is_account_member(account_id, 'owner'));

-- RLS policy: allow master admin to read/update all
CREATE POLICY "account_features_master_admin"
  ON account_features
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND is_master_admin = TRUE
    )
  );

-- Create an RPC to update account features
CREATE OR REPLACE FUNCTION public.update_account_features(
  p_account_id UUID,
  p_plan TEXT DEFAULT NULL,
  p_enabled_features TEXT[] DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Check if caller is the owner of the target account
  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  -- Only account owner can update features, or master admin
  IF v_caller_account_id <> p_account_id AND NOT (
    SELECT is_master_admin FROM profiles WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Cannot manage features for other accounts' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role <> 'owner' AND NOT (
    SELECT is_master_admin FROM profiles WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only account owner can manage features' USING ERRCODE = '42501';
  END IF;

  -- Validate plan
  IF p_plan IS NOT NULL AND p_plan NOT IN ('free', 'pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Invalid plan' USING ERRCODE = '22023';
  END IF;

  -- Update account_features
  INSERT INTO account_features (account_id, plan, enabled_features, updated_by_user_id)
  VALUES (
    p_account_id,
    COALESCE(p_plan, 'free'),
    COALESCE(p_enabled_features, ARRAY['dashboard', 'contacts', 'follow_ups', 'settings'])
  )
  ON CONFLICT (account_id) DO UPDATE
  SET
    plan = COALESCE(p_plan, account_features.plan),
    enabled_features = COALESCE(p_enabled_features, account_features.enabled_features),
    updated_by_user_id = auth.uid(),
    updated_at = NOW();

  -- Also update accounts table for quick reference
  UPDATE accounts
  SET plan = COALESCE(p_plan, accounts.plan)
  WHERE id = p_account_id AND p_plan IS NOT NULL;
END;
$$;

ALTER FUNCTION public.update_account_features(UUID, TEXT, TEXT[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_account_features(UUID, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_account_features(UUID, TEXT, TEXT[]) TO authenticated;

-- Default feature sets for each plan
-- These are documentation and reference; actual enforcement is in the app
-- free: dashboard, contacts, follow_ups, settings
-- pro: + pipeline, inbox, lead_scoring, lead_journey, reports
-- business: + lead_tracking, ai_agents, automations
-- enterprise: everything
