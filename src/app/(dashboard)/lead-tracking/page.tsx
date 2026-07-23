"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Loader2,
  MousePointerClick,
  Save,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { useCan } from "@/hooks/use-can";

type Lead = {
  id: string;
  name: string | null;
  phone: string;
  lead_source: string;
  source_detail: string | null;
  utm_campaign: string | null;
  conversion_status: string;
  created_at: string;
};

type Settings = {
  meta_enabled: boolean;
  meta_pixel_id: string;
  meta_token: string;
  has_meta_token: boolean;
  google_enabled: boolean;
  google_customer_id: string;
  google_conversion_action: string;
  google_token: string;
  has_google_token: boolean;
  conversion_event: string;
};

const INITIAL: Settings = {
  meta_enabled: false,
  meta_pixel_id: "",
  meta_token: "",
  has_meta_token: false,
  google_enabled: false,
  google_customer_id: "",
  google_conversion_action: "",
  google_token: "",
  has_google_token: false,
  conversion_event: "QualifiedLead",
};

const LABELS: Record<string, string> = {
  meta: "Meta Ads",
  meta_ads: "Meta Ads",
  google: "Google Ads",
  google_ads: "Google Ads",
  whatsapp: "WhatsApp",
  organico: "Orgânico",
  referral: "Indicação",
  indicacao: "Indicação",
  presencial: "Presencial",
  landing_page: "Landing page",
  manual: "Manual",
};

export default function LeadTrackingPage() {
  const canEdit = useCan("edit-settings");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [settings, setSettings] = useState(INITIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      createClient()
        .from("contacts")
        .select(
          "id,name,phone,lead_source,source_detail,utm_campaign,conversion_status,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      fetch("/api/lead-tracking/settings", { cache: "no-store" }).then(
        async (response) => ({
          ok: response.ok,
          body: await response.json().catch(() => ({})),
        }),
      ),
    ])
      .then(([contactResult, configResult]) => {
        if (contactResult.error) {
          toast.error("Não foi possível carregar os leads");
        } else {
          setLeads((contactResult.data ?? []) as Lead[]);
        }
        if (configResult.ok && configResult.body.settings) {
          setSettings((current) => ({
            ...current,
            ...configResult.body.settings,
          }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(
    () =>
      leads.reduce<Record<string, number>>((acc, lead) => {
        const source = lead.lead_source || "organico";
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {}),
    [leads],
  );
  const converted = leads.filter(
    (lead) => !["lead", "lost"].includes(lead.conversion_status),
  ).length;
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  async function convert(contactId: string, status: string) {
    const response = await fetch("/api/lead-tracking/convert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, status }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(body.error ?? "Falha ao registrar conversão");
      return;
    }
    setLeads((items) =>
      items.map((item) =>
        item.id === contactId ? { ...item, conversion_status: status } : item,
      ),
    );
    const destinations = [
      body.meta === "sent" ? "Meta" : null,
      body.google === "sent" ? "Google Ads" : null,
    ].filter(Boolean);
    toast.success(
      destinations.length
        ? `Conversão enviada para ${destinations.join(" e ")}`
        : "Conversão salva no CRM",
    );
    if (body.meta === "failed" || body.google === "failed") {
      toast.warning("Uma integração recusou a conversão. Confira as credenciais.");
    }
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/lead-tracking/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao salvar");
        return;
      }
      setSettings((current) => ({
        ...current,
        meta_token: "",
        google_token: "",
        has_meta_token: current.has_meta_token || !!current.meta_token,
        has_google_token: current.has_google_token || !!current.google_token,
      }));
      toast.success("Configurações de conversão salvas");
    } catch {
      toast.error("Falha de conexão");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-primary">
          <Target className="h-4 w-4" /> Aquisição
        </div>
        <h1 className="text-2xl font-bold">Tracking de Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Identifique a origem e envie as conversões registradas no CRM para
          suas campanhas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Leads rastreados" value={leads.length} icon={MousePointerClick} />
        <Metric label="Conversões no CRM" value={converted} icon={CheckCircle2} />
        <Metric
          label="Taxa de conversão"
          value={`${leads.length ? Math.round((converted / leads.length) * 100) : 0}%`}
          icon={BarChart3}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Origem dos leads</h2>
          <div className="mt-4 space-y-3">
            {Object.keys(grouped).length ? (
              Object.entries(grouped)
                .sort((a, b) => b[1] - a[1])
                .map(([source, count]) => (
                  <div key={source}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{LABELS[source] || source}</span>
                      <strong>{count}</strong>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.max(5, (count / leads.length) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Os novos leads aparecerão aqui com origem e campanha.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Últimos leads</h2>
          <div className="mt-3 divide-y divide-border">
            {leads.slice(0, 8).map((lead) => (
              <div
                key={lead.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {lead.name &&
                    !["você", "you"].includes(lead.name.toLowerCase())
                      ? lead.name
                      : lead.phone}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {LABELS[lead.lead_source] || lead.lead_source}
                    {" · "}
                    {lead.source_detail || lead.utm_campaign || "Sem campanha"}
                  </p>
                </div>
                <select
                  aria-label="Status da conversão"
                  value={lead.conversion_status}
                  onChange={(event) => void convert(lead.id, event.target.value)}
                  className="h-8 rounded-lg border bg-background px-2 text-xs"
                >
                  <option value="lead">Lead</option>
                  <option value="qualified_lead">Qualificado</option>
                  <option value="opportunity">Oportunidade</option>
                  <option value="customer">Cliente</option>
                  <option value="lost">Perdido</option>
                </select>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Enviar conversões aos anúncios</h2>
          <p className="text-xs text-muted-foreground">
            O CRM envia a conversão quando o status do lead muda para
            Qualificado, Oportunidade ou Cliente.
          </p>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex justify-between gap-3">
              <div>
                <strong>Meta Conversions API</strong>
                <p className="text-xs text-muted-foreground">
                  Dataset/Pixel, token da CAPI e evento enviado.
                </p>
              </div>
              <Switch
                checked={settings.meta_enabled}
                onCheckedChange={(value) => set("meta_enabled", value)}
                disabled={!canEdit}
              />
            </div>
            <Field
              label="ID do conjunto de dados ou Pixel"
              value={settings.meta_pixel_id}
              onChange={(value) => set("meta_pixel_id", value)}
              disabled={!canEdit}
              placeholder="123456789012345"
            />
            <div>
              <Label>Evento enviado</Label>
              <select
                value={settings.conversion_event}
                onChange={(event) => set("conversion_event", event.target.value)}
                disabled={!canEdit}
                className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-sm"
              >
                <option value="QualifiedLead">Lead qualificado</option>
                <option value="Lead">Lead</option>
                <option value="Contact">Contato</option>
                <option value="Purchase">Venda</option>
              </select>
            </div>
            <SecretField
              label="Token de acesso da Conversions API"
              value={settings.meta_token}
              onChange={(value) => set("meta_token", value)}
              saved={settings.has_meta_token}
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex justify-between gap-3">
              <div>
                <strong>Conversões do Google Ads</strong>
                <p className="text-xs text-muted-foreground">
                  Envio pelo Google Data Manager API para a ação escolhida.
                </p>
              </div>
              <Switch
                checked={settings.google_enabled}
                onCheckedChange={(value) => set("google_enabled", value)}
                disabled={!canEdit}
              />
            </div>
            <Field
              label="ID da conta do Google Ads"
              value={settings.google_customer_id}
              onChange={(value) => set("google_customer_id", value)}
              disabled={!canEdit}
              placeholder="1234567890"
            />
            <Field
              label="ID da ação de conversão"
              value={settings.google_conversion_action}
              onChange={(value) => set("google_conversion_action", value)}
              disabled={!canEdit}
              placeholder="987654321"
            />
            <SecretField
              label="Token OAuth com acesso ao Google Ads"
              value={settings.google_token}
              onChange={(value) => set("google_token", value)}
              saved={settings.has_google_token}
              disabled={!canEdit}
            />
            <p className="text-xs text-amber-400">
              A conta precisa ter uma ação de conversão para importação de
              cliques e o lead precisa chegar com GCLID.
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={save} disabled={!canEdit || saving}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar configurações"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Target;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1"
        placeholder={placeholder}
      />
    </div>
  );
}

function SecretField({
  label,
  value,
  onChange,
  saved,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  saved: boolean;
  disabled: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1"
        placeholder={saved ? "Token salvo ••••••••" : "Cole o token"}
      />
    </div>
  );
}
