-- Distribuição automática das novas conversas entre vendedores.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS inbox_assignment_mode TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_inbox_assignment_mode_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_inbox_assignment_mode_check
  CHECK (inbox_assignment_mode IN ('manual', 'balanced'));

CREATE OR REPLACE FUNCTION public.assign_new_conversation_to_agent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_agent_id IS NOT NULL OR NOT EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.id = NEW.account_id
      AND a.inbox_assignment_mode = 'balanced'
  ) THEN
    RETURN NEW;
  END IF;

  -- Serialize inserts for this account so simultaneous conversations
  -- cannot choose the same seller before seeing each other's assignment.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.account_id::text));

  SELECT p.user_id
  INTO NEW.assigned_agent_id
  FROM public.profiles p
  WHERE p.account_id = NEW.account_id
    AND p.account_role = 'agent'
  ORDER BY (
    SELECT COUNT(*)
    FROM public.conversations c
    WHERE c.account_id = NEW.account_id
      AND c.assigned_agent_id = p.user_id
      AND c.status IN ('open', 'pending')
  ) ASC,
  p.created_at ASC,
  p.user_id ASC
  LIMIT 1;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.assign_new_conversation_to_agent() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_new_conversation_to_agent() FROM PUBLIC;

DROP TRIGGER IF EXISTS assign_new_conversation_to_agent_trigger
  ON public.conversations;

CREATE TRIGGER assign_new_conversation_to_agent_trigger
BEFORE INSERT ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.assign_new_conversation_to_agent();
