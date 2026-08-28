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
  const [formData, setFormData] = useState({
    email: "",
    fullName: "",
    plan: "pro" as Plan,
  });

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
          plan: formData.plan,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao criar empresa");
      }

      toast.success("Empresa criada com sucesso!");
      setFormData({ email: "", fullName: "", plan: "pro" });
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar empresa");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
                <SelectItem value="free">FREE</SelectItem>
                <SelectItem value="pro">PRO</SelectItem>
                <SelectItem value="business">BUSINESS</SelectItem>
                <SelectItem value="enterprise">ENTERPRISE</SelectItem>
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
      </DialogContent>
    </Dialog>
  );
}
