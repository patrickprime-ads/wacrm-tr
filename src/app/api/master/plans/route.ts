import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { DEFAULT_AGENT_FEATURES, PLAN_FEATURES } from "@/lib/features";

async function requireMaster() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data } = await client.from("profiles").select("is_master_admin").eq("user_id", user.id).maybeSingle();
  return data?.is_master_admin ? user : null;
}

function makeKey(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export async function GET() {
  if (!await requireMaster()) return NextResponse.json({ error: "Acesso exclusivo do Admin Master" }, { status: 403 });
  const { data, error } = await supabaseAdmin().from("crm_plans").select("key, name, enabled_features, agent_enabled_features").order("created_at");
  if (error) return NextResponse.json({ error: "Execute a atualização 043 no Supabase para gerenciar planos." }, { status: 409 });
  return NextResponse.json({ plans: data ?? [] });
}

export async function POST(request: Request) {
  if (!await requireMaster()) return NextResponse.json({ error: "Acesso exclusivo do Admin Master" }, { status: 403 });
  const body = await request.json().catch(() => null) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const key = makeKey(name);
  if (!name || !key) return NextResponse.json({ error: "Informe o nome do plano" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("crm_plans").insert({ key, name, enabled_features: PLAN_FEATURES.free, agent_enabled_features: DEFAULT_AGENT_FEATURES }).select("key, name, enabled_features, agent_enabled_features").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Já existe um plano com esse nome" : error.message }, { status: 400 });
  return NextResponse.json({ plan: data });
}

export async function PATCH(request: Request) {
  if (!await requireMaster()) return NextResponse.json({ error: "Acesso exclusivo do Admin Master" }, { status: 403 });
  const body = await request.json().catch(() => null) as { key?: unknown; name?: unknown; enabledFeatures?: unknown; agentEnabledFeatures?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!key || !name) return NextResponse.json({ error: "Plano inválido" }, { status: 400 });
  const enabled = Array.isArray(body?.enabledFeatures) ? body.enabledFeatures.filter(item => typeof item === "string") : [];
  const agents = Array.isArray(body?.agentEnabledFeatures) ? body.agentEnabledFeatures.filter(item => typeof item === "string" && enabled.includes(item)) : [];
  const admin = supabaseAdmin();
  const { error } = await admin.from("crm_plans").update({ name, enabled_features: enabled, agent_enabled_features: agents, updated_at: new Date().toISOString() }).eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!await requireMaster()) return NextResponse.json({ error: "Acesso exclusivo do Admin Master" }, { status: 403 });
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key || key === "free") return NextResponse.json({ error: "O plano Grátis é o plano padrão e não pode ser excluído" }, { status: 400 });
  const admin = supabaseAdmin();
  const fallback = PLAN_FEATURES.free;
  const { error: featuresError } = await admin.from("account_features").update({ plan: "free", enabled_features: fallback, agent_enabled_features: ["dashboard", "contacts", "follow_ups"] }).eq("plan", key);
  if (featuresError) return NextResponse.json({ error: featuresError.message }, { status: 400 });
  await admin.from("accounts").update({ plan: "free" }).eq("plan", key);
  const { error } = await admin.from("crm_plans").delete().eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
