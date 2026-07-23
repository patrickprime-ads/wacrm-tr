ALTER TABLE public.lead_tracking_settings
  ADD COLUMN IF NOT EXISTS scoring_rules JSONB NOT NULL DEFAULT '{
    "frio": 15,
    "curioso": 35,
    "interessado": 60,
    "quente": 85,
    "vendido": 100,
    "perdido": 0,
    "paid_source_bonus": 5,
    "fast_response_bonus": 5,
    "frio_label": "Frio",
    "curioso_label": "Curioso",
    "interessado_label": "Interessado",
    "quente_label": "Quente",
    "vendido_label": "Vendido",
    "perdido_label": "Perdido"
  }'::jsonb;
