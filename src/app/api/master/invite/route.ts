import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { clampExpiryDays, generateInviteToken, inviteExpiresAt, inviteUrl } from "@/lib/auth/invitations";

/**
 * Admin Master gera link de convite para QUALQUER conta (Prime, 11/11/2026): assim dá para criar o login
 * das vendedoras de uma unidade sem ter a senha do dono dela.
 * POST { account_id, role: "agent" | "admin" | "viewer", label }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { data: eu } = await supabase.from("profiles").select("is_master_admin").eq("user_id", user.id).maybeSingle();
  if (!eu?.is_master_admin) return NextResponse.json({ error: "Acesso exclusivo do Admin Master" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { account_id?: string; role?: string; label?: string } | null;
  const role = ["agent", "admin", "viewer"].includes(String(body?.role)) ? String(body?.role) : "agent";
  const accountId = String(body?.account_id || "");
  const db = supabaseAdmin();
  const { data: conta } = await db.from("accounts").select("id,name").eq("id", accountId).maybeSingle();
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  const { token, hash } = generateInviteToken();
  const dias = clampExpiryDays(7);
  const { error } = await db.from("account_invitations").insert({
    account_id: conta.id, token_hash: hash, role, created_by_user_id: user.id,
    label: String(body?.label || "").trim().slice(0, 80) || null, expires_at: inviteExpiresAt(dias).toISOString(),
  });
  if (error) return NextResponse.json({ error: `Não consegui criar o convite: ${error.message}` }, { status: 500 });
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  return NextResponse.json({ ok: true, url: inviteUrl(token, base), conta: conta.name, expira_em_dias: dias });
}
