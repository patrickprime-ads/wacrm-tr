import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';

type InboxVisibility = 'shared' | 'assigned';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const { data, error } = await ctx.supabase
      .from('accounts')
      .select('inbox_visibility')
      .eq('id', ctx.accountId)
      .single();

    if (error) throw error;
    return NextResponse.json({ visibility: data?.inbox_visibility ?? 'shared' });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as { visibility?: unknown } | null;
    const visibility = body?.visibility;

    if (visibility !== 'shared' && visibility !== 'assigned') {
      return NextResponse.json({ error: 'Modo de caixa inválido.' }, { status: 400 });
    }

    const { error } = await ctx.supabase
      .from('accounts')
      .update({ inbox_visibility: visibility as InboxVisibility })
      .eq('id', ctx.accountId);

    if (error) throw error;
    return NextResponse.json({ visibility });
  } catch (error) {
    return toErrorResponse(error);
  }
}

