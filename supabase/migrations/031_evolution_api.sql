-- WhatsApp Business por QR Code usando Evolution API v2.
CREATE TABLE IF NOT EXISTS public.evolution_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  server_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS evolution_config_instance_name_key
  ON public.evolution_config(instance_name);

DROP TRIGGER IF EXISTS set_updated_at ON public.evolution_config;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.evolution_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.evolution_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evolution_config_select ON public.evolution_config;
CREATE POLICY evolution_config_select ON public.evolution_config FOR SELECT
  USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS evolution_config_insert ON public.evolution_config;
CREATE POLICY evolution_config_insert ON public.evolution_config FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS evolution_config_update ON public.evolution_config;
CREATE POLICY evolution_config_update ON public.evolution_config FOR UPDATE
  USING (is_account_member(account_id, 'admin')) WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS evolution_config_delete ON public.evolution_config;
CREATE POLICY evolution_config_delete ON public.evolution_config FOR DELETE
  USING (is_account_member(account_id, 'admin'));
