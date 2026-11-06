-- Normaliza contas e negócios criados antes da padronização brasileira.
-- O CRM não realiza conversão cambial: os valores existentes já representam
-- reais e apenas a moeda de apresentação/registro é corrigida para BRL.

UPDATE public.accounts
SET default_currency = 'BRL'
WHERE default_currency IS DISTINCT FROM 'BRL';

UPDATE public.deals
SET currency = 'BRL'
WHERE currency IS DISTINCT FROM 'BRL';

ALTER TABLE public.accounts
  ALTER COLUMN default_currency SET DEFAULT 'BRL';

ALTER TABLE public.deals
  ALTER COLUMN currency SET DEFAULT 'BRL';
