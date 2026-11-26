"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCan } from "@/hooks/use-can";

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

/** Configuração do envio das vendas (Purchase) e desqualificações para a Meta e o Google Ads. */
export function ConversionSettings() {
  const canEdit = useCan("edit-settings");
  const [settings, setSettings] = useState(INITIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/lead-tracking/settings", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (response.ok && body.settings) setSettings((current) => ({ ...current, ...body.settings }));
      })
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
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
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
      <section className="rounded-2xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Conversões dos anúncios</h2>
          <p className="text-xs text-muted-foreground">
            Quando uma venda é marcada como Ganha no CRM, o lead vira Cliente e a
            compra (Purchase, com o valor da venda) é enviada para a Meta e o
            Google Ads. Venda Perdida envia Desqualificado.
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
      <Input value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="mt-1" placeholder={placeholder} />
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
