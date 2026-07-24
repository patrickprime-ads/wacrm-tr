-- New WhatsApp contacts must not be treated as commercially qualified
-- before a seller, automation or scoring rule evaluates them.
ALTER TABLE public.contacts
  ALTER COLUMN lead_temperature SET DEFAULT 'frio';

-- Repair only untouched placeholder contacts created by the previous
-- database default. Manually named/classified contacts are preserved.
UPDATE public.contacts
SET lead_temperature = 'frio'
WHERE lead_temperature = 'curioso'
  AND (
    name IS NULL
    OR btrim(name) = ''
    OR lower(btrim(name)) IN (
      'contato do whatsapp',
      'desconhecido',
      'sem nome'
    )
    OR regexp_replace(name, '\D', '', 'g') = regexp_replace(phone, '\D', '', 'g')
  );
