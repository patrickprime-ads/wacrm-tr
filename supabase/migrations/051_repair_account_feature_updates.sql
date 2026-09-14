-- Recria a função que salva planos e acessos por conta.
-- Necessária para contas que ficaram com a versão inicial de 041.

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

  SELECT account_id, account_role
    INTO v_caller_account_id, v_caller_role
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL
     OR (v_caller_account_id <> p_account_id AND NOT COALESCE((SELECT is_master_admin FROM public.profiles WHERE user_id = auth.uid()), FALSE))
     OR (v_caller_role <> 'owner' AND NOT COALESCE((SELECT is_master_admin FROM public.profiles WHERE user_id = auth.uid()), FALSE)) THEN
    RAISE EXCEPTION 'Only the account owner or Admin Master can manage access' USING ERRCODE = '42501';
  END IF;

  IF p_plan IS NOT NULL AND p_plan NOT IN ('free', 'pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Invalid plan' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.account_features (
    account_id, plan, enabled_features, updated_by_user_id
  ) VALUES (
    p_account_id,
    COALESCE(p_plan, 'free'),
    COALESCE(p_enabled_features, ARRAY['dashboard', 'contacts', 'follow_ups', 'settings']),
    auth.uid()
  )
  ON CONFLICT (account_id) DO UPDATE SET
    plan = COALESCE(p_plan, account_features.plan),
    enabled_features = COALESCE(p_enabled_features, account_features.enabled_features),
    updated_by_user_id = auth.uid(),
    updated_at = NOW();

  IF p_plan IS NOT NULL THEN
    UPDATE public.accounts SET plan = p_plan WHERE id = p_account_id;
  END IF;
END;
$$;

ALTER FUNCTION public.update_account_features(UUID, TEXT, TEXT[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_account_features(UUID, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_account_features(UUID, TEXT, TEXT[]) TO authenticated;
