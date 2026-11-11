-- Importação do CRM antigo (planilha) e relatório de vendas por vendedora (Prime, 11/11/2026).
--  seller_name  nome da vendedora como estava na planilha (vale também para quem não tem login)
--  lost_reason  motivo da perda
--  closed_at    data em que fechou/perdeu
--  archived     fora do Kanban do dia a dia, mas conta nos relatórios e aparece na busca
--  legacy_key   chave da linha importada (evita importar duas vezes)
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS seller_name TEXT,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS legacy_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS deals_account_legacy_key_uniq
  ON public.deals(account_id, legacy_key) WHERE legacy_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS deals_account_created_idx ON public.deals(account_id, created_at);
