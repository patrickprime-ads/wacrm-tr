ALTER TABLE public.evolution_config
  ADD COLUMN IF NOT EXISTS webhook_secret_encrypted TEXT;
