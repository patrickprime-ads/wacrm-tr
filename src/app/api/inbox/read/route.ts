import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!profile?.account_id) {
      return NextResponse.json(
        { error: 'Conta não encontrada' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as { conversation_id?: string };
    if (!body.conversation_id) {
      return NextResponse.json({ error: 'Conversa inválida' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data, error } = await db
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', body.conversation_id)
      .eq('account_id', profile.account_id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: 'Conversa não encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Falha ao marcar como lida',
      },
      { status: 500 }
    );
  }
}
