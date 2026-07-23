"use client";

import { useMemo, useState } from "react";
import { Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Period = "today" | "yesterday" | "7days";

export default function DailySummaryPage() {
  const [period, setPeriod] = useState<Period>("today");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const periodLabel = useMemo(
    () => ({ today: "Hoje", yesterday: "Ontem", "7days": "Últimos 7 dias" })[period],
    [period],
  );

  async function generateSummary() {
    setLoading(true);
    const db = createClient();
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    if (period === "today") start.setHours(0, 0, 0, 0);
    if (period === "yesterday") {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    }
    if (period === "7days") {
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    }

    const [contactsResult, dealsResult] = await Promise.all([
      db.from("contacts").select("id,lead_temperature,created_at").gte("created_at", start.toISOString()).lte("created_at", end.toISOString()),
      db.from("deals").select("id,value,status,created_at,assigned_to,assignee:profiles(full_name)").gte("created_at", start.toISOString()).lte("created_at", end.toISOString()),
    ]);
    const contacts = contactsResult.data ?? [];
    const deals = (dealsResult.data ?? []) as Array<{
      id: string;
      value: number;
      status: string;
      assigned_to?: string;
      assignee?: { full_name?: string } | Array<{ full_name?: string }> | null;
    }>;
    const won = deals.filter((deal) => deal.status === "won");
    const lost = deals.filter((deal) => deal.status === "lost");
    const revenue = won.reduce((total, deal) => total + Number(deal.value || 0), 0);
    const conversion = deals.length ? Math.round((won.length / deals.length) * 1000) / 10 : 0;
    const sellers = new Map<string, { leads: number; sales: number; value: number }>();
    for (const deal of deals) {
      const relation = Array.isArray(deal.assignee) ? deal.assignee[0] : deal.assignee;
      const name = relation?.full_name || "Sem responsável";
      const row = sellers.get(name) ?? { leads: 0, sales: 0, value: 0 };
      row.leads += 1;
      if (deal.status === "won") {
        row.sales += 1;
        row.value += Number(deal.value || 0);
      }
      sellers.set(name, row);
    }
    const format = (value: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    const lines = [
      "📊 RESUMO DO DIA",
      `📅 ${periodLabel} — ${start.toLocaleDateString("pt-BR")}`,
      "",
      `📥 Leads recebidos: ${contacts.length}`,
      `🆕 Novos: ${contacts.filter((contact) => contact.lead_temperature === "curioso").length}`,
      `🔥 Quentes: ${contacts.filter((contact) => contact.lead_temperature === "quente").length}`,
      `✅ Fechados: ${won.length}`,
      `❌ Perdidos: ${lost.length}`,
      "",
      `🎯 Conversão: ${conversion}%`,
      `💰 Vendido: ${format(revenue)}`,
      "",
      "👩‍💼 Vendedores:",
      ...[...sellers.entries()].map(
        ([name, row]) => `• ${name}: ${row.leads} oportunidades | ${row.sales} vendas | ${format(row.value)}`,
      ),
    ];
    setSummary(lines.join("\n"));
    setLoading(false);
  }

  async function copySummary() {
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
    toast.success("Resumo copiado");
  }

  function sendWhatsApp() {
    if (!summary) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Resumo do Dia</h1>
        <p className="text-sm text-muted-foreground">Gere uma mensagem pronta para enviar pelo WhatsApp.</p>
      </div>
      <div className="grid gap-4 rounded-2xl border bg-card p-5 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-3 rounded-xl border bg-background/40 p-4">
          <label className="text-sm font-medium">Período</label>
          <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="h-10 w-full rounded-lg border bg-muted px-3 text-sm">
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="7days">Últimos 7 dias</option>
          </select>
          <Button className="w-full" onClick={generateSummary} disabled={loading}>{loading ? "Gerando..." : "Gerar resumo"}</Button>
          <Button className="w-full" variant="outline" onClick={copySummary} disabled={!summary}><Copy className="h-4 w-4" /> Copiar texto</Button>
          <Button className="w-full" variant="outline" onClick={sendWhatsApp} disabled={!summary}><Send className="h-4 w-4" /> Enviar no WhatsApp</Button>
        </aside>
        <section className="min-h-[430px] rounded-xl border bg-background/40 p-5">
          <h2 className="mb-3 font-semibold">Prévia da mensagem</h2>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-foreground">{summary || "Clique em “Gerar resumo” para montar a mensagem."}</pre>
        </section>
      </div>
    </div>
  );
}
