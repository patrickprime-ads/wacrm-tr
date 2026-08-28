"use client";

import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ALL_FEATURES, DEFAULT_AGENT_FEATURES, FEATURE_LABELS, PLAN_FEATURES, type FeatureKey, type Plan } from "@/lib/features";

type Props = {
  accountId: string;
  accountName: string;
  plan: Plan;
  adminFeatures: FeatureKey[];
  agentFeatures: FeatureKey[];
  onSaved: (adminFeatures: FeatureKey[], agentFeatures: FeatureKey[]) => void;
};

export function FeatureAccessDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [admin, setAdmin] = useState<FeatureKey[]>(props.adminFeatures.length ? props.adminFeatures : PLAN_FEATURES[props.plan]);
  const [agent, setAgent] = useState<FeatureKey[]>(props.agentFeatures.length ? props.agentFeatures : DEFAULT_AGENT_FEATURES);

  useEffect(() => {
    if (!open) return;
    setAdmin(props.adminFeatures.length ? props.adminFeatures : PLAN_FEATURES[props.plan]);
    setAgent(props.agentFeatures.length ? props.agentFeatures : DEFAULT_AGENT_FEATURES);
  }, [open, props.adminFeatures, props.agentFeatures, props.plan]);

  const toggleAdmin = (feature: FeatureKey) => setAdmin((current) => {
    const next = current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature];
    setAgent((seller) => seller.filter((item) => next.includes(item)));
    return next;
  });
  const toggleAgent = (feature: FeatureKey) => setAgent((current) => current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature]);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/master/update-features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: props.accountId, enabledFeatures: admin, agentEnabledFeatures: agent }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar os acessos");
      props.onSaved(admin, agent);
      toast.success("Acessos atualizados");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <><Settings2 className="mr-1 h-4 w-4" /> Acessos</>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Menus liberados — {props.accountName}</DialogTitle>
          <DialogDescription>Escolha o que administradores e vendedores poderão visualizar. O Admin Master sempre vê tudo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-2">
          <FeatureList title="Administrador / proprietário" features={admin} allowed={ALL_FEATURES} onToggle={toggleAdmin} />
          <FeatureList title="Vendedores" features={agent} allowed={admin} onToggle={toggleAgent} />
        </div>
        <div className="flex justify-end"><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar acessos"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function FeatureList({ title, features, allowed, onToggle }: { title: string; features: FeatureKey[]; allowed: FeatureKey[]; onToggle: (feature: FeatureKey) => void }) {
  return <div className="rounded-xl border p-4"><h3 className="mb-3 font-semibold">{title}</h3><div className="space-y-2">{ALL_FEATURES.map((feature) => {
    const disabled = !allowed.includes(feature);
    return <label key={feature} className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted/50"><Checkbox checked={features.includes(feature)} disabled={disabled} onCheckedChange={() => onToggle(feature)} /><span className={disabled ? "text-muted-foreground" : ""}>{FEATURE_LABELS[feature]}</span></label>;
  })}</div></div>;
}
