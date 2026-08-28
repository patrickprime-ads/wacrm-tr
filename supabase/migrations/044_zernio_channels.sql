CREATE TABLE IF NOT EXISTS public.zernio_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  api_key_encrypted TEXT NOT NULL,
  profile_id TEXT,
  webhook_id TEXT,
  webhook_secret_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.zernio_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  zernio_account_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('whatsapp','instagram','facebook')),
  username TEXT,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, zernio_account_id)
);

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS external_provider TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS external_conversation_id TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS external_account_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_external_provider_id
  ON conversations(account_id, external_provider, external_conversation_id)
  WHERE external_provider IS NOT NULL AND external_conversation_id IS NOT NULL;

ALTER TABLE zernio_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE zernio_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zernio_config_select ON zernio_config;
CREATE POLICY zernio_config_select ON zernio_config FOR SELECT USING (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS zernio_config_insert ON zernio_config;
CREATE POLICY zernio_config_insert ON zernio_config FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS zernio_config_update ON zernio_config;
CREATE POLICY zernio_config_update ON zernio_config FOR UPDATE USING (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS zernio_config_delete ON zernio_config;
CREATE POLICY zernio_config_delete ON zernio_config FOR DELETE USING (is_account_member(account_id, 'owner'));
DROP POLICY IF EXISTS zernio_channels_select ON zernio_channels;
CREATE POLICY zernio_channels_select ON zernio_channels FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS zernio_channels_insert ON zernio_channels;
CREATE POLICY zernio_channels_insert ON zernio_channels FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS zernio_channels_update ON zernio_channels;
CREATE POLICY zernio_channels_update ON zernio_channels FOR UPDATE USING (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS zernio_channels_delete ON zernio_channels;
CREATE POLICY zernio_channels_delete ON zernio_channels FOR DELETE USING (is_account_member(account_id, 'admin'));

GRANT ALL ON zernio_config, zernio_channels TO authenticated, service_role;
