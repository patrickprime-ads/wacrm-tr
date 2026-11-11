"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Painel Master → Acessos: ver os logins de uma empresa e gerar senha temporária nova (Prime, 11/11/2026). */
type Usuario = { user_id: string; full_name: string | null; email: string; account_role: string | null };
const PAPEL: Record<string, string> = { owner: "Dono", admin: "Admin", agent: "Atendente", viewer: "Leitura" };

export function AcessosDialog({ contas }: { contas: { id: string; name: string }[] }) {
  const [contaId, setContaId] = useState("");
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [nova, setNova] = useState<{ email: string; senha: string } | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function escolher(id: string) {
    setContaId(id); setNova(null); setUsuarios([]);
    if (!id) return;
    setCarregando(true);
    const j = await fetch(`/api/master/acessos?account_id=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    setCarregando(false);
    if (j.ok) setUsuarios(j.usuarios); else toast.error(j.error || "Não consegui carregar os logins");
  }

  async function novaSenha(u: Usuario) {
    if (!window.confirm(`Gerar uma senha nova para ${u.full_name || u.email}? A senha atual deixa de funcionar.`)) return;
    const j = await fetch("/api/master/acessos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: u.user_id }) }).then((r) => r.json()).catch(() => ({}));
    if (j.ok) setNova({ email: j.email, senha: j.senha }); else toast.error(j.error || "Não consegui trocar a senha");
  }

  return (
    <Dialog onOpenChange={(aberto) => { if (!aberto) setNova(null); }}>
      <DialogTrigger render={<Button variant="outline" />}>
        <><KeyRound className="mr-2 h-4 w-4" />Acessos</>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Acessos das empresas</DialogTitle>
          <DialogDescription>Veja quem tem login em cada empresa e gere uma senha temporária nova quando alguém não conseguir entrar.</DialogDescription>
        </DialogHeader>
        <select value={contaId} onChange={(e) => void escolher(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="">Escolha a empresa…</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {contaId && !carregando && !usuarios.length && <p className="text-sm text-muted-foreground">Nenhum login nesta empresa.</p>}
        <div className="space-y-2">
          {usuarios.map((u) => (
            <div key={u.user_id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{u.full_name || "—"}</div><div className="truncate text-xs text-muted-foreground">{u.email} · {PAPEL[u.account_role || ""] || u.account_role}</div></div>
              <Button size="sm" variant="ghost" onClick={() => void novaSenha(u)}>Nova senha</Button>
            </div>
          ))}
        </div>
        {nova && (
          <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
            <p>Senha nova gerada. Passe para a pessoa e peça para trocar no primeiro acesso:</p>
            <div className="font-mono text-xs">Link: https://vendas.primemidiadigital.com.br<br />E-mail: {nova.email}<br />Senha temporária: {nova.senha}</div>
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(`Link: https://vendas.primemidiadigital.com.br\nE-mail: ${nova.email}\nSenha temporária: ${nova.senha}`); toast.success("Copiado"); }}>Copiar acesso</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
