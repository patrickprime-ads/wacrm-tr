-- Entrada automática de leads vindos do painel de rastreio (05/11/2026).
-- Cada conta tem um token (só o hash fica guardado). O rastreio manda o lead
-- para /api/leads/inbound com esse token e o CRM cria o contato e o card no Kanban.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS inbound_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS inbound_token_created_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_inbound_token_hash_key
  ON public.accounts(inbound_token_hash)
  WHERE inbound_token_hash IS NOT NULL;

-- Campanha e anúncio que trouxeram o lead (o rastreio manda; aparece no card).
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS ad_id TEXT,
  ADD COLUMN IF NOT EXISTS external_lead_id TEXT;
