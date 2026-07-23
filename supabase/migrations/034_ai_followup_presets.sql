ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS followup_quick_delays INTEGER[] NOT NULL DEFAULT ARRAY[1, 24, 72];

ALTER TABLE public.ai_agents
  DROP CONSTRAINT IF EXISTS ai_agents_followup_quick_delays_check;

ALTER TABLE public.ai_agents
  ADD CONSTRAINT ai_agents_followup_quick_delays_check
  CHECK (
    cardinality(followup_quick_delays) BETWEEN 1 AND 5
    AND array_position(followup_quick_delays, NULL) IS NULL
  );
