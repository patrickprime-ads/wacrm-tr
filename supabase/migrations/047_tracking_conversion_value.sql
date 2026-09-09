-- Valor efetivamente fechado, usado no painel e na Conversions API.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS conversion_value NUMERIC(14, 2);

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_conversion_value_non_negative;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_conversion_value_non_negative
  CHECK (conversion_value IS NULL OR conversion_value >= 0);
