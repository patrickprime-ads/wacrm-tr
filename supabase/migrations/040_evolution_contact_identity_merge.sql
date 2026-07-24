-- Consolidates Evolution's internal @lid identity and the real WhatsApp
-- phone identity without losing messages, sales or CRM history.

CREATE OR REPLACE FUNCTION public.collapse_contact_conversations(p_contact_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target UUID;
  v_other UUID;
  v_unread INTEGER;
BEGIN
  SELECT id
  INTO v_target
  FROM conversations
  WHERE contact_id = p_contact_id
  ORDER BY last_message_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_target IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(unread_count), 0)
  INTO v_unread
  FROM conversations
  WHERE contact_id = p_contact_id;

  FOR v_other IN
    SELECT id
    FROM conversations
    WHERE contact_id = p_contact_id AND id <> v_target
  LOOP
    UPDATE messages SET conversation_id = v_target WHERE conversation_id = v_other;
    UPDATE message_reactions SET conversation_id = v_target WHERE conversation_id = v_other;
    UPDATE deals SET conversation_id = v_target WHERE conversation_id = v_other;
    UPDATE flow_runs SET conversation_id = v_target WHERE conversation_id = v_other;
    UPDATE ai_agent_runs SET conversation_id = v_target WHERE conversation_id = v_other;
    UPDATE ai_followup_jobs SET conversation_id = v_target WHERE conversation_id = v_other;

    IF EXISTS (
      SELECT 1 FROM conversation_ai_settings WHERE conversation_id = v_target
    ) THEN
      DELETE FROM conversation_ai_settings WHERE conversation_id = v_other;
    ELSE
      UPDATE conversation_ai_settings
      SET conversation_id = v_target
      WHERE conversation_id = v_other;
    END IF;

    DELETE FROM conversations WHERE id = v_other;
  END LOOP;

  UPDATE conversations
  SET unread_count = v_unread,
      status = CASE
        WHEN EXISTS (
          SELECT 1 FROM conversations
          WHERE contact_id = p_contact_id AND status = 'open'
        ) THEN 'open'
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_evolution_contact_identity(
  p_account_id UUID,
  p_survivor_id UUID,
  p_duplicate_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duplicate contacts%ROWTYPE;
BEGIN
  IF p_survivor_id = p_duplicate_id THEN
    RETURN TRUE;
  END IF;

  SELECT *
  INTO v_duplicate
  FROM contacts
  WHERE id = p_duplicate_id AND account_id = p_account_id;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM contacts
    WHERE id = p_survivor_id AND account_id = p_account_id
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE contacts survivor
  SET name = CASE
        WHEN survivor.name IS NULL
          OR btrim(survivor.name) = ''
          OR lower(btrim(survivor.name)) IN (
            'contato do whatsapp', 'desconhecido', 'sem nome', 'você', 'voce', 'you'
          )
          OR survivor.name ~ '^[0-9]{14,}$'
        THEN COALESCE(NULLIF(btrim(v_duplicate.name), ''), survivor.name)
        ELSE survivor.name
      END,
      avatar_url = COALESCE(survivor.avatar_url, v_duplicate.avatar_url),
      lead_source = COALESCE(survivor.lead_source, v_duplicate.lead_source),
      source_detail = COALESCE(survivor.source_detail, v_duplicate.source_detail),
      source_url = COALESCE(survivor.source_url, v_duplicate.source_url),
      utm_source = COALESCE(survivor.utm_source, v_duplicate.utm_source),
      utm_medium = COALESCE(survivor.utm_medium, v_duplicate.utm_medium),
      utm_campaign = COALESCE(survivor.utm_campaign, v_duplicate.utm_campaign),
      utm_content = COALESCE(survivor.utm_content, v_duplicate.utm_content),
      response_time_bucket = COALESCE(
        survivor.response_time_bucket,
        v_duplicate.response_time_bucket
      ),
      lead_temperature = CASE
        WHEN survivor.lead_temperature = 'frio'
          AND v_duplicate.lead_temperature NOT IN ('frio', 'curioso')
        THEN v_duplicate.lead_temperature
        ELSE survivor.lead_temperature
      END
  WHERE survivor.id = p_survivor_id
    AND survivor.account_id = p_account_id;

  UPDATE conversations SET contact_id = p_survivor_id WHERE contact_id = p_duplicate_id;
  UPDATE contact_notes SET contact_id = p_survivor_id WHERE contact_id = p_duplicate_id;
  UPDATE deals SET contact_id = p_survivor_id WHERE contact_id = p_duplicate_id;
  UPDATE broadcast_recipients SET contact_id = p_survivor_id WHERE contact_id = p_duplicate_id;
  UPDATE automation_logs SET contact_id = p_survivor_id WHERE contact_id = p_duplicate_id;
  UPDATE automation_pending_executions SET contact_id = p_survivor_id WHERE contact_id = p_duplicate_id;
  UPDATE ai_followup_jobs SET contact_id = p_survivor_id WHERE contact_id = p_duplicate_id;

  UPDATE contact_tags duplicate_tag
  SET contact_id = p_survivor_id
  WHERE duplicate_tag.contact_id = p_duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM contact_tags survivor_tag
      WHERE survivor_tag.contact_id = p_survivor_id
        AND survivor_tag.tag_id = duplicate_tag.tag_id
    );
  DELETE FROM contact_tags WHERE contact_id = p_duplicate_id;

  UPDATE contact_custom_values duplicate_value
  SET contact_id = p_survivor_id
  WHERE duplicate_value.contact_id = p_duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM contact_custom_values survivor_value
      WHERE survivor_value.contact_id = p_survivor_id
        AND survivor_value.custom_field_id = duplicate_value.custom_field_id
    );
  DELETE FROM contact_custom_values WHERE contact_id = p_duplicate_id;

  IF EXISTS (
    SELECT 1 FROM ai_contact_insights WHERE contact_id = p_survivor_id
  ) THEN
    DELETE FROM ai_contact_insights WHERE contact_id = p_duplicate_id;
  ELSE
    UPDATE ai_contact_insights
    SET contact_id = p_survivor_id
    WHERE contact_id = p_duplicate_id;
  END IF;

  UPDATE flow_runs
  SET contact_id = p_survivor_id
  WHERE contact_id = p_duplicate_id AND status <> 'active';

  PERFORM public.collapse_contact_conversations(p_survivor_id);
  DELETE FROM contacts WHERE id = p_duplicate_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.collapse_contact_conversations(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_evolution_contact_identity(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_evolution_contact_identity(UUID, UUID, UUID) TO service_role;

-- The old default marked untouched imported identities as curious.
UPDATE contacts
SET lead_temperature = 'frio'
WHERE lead_temperature = 'curioso'
  AND (
    name IS NULL
    OR btrim(name) = ''
    OR lower(btrim(name)) IN (
      'contato do whatsapp', 'desconhecido', 'sem nome', 'você', 'voce', 'you'
    )
    OR name ~ '^[0-9]{14,}$'
  );
