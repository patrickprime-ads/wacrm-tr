import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (
      !profile?.account_id ||
      !['owner', 'admin', 'agent'].includes(profile.account_role)
    ) {
      return NextResponse.json(
        { error: 'Sem permissão para agendar follow-up' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      conversation_id?: string;
      delay_hours?: number;
      agent_id?: string | null;
    };
    const delay = Number(body.delay_hours);
    if (
      !body.conversation_id ||
      !Number.isInteger(delay) ||
      delay < 1 ||
      delay > 720
    ) {
      return NextResponse.json(
        { error: 'Conversa ou prazo inválido' },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();
    const { data: conversation } = await db
      .from('conversations')
      .select('id, contact_id')
      .eq('id', body.conversation_id)
      .eq('account_id', profile.account_id)
      .maybeSingle();
    if (!conversation)
      return NextResponse.json(
        { error: 'Conversa não encontrada' },
        { status: 404 }
      );

    let agentId = body.agent_id || null;
    if (!agentId) {
      const { data: setting } = await db
        .from('conversation_ai_settings')
        .select('agent_id')
        .eq('conversation_id', conversation.id)
        .maybeSingle();
      agentId = setting?.agent_id || null;
    }
    if (!agentId) {
      const { data: agent } = await db
        .from('ai_agents')
        .select('id')
        .eq('account_id', profile.account_id)
        .eq('is_active', true)
        .eq('followup_enabled', true)
        .limit(1)
        .maybeSingle();
      agentId = agent?.id || null;
    }
    if (!agentId) {
      return NextResponse.json(
        { error: 'Ative o follow-up em pelo menos um agente de IA' },
        { status: 400 }
      );
    }

    const nextRunAt = new Date(Date.now() + delay * 3_600_000).toISOString();
    const { error } = await db.from('ai_followup_jobs').upsert(
      {
        account_id: profile.account_id,
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        agent_id: agentId,
        attempt: 0,
        next_run_at: nextRunAt,
        status: 'scheduled',
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'conversation_id,agent_id' }
    );
    if (error) throw error;
    return NextResponse.json({ ok: true, next_run_at: nextRunAt });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Falha ao agendar follow-up',
      },
      { status: 500 }
    );
  }
}
