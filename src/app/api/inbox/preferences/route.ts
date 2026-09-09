import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';

type InboxVisibility = 'shared' | 'assigned';
type InboxAssignmentMode = 'manual' | 'balanced';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const { data, error } = await ctx.supabase
      .from('accounts')
      .select('inbox_visibility, inbox_assignment_mode')
      .eq('id', ctx.accountId)
      .single();

    if (error) throw error;
    return NextResponse.json({
      visibility: data?.inbox_visibility ?? 'shared',
      assignmentMode: data?.inbox_assignment_mode ?? 'manual',
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      visibility?: unknown;
      assignmentMode?: unknown;
    } | null;
    const visibility = body?.visibility;
    const assignmentMode = body?.assignmentMode;

    if (
      visibility === undefined &&
      assignmentMode === undefined
    ) {
      return NextResponse.json({ error: 'Nenhuma preferência informada.' }, { status: 400 });
    }
    if (visibility !== undefined && visibility !== 'shared' && visibility !== 'assigned') {
      return NextResponse.json({ error: 'Modo de caixa inválido.' }, { status: 400 });
    }
    if (assignmentMode !== undefined && assignmentMode !== 'manual' && assignmentMode !== 'balanced') {
      return NextResponse.json({ error: 'Modo de distribuição inválido.' }, { status: 400 });
    }

    const updates: {
      inbox_visibility?: InboxVisibility;
      inbox_assignment_mode?: InboxAssignmentMode;
    } = {};
    if (visibility !== undefined) updates.inbox_visibility = visibility;
    if (assignmentMode !== undefined) updates.inbox_assignment_mode = assignmentMode;

    const { error } = await ctx.supabase
      .from('accounts')
      .update(updates)
      .eq('id', ctx.accountId);

    if (error) throw error;
    return NextResponse.json({ visibility, assignmentMode });
  } catch (error) {
    return toErrorResponse(error);
  }
}
