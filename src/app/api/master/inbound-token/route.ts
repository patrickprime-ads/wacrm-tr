import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { generateInboundToken, hashInboundToken } from "@/lib/inbound/token";

/**
 * Token de entrada de leads (rastreio → CRM). Só o Admin Master gera.
 *   GET  ?accountId=  → se a conta já tem token e desde quando
 *   POST { accountId } → gera um token novo (o anterior deixa de valer) e devolve UMA vez
 */
async function requireMaster() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_master_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  return Boolean(profile?.is_master_admin);
}

export async function GET(request: Request) {
  if (!(await requireMaster())) return NextResponse.json({ error: "Acesso restrito ao Admin Master" }, { status: 403 });
  const accountId = new URL(request.url).searchParams.get("accountId") || "";
  const { data, error } = await supabaseAdmin()
    .from("accounts")
    .select("inbound_token_hash, inbound_token_created_at")
    .eq("id", accountId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Rode a atualização 052 no Supabase." }, { status: 409 });
  return NextResponse.json({ hasToken: Boolean(data?.inbound_token_hash), createdAt: data?.inbound_token_created_at ?? null });
}

export async function POST(request: Request) {
  if (!(await requireMaster())) return NextResponse.json({ error: "Acesso restrito ao Admin Master" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { accountId?: unknown } | null;
  const accountId = String(body?.accountId ?? "");
  if (!accountId) return NextResponse.json({ error: "Conta não informada" }, { status: 400 });

  const token = generateInboundToken();
  const { error } = await supabaseAdmin()
    .from("accounts")
    .update({ inbound_token_hash: hashInboundToken(token), inbound_token_created_at: new Date().toISOString() })
    .eq("id", accountId);
  if (error) return NextResponse.json({ error: "Rode a atualização 052 no Supabase." }, { status: 409 });

  const origin = new URL(request.url).origin;
  return NextResponse.json({ token, url: origin });
}
