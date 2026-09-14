-- Preserve the real entry date for contacts imported from Zernio history.
-- The initial importer stamped the sync moment on every contact, inflating
-- the "Leads de hoje" dashboard metric.

WITH first_inbound AS (
  SELECT c.id AS contact_id, MIN(m.created_at) AS first_message_at
  FROM public.contacts c
  JOIN public.conversations cv
    ON cv.contact_id = c.id
   AND cv.external_provider = 'zernio'
  JOIN public.messages m
    ON m.conversation_id = cv.id
   AND m.sender_type = 'customer'
  GROUP BY c.id
)
UPDATE public.contacts c
SET created_at = first_inbound.first_message_at
FROM first_inbound
WHERE c.id = first_inbound.contact_id
  AND first_inbound.first_message_at < c.created_at;

WITH first_inbound AS (
  SELECT cv.id AS conversation_id, MIN(m.created_at) AS first_message_at
  FROM public.conversations cv
  JOIN public.messages m
    ON m.conversation_id = cv.id
   AND m.sender_type = 'customer'
  WHERE cv.external_provider = 'zernio'
  GROUP BY cv.id
)
UPDATE public.conversations cv
SET created_at = first_inbound.first_message_at
FROM first_inbound
WHERE cv.id = first_inbound.conversation_id
  AND first_inbound.first_message_at < cv.created_at;
