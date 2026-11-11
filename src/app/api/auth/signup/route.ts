import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { hashInviteToken } from "@/lib/auth/invitations";

/**
 * Cadastro por convite (Prime, 11/11/2026): a pessoa já entra direto na empresa que convidou,
 * sem precisar confirmar e-mail nem clicar em "Aceitar" depois (era aí que ficavam numa empresa própria).
 */
async function cadastrarComConvite(inviteToken: string, email: string, password: string, fullName: string) {
  const db = supabaseAdmin();
  const { data: inv } = await db.from("account_invitations").select("id, account_id, role, accepted_at, expires_at").eq("token_hash", hashInviteToken(inviteToken)).maybeSingle();
  if (!inv) return { erro: "Convite não encontrado. Peça um link novo." };
  if (inv.accepted_at) return { erro: "Esse convite já foi usado. Peça um link novo." };
  if (new Date(inv.expires_at) <= new Date()) return { erro: "Esse convite expirou. Peça um link novo." };

  const { data: criado, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !criado.user) {
    const msg = error?.message || "";
    return { erro: /already|registered|exists/i.test(msg) ? "Esse e-mail já tem cadastro. Clique em Entrar e use o mesmo link do convite." : `Não consegui criar o login: ${msg}` };
  }
  const userId = criado.user.id;
  const { data: perfil } = await db.from("profiles").select("account_id").eq("user_id", userId).maybeSingle();
  if (perfil) {
    await db.from("profiles").update({ account_id: inv.account_id, account_role: inv.role, full_name: fullName }).eq("user_id", userId);
    if (perfil.account_id && perfil.account_id !== inv.account_id) await db.from("accounts").delete().eq("id", perfil.account_id).eq("owner_user_id", userId);
  } else {
    await db.from("profiles").insert({ user_id: userId, email, full_name: fullName, account_id: inv.account_id, account_role: inv.role });
  }
  await db.from("account_invitations").update({ accepted_at: new Date().toISOString(), accepted_by_user_id: userId }).eq("id", inv.id);
  return { ok: true };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown; full_name?: unknown; invite_token?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  if (!email || !fullName || password.length < 6) return NextResponse.json({ error: "Preencha nome, e-mail e uma senha de pelo menos 6 caracteres" }, { status: 400 });
  const limit = checkRateLimit(`auth-signup:${email}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!limit.success) return rateLimitResponse(limit);
  try {
    const supabase = await createClient();
    const inviteToken = typeof body?.invite_token === "string" ? body.invite_token : "";
    const origin = new URL(request.url).origin;
    const emailRedirectTo = inviteToken ? `${origin}/join/${encodeURIComponent(inviteToken)}` : `${origin}/dashboard`;
    if (inviteToken) {
      const r = await cadastrarComConvite(inviteToken, email, password, fullName);
      if (r.erro) return NextResponse.json({ error: r.erro }, { status: 400 });
      await supabase.auth.signInWithPassword({ email, password });
      return NextResponse.json({ success: true, entrou: true });
    }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo } });
    if (error) return NextResponse.json({ error: error.message }, { status: error.status ?? 400 });
    return NextResponse.json({ success: true, requires_email_confirmation: !data.session });
  } catch (error) {
    console.error("[auth/signup] connection error", error);
    return NextResponse.json({ error: "Não foi possível conectar ao Supabase" }, { status: 503 });
  }
}

