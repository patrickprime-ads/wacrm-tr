ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS installment_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contract_months INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS selected_products TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_contract_months_check;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_contract_months_check
  CHECK (contract_months IN (1, 2, 3, 6, 12));

UPDATE public.deals
SET installment_value = value
WHERE installment_value = 0 AND value > 0;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lead_temperature TEXT NOT NULL DEFAULT 'curioso',
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS adset_id TEXT,
  ADD COLUMN IF NOT EXISTS ad_id TEXT,
  ADD COLUMN IF NOT EXISTS response_time_bucket TEXT;

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_lead_temperature_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_lead_temperature_check
  CHECK (
    lead_temperature IN (
      'frio',
      'curioso',
      'interessado',
      'quente',
      'vendido',
      'perdido'
    )
  );

INSERT INTO public.pipeline_stages (pipeline_id, name, color, position)
SELECT pipeline.id, 'Perdido', '#ef4444', 5
FROM public.pipelines AS pipeline
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pipeline_stages AS stage
  WHERE stage.pipeline_id = pipeline.id
    AND lower(stage.name) IN ('perdido', 'lost')
);
