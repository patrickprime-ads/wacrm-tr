"use client";

import { useEffect, useState } from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ALL_FEATURES, FEATURE_LABELS, type FeatureKey } from "@/lib/features";

type PlanRow = { key: string; name: string; enabled_features: FeatureKey[]; agent_enabled_features: FeatureKey[] };

export function PlanManagerDialog() {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const current = plans.find(plan => plan.key === selected);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/master/plans", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setPlans(body.plans);
      setSelected((value) => value || body.plans[0]?.key || "");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao carregar planos"); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) void load(); }, [open]);

  const create = async () => {
    const response = await fetch("/api/master/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error);
    setPlans(value => [...value, body.plan]); setSelected(body.plan.key); setNewName(""); toast.success("Plano criado");
  };
  const change = (field: "enabled_features" | "agent_enabled_features", feature: FeatureKey) => setPlans(value => value.map(plan => {
    if (plan.key !== selected) return plan;
    const list = plan[field];
    const next = list.includes(feature) ? list.filter(item => item !== feature) : [...list, feature];
    if (field === "enabled_features") return { ...plan, enabled_features: next, agent_enabled_features: plan.agent_enabled_features.filter(item => next.includes(item)) };
    return { ...plan, [field]: next };
  }));
  const save = async () => {
    if (!current) return;
    const response = await fetch("/api/master/plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: current.key, name: current.name, enabledFeatures: current.enabled_features, agentEnabledFeatures: current.agent_enabled_features }) });
    const body = await response.json(); if (!response.ok) return toast.error(body.error); toast.success("Plano atualizado");
  };
  const remove = async () => {
    if (!current || !confirm(`Excluir o plano ${current.name}? As empresas dele passarão para o plano Grátis.`)) return;
    const response = await fetch(`/api/master/plans?key=${encodeURIComponent(current.key)}`, { method: "DELETE" });
    const body = await response.json(); if (!response.ok) return toast.error(body.error);
    const remaining = plans.filter(plan => plan.key !== current.key); setPlans(remaining); setSelected(remaining[0]?.key || ""); toast.success("Plano excluído");
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button variant="outline" />}><><Settings2 className="mr-2 h-4 w-4" />Gerenciar planos</></DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
      <DialogHeader><DialogTitle>Planos do CRM</DialogTitle><DialogDescription>Crie, renomeie e escolha os acessos padrão de cada plano.</DialogDescription></DialogHeader>
      <div className="flex gap-2"><Input placeholder="Nome do novo plano" value={newName} onChange={event => setNewName(event.target.value)} /><Button onClick={create} disabled={!newName.trim()}><Plus className="mr-1 h-4 w-4" />Adicionar</Button></div>
      {loading ? <p>Carregando...</p> : <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div className="space-y-2">{plans.map(plan => <button key={plan.key} onClick={() => setSelected(plan.key)} className={`w-full rounded-lg border p-3 text-left ${selected === plan.key ? "border-primary bg-primary/10" : "hover:bg-muted"}`}><strong>{plan.name}</strong><span className="block text-xs text-muted-foreground">{plan.key}</span></button>)}</div>
        {current && <div className="space-y-4"><Input value={current.name} onChange={event => setPlans(value => value.map(plan => plan.key === current.key ? { ...plan, name: event.target.value } : plan))} />
          <div className="grid gap-4 lg:grid-cols-2"><PlanFeatures title="Administrador / proprietário" selected={current.enabled_features} allowed={ALL_FEATURES} onChange={feature => change("enabled_features", feature)} /><PlanFeatures title="Vendedores" selected={current.agent_enabled_features} allowed={current.enabled_features} onChange={feature => change("agent_enabled_features", feature)} /></div>
          <div className="flex justify-between"><Button variant="destructive" onClick={remove} disabled={current.key === "free"}><Trash2 className="mr-1 h-4 w-4" />Excluir plano</Button><Button onClick={save}>Salvar plano</Button></div>
        </div>}
      </div>}
    </DialogContent>
  </Dialog>;
}

function PlanFeatures({ title, selected, allowed, onChange }: { title: string; selected: FeatureKey[]; allowed: FeatureKey[]; onChange: (feature: FeatureKey) => void }) {
  return <div className="rounded-xl border p-4"><h3 className="mb-3 font-semibold">{title}</h3><div className="grid gap-2 sm:grid-cols-2">{ALL_FEATURES.map(feature => <label key={feature} className="flex items-center gap-2"><Checkbox checked={selected.includes(feature)} disabled={!allowed.includes(feature)} onCheckedChange={() => onChange(feature)} />{FEATURE_LABELS[feature]}</label>)}</div></div>;
}
