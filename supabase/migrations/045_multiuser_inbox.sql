ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS inbox_visibility TEXT NOT NULL DEFAULT 'shared'
  CHECK (inbox_visibility IN ('shared', 'assigned'));

COMMENT ON COLUMN public.accounts.inbox_visibility IS
  'shared: agents see all conversations; assigned: agents see their own and unassigned conversations';

DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations
FOR SELECT USING (
  is_account_member(account_id)
  AND (
    is_account_member(account_id, 'admin')
    OR NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_id = conversations.account_id
        AND p.account_role = 'agent'
    )
    OR COALESCE(
      (SELECT a.inbox_visibility FROM public.accounts a WHERE a.id = conversations.account_id),
      'shared'
    ) = 'shared'
    OR assigned_agent_id = auth.uid()
    OR assigned_agent_id IS NULL
  )
);
