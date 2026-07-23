"use client";

import { useState } from "react";
import { Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Period = "today" | "yesterday" | "7days" | "custom";

function inputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function DailySummaryPage() {
  const today = inputDate(new Date());
  const [period, setPeriod] = useState<Period>("today");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  function selectedRange() {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    let label = "Hoje";
    if (period === "today") start.setHours(0, 0, 0, 0);
    if (period === "yesterday") {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      label = "Ontem";
    }
    if (period === "7days") {
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      label = "Últimos 7 dias";
    }
    if (period === "custom") {
      const customStart = new Date(`${startDate}T00:00:00`);
      const customEnd = new Date(`${endDate}T23:59:59.999`);
      return {
        start: customStart,
        end: customEnd,
        label: `${customStart.toLocaleDateString("pt-BR")} a ${customEnd.toLocaleDateString("pt-BR")}`,
      };
    }
    return { start, end, label };
  }

  async function generateSummary() {
    setLoading(true);
    const { start, end, label } = selectedRange();
    const db = createClient();
    const [conversationsResult, dealsResult] = await Promise.all([
      db
        .from("conversations")
        .select("id,contact_id,created_at")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString()),
      db
        .from("deals")
        .select("id,value,status,created_at,assigned_to,assignee:profiles(full_name)")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString()),
    ]);
    const conversations = conversationsResult.data ?? [];
    const uniqueLeads = new Set(conversations.map((item) => item.contact_id).filter(Boolean));
    const deals = (dealsResult.data ?? []) as Array<{
      id: string;
      value: number;
      status: string;
      assignee?: { full_name?: string } | Array<{ full_name?: string }> | null;
    }>;
    const won = deals.filter((deal) => deal.status === "won");
    const lost = deals.filter((deal) => deal.status === "lost");
    const open = deals.filter((deal) => deal.status === "open");
    const revenue = won.reduce((total, deal) => total + Number(deal.value || 0), 0);
    const decided = won.length + lost.length;
    const conversion = decided ? Math.round((won.length / decided) * 1000) / 10 : 0;
    const sellers = new Map<string, { opportunities: number; sales: number; value: number }>();
    for (const deal of deals) {
      const relation = Array.isArray(deal.assignee) ? deal.assignee[0] : deal.assignee;
      const name = relation?.full_name || "Sem responsável";
      const row = sellers.get(name) ?? { opportunities: 0, sales: 0, value: 0 };
      row.opportunities += 1;
      if (deal.status === "won") {
        row.sales += 1;
        row.value += Number(deal.value || 0);
      }
      sellers.set(name, row);
    }
    const money = (value: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    setSummary(
      [
        "📊 *RESUMO DE VENDAS*",
        `📅 ${label}`,
        "",
        `📥 Leads recebidos: ${uniqueLeads.size}`,
        `🆕 Oportunidades cadastradas: ${deals.length}`,
        `🤝 Em andamento: ${open.length}`,
        `✅ Vendas fechadas: ${won.length}`,
        `❌ Vendas perdidas: ${lost.length}`,
        "",
        `🎯 Conversão das vendas concluídas: ${conversion}%`,
        `💰 Total vendido: ${money(revenue)}`,
        "",
        "👩‍💼 *Desempenho por vendedor:*",
        ...([...sellers.entries()].length
          ? [...sellers.entries()].map(
              ([name, row]) =>
                `• ${name}: ${row.opportunities} oportunidades | ${row.sales} vendas | ${money(row.value)}`,
            )
          : ["• Nenhuma venda cadastrada no período"]),
      ].join("\n"),
    );
    setLoading(false);
  }

  async function copySummary() {
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
    toast.success("Resumo copiado com emojis");
  }

  function sendWhatsApp() {
    if (!summary) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Gere o resumo de vendas do período e envie pelo WhatsApp.</p>
      </div>
      <div className="grid gap-4 rounded-2xl border bg-card p-5 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-3 rounded-xl border bg-background/40 p-4">
          <label className="text-sm font-medium">Período</label>
          <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="h-10 w-full rounded-lg border bg-muted px-3 text-sm">
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="7days">Últimos 7 dias</option>
            <option value="custom">Escolher período</option>
          </select>
          {period === "custom" && (
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
              <label className="text-xs text-muted-foreground">Data inicial</label>
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              <label className="text-xs text-muted-foreground">Data final</label>
              <Input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
          )}
          <Button className="w-full" onClick={generateSummary} disabled={loading}>{loading ? "Gerando..." : "Gerar resumo"}</Button>
          <Button className="w-full" variant="outline" onClick={copySummary} disabled={!summary}><Copy className="h-4 w-4" /> Copiar texto</Button>
          <Button className="w-full" variant="outline" onClick={sendWhatsApp} disabled={!summary}><Send className="h-4 w-4" /> Enviar no WhatsApp</Button>
          <p className="text-xs leading-relaxed text-muted-foreground">O WhatsApp abrirá a lista para você escolher uma pessoa ou grupo.</p>
        </aside>
        <section className="min-h-[430px] rounded-xl border bg-background/40 p-5">
          <h2 className="mb-3 font-semibold">Prévia da mensagem</h2>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-foreground">{summary || "Clique em “Gerar resumo” para montar a mensagem."}</pre>
        </section>
      </div>
    </div>
  );
}
