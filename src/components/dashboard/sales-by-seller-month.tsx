"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";

/**
 * Vendas por vendedora, mês a mês (Prime, 11/11/2026). Conta também os cards arquivados e os importados
 * da planilha antiga; a vendedora vem do responsável do card ou, sem login, do nome gravado (seller_name).
 */
type Card = { status: string | null; value: number | null; created_at: string; closed_at?: string | null; updated_at?: string | null; seller_name?: string | null; assigned_to?: string | null; assignee?: { id: string; full_name: string } | null };
type Linha = { nome: string; leads: number; vendas: number; valor: number; perdidos: number };

const mesDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
const nomeMes = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export function SalesBySellerMonth() {
  const { profile, accountRole } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [mes, setMes] = useState(() => mesDe(new Date().toISOString()));
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    void (async () => {
      const db = createClient();
      const completo = await db.from("deals").select("status, value, created_at, closed_at, updated_at, seller_name, assigned_to, assignee:profiles!deals_assigned_to_fkey(id, full_name)").limit(5000);
      // Banco sem a migração 053: segue com o que existe.
      const res = completo.error ? await db.from("deals").select("status, value, created_at, updated_at, assigned_to, assignee:profiles!deals_assigned_to_fkey(id, full_name)").limit(5000) : completo;
      setCards((res.data ?? []) as unknown as Card[]);
      setCarregando(false);
    })();
  }, []);

  const meses = useMemo(() => {
    const s = new Set(cards.map((c) => mesDe(c.created_at)));
    s.add(mesDe(new Date().toISOString()));
    return [...s].sort().reverse();
  }, [cards]);

  const linhas = useMemo(() => {
    const porNome = new Map<string, Linha>();
    const pegar = (c: Card) => {
      const nome = c.assignee?.full_name?.split(" ")[0] || c.seller_name || "Sem vendedora";
      if (accountRole === "agent" && c.assignee?.id !== profile?.id) return null;
      const chave = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^anne$/, "anna");
      if (!porNome.has(chave)) porNome.set(chave, { nome, leads: 0, vendas: 0, valor: 0, perdidos: 0 });
      return porNome.get(chave)!;
    };
    for (const c of cards) {
      if (mesDe(c.created_at) === mes) { const l = pegar(c); if (l) l.leads += 1; }
      const fechou = c.closed_at || c.updated_at || c.created_at;
      if (c.status === "won" && mesDe(fechou) === mes) { const l = pegar(c); if (l) { l.vendas += 1; l.valor += Number(c.value || 0); } }
      if (c.status === "lost" && mesDe(fechou) === mes) { const l = pegar(c); if (l) l.perdidos += 1; }
    }
    return [...porNome.values()].filter((l) => l.leads || l.vendas || l.perdidos).sort((a, b) => b.valor - a.valor || b.vendas - a.vendas);
  }, [cards, mes, accountRole, profile?.id]);

  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <div className="flex-1"><h2 className="font-semibold">Vendas por vendedora</h2><p className="text-xs text-muted-foreground">Leads recebidos, vendas e valor no mês (inclui arquivados e a planilha antiga)</p></div>
        <select value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-lg border bg-background px-3 py-1.5 text-sm capitalize">
          {meses.map((m) => <option key={m} value={m}>{nomeMes(m)}</option>)}
        </select>
      </div>
      {carregando ? <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        : linhas.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nada registrado neste mês.</p>
        : <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">Vendedora</th><th className="py-2 text-right">Leads</th><th className="py-2 text-right">Vendas</th><th className="py-2 text-right">Conversão</th><th className="py-2 text-right">Perdidos</th><th className="py-2 text-right">Valor vendido</th><th className="py-2 text-right">% do total</th></tr></thead>
          <tbody>{linhas.map((l, i) => (
            <tr key={l.nome} className="border-t">
              <td className="py-2.5"><span className="inline-flex items-center gap-2">{i === 0 && l.valor > 0 ? <Trophy className="h-4 w-4 text-primary" /> : null}<strong>{l.nome}</strong></span></td>
              <td className="py-2.5 text-right">{l.leads}</td>
              <td className="py-2.5 text-right">{l.vendas}</td>
              <td className="py-2.5 text-right">{l.leads ? `${Math.round((l.vendas / l.leads) * 100)}%` : "—"}</td>
              <td className="py-2.5 text-right">{l.perdidos}</td>
              <td className="py-2.5 text-right font-semibold text-primary">{formatCurrency(l.valor)}</td>
              <td className="py-2.5 text-right text-muted-foreground">{total ? `${Math.round((l.valor / total) * 100)}%` : "—"}</td>
            </tr>))}
          </tbody>
        </table></div>}
    </section>
  );
}
