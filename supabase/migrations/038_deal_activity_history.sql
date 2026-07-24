CREATE TABLE IF NOT EXISTS public.deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deal_activities_deal_created_idx
  ON public.deal_activities(deal_id, created_at DESC);

ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deal_activities_select ON public.deal_activities;
CREATE POLICY deal_activities_select ON public.deal_activities
  FOR SELECT USING (public.is_account_member(account_id));

CREATE OR REPLACE FUNCTION public.log_deal_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO deal_activities(account_id, deal_id, actor_id, actor_name, event_type, description)
    VALUES (NEW.account_id, NEW.id, auth.uid(), (SELECT full_name FROM profiles WHERE user_id = auth.uid()), 'created', 'Venda criada');
    RETURN NEW;
  END IF;

  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    INSERT INTO deal_activities(account_id, deal_id, actor_id, actor_name, event_type, description, metadata)
    VALUES (NEW.account_id, NEW.id, auth.uid(), (SELECT full_name FROM profiles WHERE user_id = auth.uid()), 'stage_changed', 'Etapa da venda alterada',
      jsonb_build_object('from', OLD.stage_id, 'to', NEW.stage_id));
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO deal_activities(account_id, deal_id, actor_id, actor_name, event_type, description, metadata)
    VALUES (NEW.account_id, NEW.id, auth.uid(), (SELECT full_name FROM profiles WHERE user_id = auth.uid()), 'status_changed',
      CASE NEW.status WHEN 'won' THEN 'Venda marcada como ganha' WHEN 'lost' THEN 'Venda marcada como perdida' ELSE 'Venda reaberta' END,
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO deal_activities(account_id, deal_id, actor_id, actor_name, event_type, description)
    VALUES (NEW.account_id, NEW.id, auth.uid(), (SELECT full_name FROM profiles WHERE user_id = auth.uid()), 'assigned', 'Responsável pela venda alterado');
  END IF;
  IF OLD.value IS DISTINCT FROM NEW.value THEN
    INSERT INTO deal_activities(account_id, deal_id, actor_id, actor_name, event_type, description, metadata)
    VALUES (NEW.account_id, NEW.id, auth.uid(), (SELECT full_name FROM profiles WHERE user_id = auth.uid()), 'value_changed', 'Valor da venda alterado',
      jsonb_build_object('from', OLD.value, 'to', NEW.value));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_deal_activity ON public.deals;
CREATE TRIGGER trg_log_deal_activity
AFTER INSERT OR UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.log_deal_activity();
