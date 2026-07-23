-- CRM brasileiro: uma única moeda em toda a conta.
UPDATE public.accounts SET default_currency = 'BRL' WHERE default_currency IS DISTINCT FROM 'BRL';
UPDATE public.deals SET currency = 'BRL' WHERE currency IS DISTINCT FROM 'BRL';

ALTER TABLE public.accounts ALTER COLUMN default_currency SET DEFAULT 'BRL';
ALTER TABLE public.deals ALTER COLUMN currency SET DEFAULT 'BRL';

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_brl_only;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_brl_only CHECK (default_currency = 'BRL');
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_brl_only;
ALTER TABLE public.deals ADD CONSTRAINT deals_brl_only CHECK (currency = 'BRL');
