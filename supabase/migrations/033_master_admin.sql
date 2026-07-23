ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_master_admin BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_profiles_master_admin ON public.profiles(is_master_admin) WHERE is_master_admin = TRUE;
