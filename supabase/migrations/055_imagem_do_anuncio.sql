-- Prime (11/11/2026): miniatura do anúncio de onde o lead veio (cartão "De onde veio" na Caixa de Entrada).
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ad_image_url TEXT;
NOTIFY pgrst, 'reload schema';
