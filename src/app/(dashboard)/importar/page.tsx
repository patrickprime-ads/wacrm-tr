"use client";

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

/**
 * Importar o CRM antigo (Prime, 11/11/2026): recebe o arquivo .json preparado a partir da planilha
 * "Leads" da unidade e manda em lotes de 20 para /api/import/legado. Pode rodar de novo sem duplicar.
 */
type Lead = { chave: string; entrada: string; status: string; vendedora: string; arquivado: boolean };

export default function ImportarPage() {
  const { accountRole, profile } = useAuth();
  const master = !!(profile as { is_master_admin?: boolean } | null)?.is_master_admin;
  const [contas, setContas] = useState<{ id: string; name: string }[]>([]);
  const [contaId, setContaId] = useState("");
  const [convites, setConvites] = useState<Record<string, string>>({});
  const [nomeVendedora, setNomeVendedora] = useState("");

  useEffect(() => {
    if (!master) return;
    void fetch("/api/master/summary").then((r) => r.json()).then((j) => {
      const lista = ((j?.rows ?? j?.accounts ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
      setContas(lista);
    }).catch(() => {});
  }, [master]);

  async function convidar() {
    const nome = nomeVendedora.trim();
    if (!contaId || !nome) return;
    const j = await fetch("/api/master/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: contaId, role: "agent", label: nome }) }).then((r) => r.json()).catch(() => ({}));
    if (j.url) { setConvites((c) => ({ ...c, [nome]: j.url })); setNomeVendedora(""); } else toast.error(j.error || "Não consegui gerar o convite");
  }
  const [leads, setLeads] = useState<Lead[]>([]);
  const [arquivo, setArquivo] = useState("");
  const [rodando, setRodando] = useState(false);
  const [feito, setFeito] = useState({ criados: 0, pulados: 0, lotes: 0, total: 0 });
  const [erro, setErro] = useState("");

  if (!master && accountRole && !["owner", "admin"].includes(accountRole)) {
    return <div className="p-8 text-sm text-muted-foreground">Só o dono ou um admin da conta pode importar.</div>;
  }

  async function ler(file: File) {
    setErro(""); setFeito({ criados: 0, pulados: 0, lotes: 0, total: 0 });
    try {
      const j = JSON.parse(await file.text());
      const lista = (Array.isArray(j) ? j : j.leads) as Lead[];
      if (!Array.isArray(lista) || !lista.length) throw new Error("arquivo sem leads");
      setLeads(lista); setArquivo(file.name);
    } catch (e) { setErro(`Arquivo inválido: ${(e as Error).message}`); setLeads([]); }
  }

  async function importar() {
    if (master && !contaId) { setErro("Escolha a conta de destino."); return; }
    setRodando(true); setErro("");
    const total = Math.ceil(leads.length / 20);
    let criados = 0, pulados = 0;
    for (let i = 0; i < leads.length; i += 20) {
      const r = await fetch("/api/import/legado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leads: leads.slice(i, i + 20), account_id: master ? contaId : undefined }) });
      const j = await r.json().catch(() => ({ ok: false, error: `erro ${r.status}` }));
      if (!j.ok) { setErro(j.error || "Falha na importação"); setRodando(false); return; }
      criados += j.criados || 0; pulados += j.pulados || 0;
      setFeito({ criados, pulados, lotes: i / 20 + 1, total });
    }
    setRodando(false);
    toast.success(`Importação concluída: ${criados} cards criados`);
  }

  const porMes = leads.reduce<Record<string, number>>((m, l) => { const k = String(l.entrada).slice(0, 7); m[k] = (m[k] || 0) + 1; return m; }, {});
  const vendedoras = leads.reduce<Record<string, number>>((m, l) => { const k = l.vendedora || "—"; m[k] = (m[k] || 0) + 1; return m; }, {});

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Importar CRM antigo</h1>
        <p className="mt-1 text-sm text-muted-foreground">Traz os leads da planilha antiga para o Kanban, com status, vendedora, valor e histórico. Pode rodar de novo: o que já foi importado é pulado.</p>
      </div>
      {master && (
        <div className="space-y-3 rounded-xl border p-5 text-sm">
          <p className="font-medium">Conta de destino (Admin Master)</p>
          <select value={contaId} onChange={(e) => { setContaId(e.target.value); setConvites({}); }} className="w-full rounded-lg border bg-background px-3 py-2">
            <option value="">Escolha a conta…</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {contaId && (
            <div className="space-y-2">
              <p className="text-muted-foreground">Convite para vendedora (login próprio, papel Atendente, vale 7 dias):</p>
              <div className="flex gap-2">
                <input value={nomeVendedora} onChange={(e) => setNomeVendedora(e.target.value)} placeholder="Nome (ex.: Fabi)" className="flex-1 rounded-lg border bg-background px-3 py-2" />
                <Button type="button" variant="outline" onClick={() => void convidar()}>Gerar link</Button>
              </div>
              {Object.entries(convites).map(([nome, url]) => (
                <div key={nome} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                  <span className="w-20 shrink-0 font-medium">{nome}</span>
                  <code className="flex-1 truncate text-xs">{url}</code>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(url); toast.success("Link copiado"); }}>Copiar</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center hover:border-primary">
        <Upload className="h-6 w-6 text-primary" />
        <span className="text-sm">{arquivo || "Escolher o arquivo .json da importação"}</span>
        <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void ler(f); }} />
      </label>
      {leads.length > 0 && (
        <div className="space-y-3 rounded-xl border p-5 text-sm">
          <p><strong>{leads.length}</strong> leads · <strong>{leads.filter((l) => !l.arquivado).length}</strong> vão para o Kanban · <strong>{leads.filter((l) => l.arquivado).length}</strong> ficam arquivados (contam nos relatórios)</p>
          <p className="text-muted-foreground">Por mês: {Object.entries(porMes).sort().map(([k, v]) => `${k.slice(5, 7)}/${k.slice(0, 4)}: ${v}`).join(" · ")}</p>
          <p className="text-muted-foreground">Por vendedora: {Object.entries(vendedoras).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
          <p className="text-xs text-muted-foreground">As vendedoras com login nesta conta já ficam como responsáveis pelos cards (pelo primeiro nome). Crie os logins antes de importar.</p>
          <Button onClick={() => void importar()} disabled={rodando}>{rodando ? `Importando… lote ${feito.lotes}/${feito.total}` : "Importar agora"}</Button>
          {(feito.criados > 0 || feito.pulados > 0) && <p className="text-emerald-500">{feito.criados} cards criados · {feito.pulados} já existiam</p>}
        </div>
      )}
      {erro && <p className="text-sm text-red-500">{erro}</p>}
    </div>
  );
}
