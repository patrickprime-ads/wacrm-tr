"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Bot, CheckCircle2, FlaskConical, KeyRound, Loader2, PlugZap, Save, Webhook } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCan } from "@/hooks/use-can";

type FormState = {
  provider: string;
  base_url: string;
  api_key: string;
  default_model: string;
  webhook_url: string;
  webhook_secret: string;
  is_active: boolean;
  has_api_key: boolean;
  has_webhook_secret: boolean;
};

const INITIAL: FormState = {
  provider: "openai",
  base_url: "https://api.openai.com/v1",
  api_key: "",
  default_model: "gpt-5.6-luna",
  webhook_url: "",
  webhook_secret: "",
  is_active: false,
  has_api_key: false,
  has_webhook_secret: false,
};

export default function IntegrationsPage() {
  const canEdit = useCan("edit-settings");
  const [form, setForm] = useState<FormState>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"ai" | "webhook" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai/integration", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar a integração");
        return body;
      })
      .then(({ integration }) => {
        if (integration) setForm((current) => ({ ...current, ...integration }));
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Não foi possível carregar a integração";
        setLoadError(message);
        toast.error(message);
      })
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function save({ quiet = false }: { quiet?: boolean } = {}) {
    setSaving(true);
    try {
      const response = await fetch("/api/ai/integration", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao salvar");
        return false;
      }
      setForm((current) => ({
        ...current,
        api_key: "",
        webhook_secret: "",
        has_api_key: current.has_api_key || !!current.api_key,
        has_webhook_secret: current.has_webhook_secret || !!current.webhook_secret,
      }));
      setLoadError(null);
      if (!quiet) toast.success("Integração salva com segurança");
      return true;
    } catch {
      toast.error("Falha de conexão ao salvar a integração");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function test(kind: "ai" | "webhook") {
    setTesting(kind);
    try {
      const saved = await save({ quiet: true });
      if (!saved) return;
      const response = await fetch("/api/ai/integration/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(body.error ?? "O teste falhou");
      toast.success(kind === "ai" ? `IA respondeu em ${body.latency_ms} ms` : `Webhook respondeu HTTP ${body.status}`);
    } catch {
      toast.error("Falha de conexão durante o teste");
    } finally {
      setTesting(null);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><PlugZap className="h-3.5 w-3.5" /> Integrações</div>
        <h1 className="text-2xl font-bold tracking-tight">IA e Webhooks</h1>
        <p className="mt-1 text-sm text-muted-foreground">Conecte o motor de IA e envie eventos do CRM para outras ferramentas.</p>
      </div>

      {!canEdit && (
        <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Somente proprietários e administradores podem alterar ou testar integrações.
        </div>
      )}
      {loadError && (
        <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><strong>Não foi possível carregar as integrações.</strong><p className="mt-1 text-xs opacity-90">{loadError}</p></div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary"><Bot className="h-5 w-5" /></span><div><h2 className="font-semibold">Provedor de IA</h2><p className="text-xs text-muted-foreground">Compatível com OpenAI e endpoints personalizados.</p></div></div>
            <Switch checked={form.is_active} onCheckedChange={(value) => set("is_active", value)} disabled={!canEdit} aria-label="Ativar integração" />
          </div>
          <div className="mt-5 space-y-4">
            <div><Label htmlFor="provider">Provedor</Label><select id="provider" value={form.provider} onChange={(event) => set("provider", event.target.value)} disabled={!canEdit} className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="google">Google Gemini</option><option value="custom">API compatível / personalizada</option></select></div>
            <div><Label htmlFor="base-url">Endpoint da API</Label><Input id="base-url" value={form.base_url ?? ""} onChange={(event) => set("base_url", event.target.value)} disabled={!canEdit} placeholder="https://api.openai.com/v1" className="mt-1.5" /></div>
            <div><Label htmlFor="model">Modelo padrão</Label><Input id="model" value={form.default_model} onChange={(event) => set("default_model", event.target.value)} disabled={!canEdit} placeholder="gpt-5.6-luna" className="mt-1.5" /></div>
            <div><Label htmlFor="api-key">Chave da API</Label><div className="relative mt-1.5"><KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="api-key" type="password" value={form.api_key} onChange={(event) => set("api_key", event.target.value)} disabled={!canEdit} placeholder={form.has_api_key ? "Chave salva ••••••••" : "Cole sua chave secreta"} className="pl-9" /></div>{form.has_api_key && <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Chave criptografada e armazenada</p>}</div>
            <Button type="button" variant="outline" onClick={() => test("ai")} disabled={!canEdit || (!form.has_api_key && !form.api_key.trim()) || testing !== null || saving} className="w-full"><FlaskConical className="h-4 w-4" />{testing === "ai" ? "Salvando e testando..." : "Salvar e testar provedor de IA"}</Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400"><Webhook className="h-5 w-5" /></span><div><h2 className="font-semibold">Webhook de saída</h2><p className="text-xs text-muted-foreground">Receba eventos de leads, negócios e agentes.</p></div></div>
          <div className="mt-5 space-y-4">
            <div><Label htmlFor="webhook-url">URL de destino</Label><Input id="webhook-url" value={form.webhook_url ?? ""} onChange={(event) => set("webhook_url", event.target.value)} disabled={!canEdit} placeholder="https://seu-sistema.com/webhooks/crm" className="mt-1.5" /></div>
            <div><Label htmlFor="webhook-secret">Segredo de assinatura</Label><Input id="webhook-secret" type="password" value={form.webhook_secret} onChange={(event) => set("webhook_secret", event.target.value)} disabled={!canEdit} placeholder={form.has_webhook_secret ? "Segredo salvo ••••••••" : "Crie um segredo forte"} className="mt-1.5" /></div>
            <div className="rounded-xl border border-border bg-muted/35 p-4 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Eventos disponíveis</strong><br />lead.created · lead.updated · deal.stage_changed · agent.response</div>
            <Button type="button" variant="outline" onClick={() => test("webhook")} disabled={!canEdit || !form.webhook_url || testing !== null || saving} className="w-full"><FlaskConical className="h-4 w-4" />{testing === "webhook" ? "Salvando e enviando..." : "Salvar e testar webhook"}</Button>
          </div>
        </section>
      </div>

      <div className="flex justify-end"><Button onClick={() => void save()} disabled={!canEdit || saving || testing !== null}><Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar integrações"}</Button></div>
    </div>
  );
}
