"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  CircleHelp,
  Loader2,
  MousePointerClick,
  Save,
  Target,
  UserRoundCheck,
  UserRoundX,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  conversion_value: number | null;
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
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [closingLeadId, setClosingLeadId] = useState<string | null>(null);
  const [closingValue, setClosingValue] = useState("");

  useEffect(() => {
    Promise.all([
      createClient()
        .from("contacts")
        .select(
          "id,name,phone,lead_source,source_detail,utm_campaign,conversion_status,conversion_value,created_at",
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

  async function convert(contactId: string, status: string, value?: number) {
    setUpdatingLeadId(contactId);
    try {
      const response = await fetch("/api/lead-tracking/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, status, value }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao registrar conversão");
        return;
      }
      setLeads((items) =>
        items.map((item) =>
          item.id === contactId
            ? {
                ...item,
                conversion_status: status,
                conversion_value: status === "customer" ? value ?? 0 : null,
              }
            : item,
        ),
      );
      const destinations = [
        body.meta === "sent" ? "Meta" : null,
        body.google === "sent" ? "Google Ads" : null,
      ].filter(Boolean);
      toast.success(
        destinations.length
          ? `Conversão enviada para ${destinations.join(" e ")}`
          : "Classificação salva no CRM",
      );
      if (body.meta === "failed" || body.google === "failed") {
        toast.warning("Uma integração recusou a conversão. Confira as credenciais.");
      }
    } finally {
      setUpdatingLeadId(null);
    }
  }

  function openCustomerValue(lead: Lead) {
    setClosingLeadId(lead.id);
    setClosingValue(
      lead.conversion_value ? String(lead.conversion_value).replace(".", ",") : "",
    );
  }

  function confirmCustomer() {
    if (!closingLeadId) return;
    const value = Number(closingValue.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe o valor do fechamento");
      return;
    }
    const contactId = closingLeadId;
    setClosingLeadId(null);
    void convert(contactId, "customer", value);
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

      <div className="space-y-5">
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Classificação dos leads</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Identifique rapidamente a qualidade de cada contato.
          </p>
          <div className="mt-3 divide-y divide-border">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="flex flex-col gap-3 py-3 xl:flex-row xl:items-center xl:justify-between"
              >
                <div className="min-w-0 xl:max-w-[42%]">
                  <p className="truncate text-sm font-medium">
                    {lead.name &&
                    !["você", "you"].includes(lead.name.toLowerCase())
                      ? lead.name
                      : lead.phone}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {lead.phone}
                    {" · "}
                    {LABELS[lead.lead_source] || lead.lead_source}
                    {" · "}
                    {lead.source_detail || lead.utm_campaign || "Sem campanha"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2" aria-label="Classificação do lead">
                  <LeadStatusButton
                    label="Desqualificado"
                    icon={UserRoundX}
                    active={lead.conversion_status === "lost"}
                    tone="red"
                    disabled={updatingLeadId === lead.id}
                    onClick={() => void convert(lead.id, "lost")}
                  />
                  <LeadStatusButton
                    label="Curioso"
                    icon={CircleHelp}
                    active={lead.conversion_status === "lead"}
                    tone="amber"
                    disabled={updatingLeadId === lead.id}
                    onClick={() => void convert(lead.id, "lead")}
                  />
                  <LeadStatusButton
                    label="Qualificado"
                    icon={BadgeCheck}
                    active={["qualified_lead", "opportunity"].includes(
                      lead.conversion_status,
                    )}
                    tone="blue"
                    disabled={updatingLeadId === lead.id}
                    onClick={() => void convert(lead.id, "qualified_lead")}
                  />
                  <LeadStatusButton
                    label="Cliente"
                    icon={UserRoundCheck}
                    active={lead.conversion_status === "customer"}
                    tone="green"
                    disabled={updatingLeadId === lead.id}
                    onClick={() => openCustomerValue(lead)}
                  />
                  {lead.conversion_status === "customer" && lead.conversion_value ? (
                    <span className="inline-flex h-8 items-center rounded-full bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-300">
                      Fechado em {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(lead.conversion_value)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

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
              <Label>Mapeamento automático</Label>
              <div className="mt-1 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                Desqualificado → DisqualifiedLead · Qualificado → QualifiedLead · Cliente → Purchase
              </div>
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

      <Dialog open={closingLeadId !== null} onOpenChange={(open) => !open && setClosingLeadId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Valor do fechamento</DialogTitle>
            <DialogDescription>
              Informe quanto esse cliente comprou. O valor será registrado no CRM e enviado à Meta.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="closing-value">Valor em reais</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <Input
                id="closing-value"
                inputMode="decimal"
                autoFocus
                value={closingValue}
                onChange={(event) => setClosingValue(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && confirmCustomer()}
                className="pl-10"
                placeholder="0,00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosingLeadId(null)}>Cancelar</Button>
            <Button onClick={confirmCustomer}>Confirmar cliente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeadStatusButton({
  label,
  icon: Icon,
  active,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Target;
  active: boolean;
  tone: "red" | "amber" | "blue" | "green";
  disabled: boolean;
  onClick: () => void;
}) {
  const activeStyles = {
    red: "border-red-500/60 bg-red-500/15 text-red-300",
    amber: "border-amber-500/60 bg-amber-500/15 text-amber-300",
    blue: "border-blue-500/60 bg-blue-500/15 text-blue-300",
    green: "border-emerald-500/60 bg-emerald-500/15 text-emerald-300",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${
        active
          ? activeStyles
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {disabled ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
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
