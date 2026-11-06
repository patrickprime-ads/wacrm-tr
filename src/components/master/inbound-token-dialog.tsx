"use client";

import { useEffect, useState } from "react";
import { Copy, Radar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Gera o token que o painel de rastreio usa para mandar os leads desta empresa ao Kanban. */
export function InboundTokenDialog({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ hasToken: boolean; createdAt: string | null } | null>(null);
  const [generated, setGenerated] = useState<{ token: string; url: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGenerated(null);
    void fetch(`/api/master/inbound-token?accountId=${accountId}`, { cache: "no-store" })
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [open, accountId]);

  const generate = async () => {
    if (status?.hasToken && !window.confirm("Gerar um token novo desliga o anterior. O rastreio precisará do token novo. Continuar?")) return;
    setLoading(true);
    try {
      const response = await fetch("/api/master/inbound-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível gerar o token");
      setGenerated(body);
      setStatus({ hasToken: true, createdAt: new Date().toISOString() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar token");
    } finally {
      setLoading(false);
    }
  };

  const copy = (value: string) => { void navigator.clipboard.writeText(value); toast.success("Copiado"); };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <><Radar className="mr-1 h-4 w-4" /> Rastreio</>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Conectar rastreio — {accountName}</DialogTitle>
          <DialogDescription>
            Cole o endereço e o token no painel de rastreio (Clientes → Como instalar → CRM Prime). Cada lead novo cai na primeira coluna do Kanban com a origem, a campanha e o anúncio.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {status?.hasToken
            ? `Conectável desde ${status.createdAt ? new Date(status.createdAt).toLocaleDateString("pt-BR") : "—"}.`
            : "Esta empresa ainda não tem token."}
        </p>
        {generated && (
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm">
            {[["Endereço do CRM", generated.url], ["Token (aparece só agora)", generated.token]].map(([label, value]) => (
              <div key={label}>
                <p className="mb-1 text-xs text-muted-foreground">{label}</p>
                <div className="flex gap-2">
                  <code className="flex-1 break-all rounded bg-background px-2 py-1.5 text-xs">{value}</code>
                  <Button size="sm" variant="outline" onClick={() => copy(value)}><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={generate} disabled={loading}>{loading ? "Gerando..." : status?.hasToken ? "Gerar token novo" : "Gerar token"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
