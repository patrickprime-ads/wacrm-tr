"use client";

import { useState } from "react";
import { Building2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Painel Master → Gerenciar empresa: nome, plano, logins (mover/apagar) e apagar a empresa (Prime, 11/11/2026). */
type Usuario = { user_id: string; full_name: string | null; email: string; account_role: string | null; is_master_admin: boolean | null };
type Plano = { key: string; name: string };
const PAPEL: Record<string, string> = { owner: "Dono", admin: "Admin", agent: "Vendedor(a)", viewer: "Leitura" };

export function EmpresaDialog({ accountId, accountName, contas, onChange }: { accountId: string; accountName: string; contas: { id: string; name: string }[]; onChange: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(accountName);
  const [plano, setPlano] = useState("");
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [mover, setMover] = useState<Record<string, { destino: string; papel: string }>>({});
  const [ocupado, setOcupado] = useState(false);

  async function carregar() {
    const j = await fetch(`/api/master/empresa?account_id=${accountId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    if (!j.ok) return toast.error(j.error || "Não consegui carregar a empresa");
    setNome(j.conta.name); setPlano(j.conta.plan); setPlanos(j.planos); setUsuarios(j.usuarios);
  }

  async function chamar(method: string, body: object, ok: string) {
    setOcupado(true);
    const j = await fetch("/api/master/empresa", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ error: "Sem resposta do servidor" }));
    setOcupado(false);
    if (j.error) { toast.error(j.error); return false; }
    toast.success(j.aviso || ok);
    onChange();
    return true;
  }

  async function salvar() {
    if (await chamar("PATCH", { account_id: accountId, name: nome, plan: plano }, "Empresa atualizada")) setAberto(false);
  }
  async function moverLogin(u: Usuario) {
    const m = mover[u.user_id];
    if (!m?.destino) return toast.error("Escolha a empresa de destino");
    const destino = contas.find((c) => c.id === m.destino)?.name;
    const aviso = u.account_role === "owner" ? `\n\n${u.full_name || u.email} é dona(o) desta empresa: ela será apagada depois de mover (com tudo que tiver dentro).` : "";
    if (!window.confirm(`Mover ${u.full_name || u.email} para ${destino} como ${PAPEL[m.papel]}?${aviso}`)) return;
    if (await chamar("POST", { user_id: u.user_id, destino: m.destino, papel: m.papel }, `Movido para ${destino}`)) {
      if (u.account_role === "owner") setAberto(false); else void carregar();
    }
  }
  async function apagarLogin(u: Usuario) {
    if (!window.confirm(`Apagar o login de ${u.full_name || u.email}? A pessoa não vai mais conseguir entrar. Não dá para desfazer.`)) return;
    if (await chamar("DELETE", { user_id: u.user_id }, "Login apagado")) void carregar();
  }
  async function apagarEmpresa() {
    const digitado = window.prompt(`Isso apaga a empresa "${accountName}" com TODOS os leads, negócios, conversas e logins dela. Não dá para desfazer.\n\nPara confirmar, digite APAGAR:`);
    if (digitado?.trim().toUpperCase() !== "APAGAR") return;
    if (await chamar("DELETE", { account_id: accountId }, "Empresa apagada")) setAberto(false);
  }

  const outras = contas.filter((c) => c.id !== accountId);
  const caixa = "rounded-lg border bg-background px-2 py-1.5 text-sm";
  return (
    <Dialog open={aberto} onOpenChange={(v) => { setAberto(v); if (v) void carregar(); }}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <><Building2 className="mr-1 h-4 w-4" />Gerenciar</>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Gerenciar empresa</DialogTitle>
          <DialogDescription>Nome, plano e logins desta empresa.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <label className="text-sm"><span className="mb-1 block text-muted-foreground">Nome da empresa</span><Input value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label className="text-sm"><span className="mb-1 block text-muted-foreground">Plano</span>
            <select value={plano} onChange={(e) => setPlano(e.target.value)} className={`${caixa} h-9 w-full`}>
              {planos.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select></label>
        </div>
        <p className="text-xs text-muted-foreground">Ao trocar o plano, os menus da empresa voltam para o padrão do plano (dá para ajustar depois em Acessos).</p>
        <div className="flex justify-end"><Button onClick={() => void salvar()} disabled={ocupado}>Salvar nome e plano</Button></div>

        <div className="mt-2 border-t pt-4">
          <h3 className="mb-2 text-sm font-semibold">Logins ({usuarios.length})</h3>
          <div className="space-y-2">
            {usuarios.map((u) => {
              const m = mover[u.user_id] || { destino: "", papel: "agent" };
              const set = (v: Partial<typeof m>) => setMover((x) => ({ ...x, [u.user_id]: { ...m, ...v } }));
              return <div key={u.user_id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{u.full_name || "—"}</div><div className="truncate text-xs text-muted-foreground">{u.email} · {u.is_master_admin ? "Admin Master" : PAPEL[u.account_role || ""] || u.account_role}</div></div>
                  {!u.is_master_admin && u.account_role !== "owner" && <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" disabled={ocupado} onClick={() => void apagarLogin(u)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
                {!u.is_master_admin && <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Mover para</span>
                  <select value={m.destino} onChange={(e) => set({ destino: e.target.value })} className={caixa}>
                    <option value="">empresa…</option>
                    {outras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select value={m.papel} onChange={(e) => set({ papel: e.target.value })} className={caixa}>
                    <option value="agent">Vendedor(a)</option><option value="admin">Admin</option><option value="viewer">Leitura</option>
                  </select>
                  <Button size="sm" variant="outline" disabled={ocupado || !m.destino} onClick={() => void moverLogin(u)}>Mover</Button>
                </div>}
              </div>;
            })}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <span className="text-sm text-muted-foreground">Apagar a empresa e tudo dela</span>
          <Button size="sm" variant="outline" className="border-red-500/50 text-red-500 hover:bg-red-500/10" disabled={ocupado} onClick={() => void apagarEmpresa()}><Trash2 className="mr-1 h-4 w-4" />Apagar empresa</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
