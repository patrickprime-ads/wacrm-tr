-- Prime (11/11/2026): a Evolution só aceita UM webhook por instância. Quando o CRM liga o WhatsApp de uma
-- unidade que já manda as mensagens para o painel de rastreio, o CRM guarda o endereço antigo aqui e
-- repassa cada mensagem para ele, assim o rastreio continua funcionando.
ALTER TABLE public.evolution_config ADD COLUMN IF NOT EXISTS forward_url TEXT;
