"use client";

import { useState, useEffect } from "react";
import {
  Calendar,
  Download,
  Loader2,
  MessageCircle,
  Clock,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SettingsPanelHead } from "./settings-panel-head";
import type { DailyReportData } from "@/types/reports";
import { formatCurrency } from "@/lib/currency";

interface AutoReportConfig {
  enabled: boolean;
  schedule_time: string; // "HH:MM"
  recipient_phones: string[];
  days_of_week: number[]; // 0-6, where 0 is Sunday
}

export function ReportsTab() {
  const [reportData, setReportData] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Date range
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Auto-report config
  const [autoConfig, setAutoConfig] = useState<AutoReportConfig>({
    enabled: false,
    schedule_time: "08:00",
    recipient_phones: [],
    days_of_week: [1, 2, 3, 4, 5], // Mon-Fri
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  // Load initial config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch("/api/reports/auto-config");
        if (res.ok) {
          const data = await res.json();
          setAutoConfig(data);
        }
      } catch (err) {
        console.error("Failed to load auto-report config:", err);
      }
    };
    loadConfig();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports/daily-summary?start_date=${startDate}&end_date=${endDate}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar relatório");
    } finally {
      setLoading(false);
    }
  };

  const sendViaWhatsApp = async () => {
    if (!autoConfig.recipient_phones.length) {
      toast.error("Adicione pelo menos um número de telefone");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/reports/send-daily-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate,
          phone_numbers: autoConfig.recipient_phones,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const result = await res.json();
      toast.success(`Relatório enviado para ${result.sent_to.length} número(s)`);
      if (result.errors?.length) {
        toast.error(`Falha em ${result.errors.length} número(s)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSending(false);
    }
  };

  const saveAutoConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch("/api/reports/auto-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(autoConfig),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      toast.success("Configuração de relatório automático salva");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSavingConfig(false);
    }
  };

  const toggleDay = (day: number) => {
    setAutoConfig((prev) => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter((d) => d !== day)
        : [...prev.days_of_week, day].sort(),
    }));
  };

  const addPhone = () => {
    if (!newPhone.trim()) return;
    if (autoConfig.recipient_phones.includes(newPhone)) {
      toast.error("Número já adicionado");
      return;
    }
    setAutoConfig((prev) => ({
      ...prev,
      recipient_phones: [...prev.recipient_phones, newPhone],
    }));
    setNewPhone("");
  };

  const removePhone = (phone: string) => {
    setAutoConfig((prev) => ({
      ...prev,
      recipient_phones: prev.recipient_phones.filter((p) => p !== phone),
    }));
  };

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title="Relatórios de Vendas"
        description="Gere e envie resumos de vendas via WhatsApp"
      />

      {/* Gerador de Relatórios */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Gerar Relatório
          </CardTitle>
          <CardDescription>
            Selecione o período e veja os números de vendas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start-date">Data Inicial</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">Data Final</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={loadReport} disabled={loading} className="w-full">
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {loading ? "Gerando..." : "Gerar Relatório"}
          </Button>
        </CardContent>
      </Card>

      {/* Resultado do Relatório */}
      {reportData && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle>Resumo do Período</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Leads Entrada</p>
                <strong className="text-lg">{reportData.leads_in}</strong>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Vendas Fechadas</p>
                <strong className="text-lg">{reportData.deals_won}</strong>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Valor Fechado</p>
                <strong className="text-lg text-primary">
                  {formatCurrency(reportData.revenue)}
                </strong>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Taxa Conversão</p>
                <strong className="text-lg">
                  {(reportData.conversion_rate * 100).toFixed(1)}%
                </strong>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs font-semibold mb-2">Status dos Leads</p>
                <div className="space-y-1 text-sm">
                  <p>🆕 Novos: {reportData.lead_statuses.new}</p>
                  <p>🤝 Em negociação: {reportData.lead_statuses.negotiating}</p>
                  <p>❌ Perdidos: {reportData.lead_statuses.lost}</p>
                  <p>🚫 Sem retorno: {reportData.lead_statuses.no_return}</p>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs font-semibold mb-2">Top Consultoras</p>
                <div className="space-y-1 text-sm">
                  {reportData.consultants.slice(0, 3).map((c) => (
                    <p key={c.name}>
                      {c.name}: {c.leads} leads, {c.deals_won} vendas
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <Button
              onClick={sendViaWhatsApp}
              disabled={sending || !autoConfig.recipient_phones.length}
              className="w-full"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              {sending ? "Enviando..." : "Enviar via WhatsApp"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Configuração de Envio Automático */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Envio Automático Diário
          </CardTitle>
          <CardDescription>
            Configure para receber relatórios automaticamente via WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enabled Toggle */}
          <div className="flex items-center justify-between">
            <Label>Ativar Relatórios Automáticos</Label>
            <button
              onClick={() =>
                setAutoConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                autoConfig.enabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  autoConfig.enabled ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {autoConfig.enabled && (
            <>
              {/* Horário */}
              <div className="space-y-2">
                <Label htmlFor="schedule-time">Horário de Envio (HH:MM)</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={autoConfig.schedule_time}
                  onChange={(e) =>
                    setAutoConfig((prev) => ({
                      ...prev,
                      schedule_time: e.target.value,
                    }))
                  }
                />
              </div>

              {/* Dias da Semana */}
              <div className="space-y-2">
                <Label>Enviar em</Label>
                <div className="flex gap-2 flex-wrap">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map(
                    (day, idx) => (
                      <button
                        key={idx}
                        onClick={() => toggleDay(idx)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          autoConfig.days_of_week.includes(idx)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {day}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Números de Telefone */}
              <div className="space-y-2">
                <Label>Números para Receber Relatório</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: +5511987654321"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && addPhone()}
                  />
                  <Button onClick={addPhone} variant="outline" size="sm">
                    Adicionar
                  </Button>
                </div>

                {autoConfig.recipient_phones.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {autoConfig.recipient_phones.map((phone) => (
                      <Badge
                        key={phone}
                        variant="secondary"
                        className="cursor-pointer hover:bg-destructive/20"
                        onClick={() => removePhone(phone)}
                      >
                        {phone}
                        <span className="ml-1 text-xs">✕</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview */}
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-700">
                ⏰ Relatórios serão enviados todo dia{" "}
                {autoConfig.days_of_week.length === 7
                  ? "diariamente"
                  : autoConfig.days_of_week.length === 5 && autoConfig.days_of_week.includes(1)
                    ? "de segunda a sexta"
                    : `(${autoConfig.days_of_week.length} dias)`}{" "}
                às {autoConfig.schedule_time}
              </div>
            </>
          )}

          <Button
            onClick={saveAutoConfig}
            disabled={savingConfig}
            className="w-full"
          >
            <Save className="h-4 w-4 mr-2" />
            {savingConfig ? "Salvando..." : "Salvar Configuração"}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
