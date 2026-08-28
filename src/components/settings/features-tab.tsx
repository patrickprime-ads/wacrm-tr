"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsPanelHead } from "./settings-panel-head";
import { PLAN_FEATURES, type FeatureKey, type Plan } from "@/hooks/use-enabled-features";
import { useAuth } from "@/hooks/use-auth";

const FEATURE_LABELS: Record<FeatureKey, { name: string; description: string }> = {
  dashboard: { name: "Painel", description: "Acesso ao dashboard principal" },
  contacts: { name: "Contatos", description: "Gerenciamento de contatos" },
  pipeline: { name: "Pipeline de Vendas", description: "Visualizar e gerenciar pipeline" },
  inbox: { name: "Caixa de Entrada", description: "Mensagens e conversas WhatsApp" },
  lead_scoring: { name: "Lead Scoring", description: "Análise e pontuação de leads" },
  follow_ups: { name: "Follow-ups", description: "Agendamento de acompanhamentos" },
  lead_tracking: { name: "Tracking de Leads", description: "Rastreamento avançado (apenas admin)" },
  ai_agents: { name: "Agentes IA", description: "Assistentes inteligentes (apenas admin)" },
  automations: { name: "Automações", description: "Fluxos de automação (apenas admin)" },
  reports: { name: "Relatórios", description: "Análises e relatórios" },
  broadcasts: { name: "Disparos", description: "Envio em massa de mensagens" },
  flows: { name: "Fluxos", description: "Fluxos de conversação" },
  integrations: { name: "Integrações", description: "Integrações com terceiros" },
  templates: { name: "Modelos", description: "Modelos de mensagens" },
  settings: { name: "Configurações", description: "Acesso às configurações da conta" },
};

interface FeaturesState {
  plan: Plan;
  enabledFeatures: FeatureKey[];
}

export function FeaturesTab() {
  const { isOwner } = useAuth();
  const [state, setState] = useState<FeaturesState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchFeatures = async () => {
      try {
        const res = await fetch("/api/account/features");
        if (!res.ok) throw new Error("Failed to load features");
        const data = await res.json();
        setState({
          plan: data.plan,
          enabledFeatures: data.enabledFeatures,
        });
      } catch (err) {
        console.error("[FeaturesTab] fetch error:", err);
        toast.error("Não foi possível carregar os acessos");
      } finally {
        setLoading(false);
      }
    };

    fetchFeatures();
  }, []);

  const handlePlanChange = useCallback(async (newPlan: Plan) => {
    if (!state) return;
    setSaving(true);
    try {
      const res = await fetch("/api/account/features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: newPlan,
          enabledFeatures: PLAN_FEATURES[newPlan],
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      setState({
        plan: newPlan,
        enabledFeatures: PLAN_FEATURES[newPlan],
      });
      toast.success(`Plano atualizado para ${newPlan.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar plano");
    } finally {
      setSaving(false);
    }
  }, [state]);

  const toggleFeature = useCallback(async (feature: FeatureKey) => {
    if (!state) return;
    setSaving(true);
    try {
      const newFeatures = state.enabledFeatures.includes(feature)
        ? state.enabledFeatures.filter((f) => f !== feature)
        : [...state.enabledFeatures, feature];

      const res = await fetch("/api/account/features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabledFeatures: newFeatures,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      setState((prev) =>
        prev ? { ...prev, enabledFeatures: newFeatures } : null
      );
      toast.success("Acessos atualizados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally {
      setSaving(false);
    }
  }, [state]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
        <p className="text-sm text-red-300">Erro ao carregar acessos</p>
      </div>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title="Acessos e funcionalidades"
        description="Controle quais funcionalidades estão disponíveis para sua equipe"
      />

      {/* Plan selection */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold">Plano atual</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Selecione um plano para ativar automaticamente os acessos correspondentes
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(["free", "pro", "business", "enterprise"] as const).map((plan) => (
                <Button
                  key={plan}
                  variant={state.plan === plan ? "default" : "outline"}
                  onClick={() => handlePlanChange(plan)}
                  disabled={saving || !isOwner}
                  className="justify-center"
                >
                  {plan.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Funcionalidades disponíveis</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((feature) => {
            const info = FEATURE_LABELS[feature];
            const isEnabled = state.enabledFeatures.includes(feature);
            const isAdminOnly = feature.includes("tracking") || feature.includes("ai_") || feature === "automations";

            return (
              <Card
                key={feature}
                className={`cursor-pointer transition-colors ${
                  isEnabled
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/50 bg-muted/30"
                }`}
                onClick={() => isOwner && !saving && toggleFeature(feature)}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{info.name}</p>
                      {isAdminOnly && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1">
                          Admin
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{info.description}</p>
                  </div>
                  <div className="shrink-0">
                    {isEnabled ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-primary">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    ) : (
                      <div className="h-5 w-5 rounded border border-border bg-background" />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {!isOwner && (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>Apenas o proprietário da conta pode gerenciar acessos</p>
        </div>
      )}

      {saving && (
        <div className="flex gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-600">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
          <p>Salvando alterações...</p>
        </div>
      )}
    </section>
  );
}
