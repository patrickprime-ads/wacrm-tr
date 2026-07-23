import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { data: caller } = await supabase.from("profiles").select("is_master_admin").eq("user_id", user.id).maybeSingle();
  if (!caller?.is_master_admin) return NextResponse.json({ error: "Acesso exclusivo do Admin Master" }, { status: 403 });
  const db = supabaseAdmin();
  const [{ data: accounts }, { data: profiles }, { data: deals }, { data: contacts }, { data: conversations }] = await Promise.all([
    db.from("accounts").select("id, name, created_at"),
    db.from("profiles").select("account_id, account_role"),
    db.from("deals").select("account_id, status, value, assigned_to"),
    db.from("contacts").select("account_id"),
    db.from("conversations").select("account_id, status"),
  ]);
  const rows = (accounts ?? []).map((account) => {
    const accountDeals = (deals ?? []).filter((d) => d.account_id === account.id);
    return {
      id: account.id,
      name: account.name,
      sellers: (profiles ?? []).filter((p) => p.account_id === account.id && p.account_role === "agent").length,
      contacts: (contacts ?? []).filter((c) => c.account_id === account.id).length,
      conversations: (conversations ?? []).filter((c) => c.account_id === account.id && c.status !== "closed").length,
      wonDeals: accountDeals.filter((d) => d.status === "won").length,
      revenue: accountDeals.filter((d) => d.status === "won").reduce((sum, d) => sum + Number(d.value || 0), 0),
      openPipeline: accountDeals.filter((d) => d.status === "open").reduce((sum, d) => sum + Number(d.value || 0), 0),
    };
  }).sort((a, b) => b.revenue - a.revenue);
  return NextResponse.json({ accounts: rows, totals: { accounts: rows.length, sellers: rows.reduce((s, r) => s + r.sellers, 0), revenue: rows.reduce((s, r) => s + r.revenue, 0), contacts: rows.reduce((s, r) => s + r.contacts, 0) } });
}
