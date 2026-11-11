import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";

/**
 * Acessos das empresas, só para o Admin Master (Prime, 11/11/2026).
 *  GET  ?account_id=...            → logins da empresa (nome, e-mail, papel)
 *  POST { user_id }                → gera uma senha temporária nova para esse login e devolve uma vez
 */
async function exigirMaster() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  const { data: eu } = await supabase.from("profiles").select("is_master_admin").eq("user_id", user.id).maybeSingle();
  if (!eu?.is_master_admin) return { erro: NextResponse.json({ error: "Acesso exclusivo do Admin Master" }, { status: 403 }) };
  return { user };
}

export async function GET(request: Request) {
  const m = await exigirMaster(); if (m.erro) return m.erro;
  const accountId = new URL(request.url).searchParams.get("account_id") || "";
  const { data, error } = await supabaseAdmin().from("profiles").select("user_id, full_name, email, account_role").eq("account_id", accountId).order("account_role");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, usuarios: data ?? [] });
}

function senhaTemporaria() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => letras[b % letras.length]).join("");
}

export async function POST(request: Request) {
  const m = await exigirMaster(); if (m.erro) return m.erro;
  const body = (await request.json().catch(() => null)) as { user_id?: string } | null;
  const userId = String(body?.user_id || "");
  const admin = supabaseAdmin();
  const { data: alvo } = await admin.from("profiles").select("user_id, email, is_master_admin").eq("user_id", userId).maybeSingle();
  if (!alvo) return NextResponse.json({ error: "Login não encontrado" }, { status: 404 });
  if (alvo.is_master_admin && alvo.user_id !== m.user!.id) return NextResponse.json({ error: "Não dá para trocar a senha de outro Admin Master" }, { status: 403 });
  const senha = senhaTemporaria();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: senha });
  if (error) return NextResponse.json({ error: `Não consegui trocar a senha: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, email: alvo.email, senha });
}
