"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Plan } from "@/hooks/use-enabled-features";

interface CreateAccountDialogProps {
  onSuccess?: () => void;
}

export function CreateAccountDialog({ onSuccess }: CreateAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<{ key: string; name: string }[]>([
    { key: "free", name: "Grátis" }, { key: "pro", name: "Pro" },
    { key: "business", name: "Business" }, { key: "enterprise", name: "Enterprise" },
  ]);
  const [formData, setFormData] = useState({
    email: "",
    fullName: "",
    ownerName: "",
    plan: "pro" as Plan,
  });
  const [criada, setCriada] = useState<{ empresa: string; email: string; senha: string } | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setCriada(null);
    if (nextOpen) void fetch("/api/master/plans", { cache: "no-store" })
      .then(async response => response.ok ? response.json() : Promise.reject())
      .then(body => setPlans(body.plans))
      .catch(() => undefined);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.fullName) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/master/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          fullName: formData.fullName,
          ownerName: formData.ownerName,
          plan: formData.plan,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao criar empresa");
      }

      const body = await res.json();
      toast.success("Empresa criada com sucesso!");
      // Mostra a senha temporária uma vez, para passar ao responsável (ele troca no primeiro acesso).
      setCriada({ empresa: formData.fullName, email: formData.email, senha: String(body.tempPassword || "") });
      setFormData({ email: "", fullName: "", ownerName: "", plan: "pro" });
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar empresa");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <>
          <Plus className="h-4 w-4 mr-2" />
          Nova Empresa
        </>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Criar Nova Empresa</DialogTitle>
          <DialogDescription>
            Crie uma nova empresa e conta admin para começar
          </DialogDescription>
        </DialogHeader>

        {criada ? (
          <div className="space-y-3 text-sm">
            <p><strong>{criada.empresa}</strong> criada.</p>
            <p>Passe para o responsável (ele troca a senha no primeiro acesso):</p>
            <div className="rounded-lg bg-muted p-3 font-mono text-xs">E-mail: {criada.email}<br />Senha temporária: {criada.senha}</div>
            <Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(`E-mail: ${criada.email}\nSenha temporária: ${criada.senha}`); toast.success("Copiado"); }}>Copiar acesso</Button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome da Empresa *</Label>
            <Input
              id="fullName"
              placeholder="Ex: Vida Card Farroupilha"
              value={formData.fullName}
              onChange={(e) =>
                setFormData({ ...formData, fullName: e.target.value })
              }
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ownerName">Nome do responsável</Label>
            <Input id="ownerName" placeholder="Ex.: Daiane" value={formData.ownerName} onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email do Admin *</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@empresa.com"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan">Plano Inicial</Label>
            <Select
              value={formData.plan}
              onValueChange={(value) =>
                setFormData({ ...formData, plan: value as Plan })
              }
              disabled={loading}
            >
              <SelectTrigger id="plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map(plan => <SelectItem key={plan.key} value={plan.key}>{plan.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Pode ser alterado depois
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {loading ? "Criando..." : "Criar Empresa"}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
