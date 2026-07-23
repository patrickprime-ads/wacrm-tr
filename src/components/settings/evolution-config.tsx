"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, LogOut, QrCode, RefreshCw, Save, Server } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EvolutionStatus = { configured: boolean; server_url?: string; instance_name?: string; state: string; webhook_configured?: boolean; warning?: string; error?: string };

export function EvolutionConfig() {
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [instanceName, setInstanceName] = useState("wacrm");
  const [configured, setConfigured] = useState(false);
  const [state, setState] = useState("disconnected");
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadStatus = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/evolution/config", { cache: "no-store" });
      const data = await response.json() as EvolutionStatus;
      if (!response.ok) throw new Error(data.error || "Falha ao consultar a Evolution");
      setConfigured(data.configured);
      setState(data.state || "disconnected");
      setWebhookConfigured(data.webhook_configured === true);
      if (data.server_url) setServerUrl(data.server_url);
      if (data.instance_name) setInstanceName(data.instance_name);
      if (data.state === "open") { setQr(null); setPairingCode(null); }
      if (!quiet && data.warning) toast.warning(data.warning);
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : "Falha ao consultar a Evolution");
    }
  }, []);

  useEffect(() => { void loadStatus(true); }, [loadStatus]);
  useEffect(() => {
    if (!qr || state === "open") return;
    const timer = window.setInterval(() => void loadStatus(true), 5000);
    return () => window.clearInterval(timer);
  }, [qr, state, loadStatus]);

  async function action(actionName: "save" | "connect" | "logout" | "sync") {
    setBusy(actionName);
    try {
      const body = actionName === "save"
        ? { action: "save", server_url: serverUrl, api_key: apiKey, instance_name: instanceName }
        : { action: actionName };
      const response = await fetch("/api/evolution/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { error?: string; base64?: string | null; code?: string | null };
      if (!response.ok) throw new Error(data.error || "A Evolution recusou a solicitação");
      if (actionName === "save") { setConfigured(true); setApiKey(""); toast.success("Configuração da Evolution salva"); }
      if (actionName === "connect") {
        setQr(data.base64 || null); setPairingCode(data.code || null);
        if (!data.base64 && !data.code) toast.info("Instância criada. Clique em atualizar QR se ele não aparecer.");
      }
      if (actionName === "logout") { setState("disconnected"); setQr(null); toast.success("WhatsApp desconectado"); }
      if (actionName === "sync") { setWebhookConfigured(true); toast.success("Caixa de Entrada sincronizada com a Evolution"); }
      await loadStatus(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha na Evolution API"); }
    finally { setBusy(null); }
  }

  const connected = state === "open";
  return (
    <Card className="border-emerald-500/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-emerald-400" /> WhatsApp Business por QR Code</CardTitle><CardDescription className="mt-1">Conexão pelo aplicativo do celular usando sua Evolution API.</CardDescription></div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${connected ? "bg-emerald-500/15 text-emerald-300" : "bg-muted text-muted-foreground"}`}>{connected ? "Conectado" : "Desconectado"}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>URL pública da Evolution</Label><Input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://evolution.seudominio.com" /></div>
          <div className="space-y-2"><Label>Nome da instância</Label><Input value={instanceName} onChange={(e) => setInstanceName(e.target.value)} placeholder="cliente_empresa" /></div>
          <div className="space-y-2 md:col-span-2"><Label>Chave global da Evolution API</Label><Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={configured ? "Deixe vazio para manter a chave salva" : "Cole a apikey"} /><p className="text-xs text-muted-foreground">A chave é criptografada antes de ser armazenada e nunca aparece no navegador.</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void action("save")} disabled={busy !== null}><Save className="h-4 w-4" /> {busy === "save" ? "Salvando..." : "Salvar Evolution"}</Button>
          <Button variant="outline" onClick={() => void action("connect")} disabled={!configured || connected || busy !== null}>{busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} Gerar QR Code</Button>
          <Button variant="outline" onClick={() => void loadStatus()} disabled={!configured || busy !== null}><RefreshCw className="h-4 w-4" /> Atualizar status</Button>
          {connected && <Button variant="outline" onClick={() => void action("logout")} disabled={busy !== null} className="text-red-400"><LogOut className="h-4 w-4" /> Desconectar</Button>}
          {connected && <Button variant="outline" onClick={() => void action("sync")} disabled={busy !== null}><RefreshCw className="h-4 w-4" /> Sincronizar Caixa de Entrada</Button>}
        </div>
        {(qr || pairingCode) && !connected && <div className="rounded-2xl border border-emerald-500/30 bg-background p-5 text-center"><p className="mb-4 text-sm font-medium">No celular: WhatsApp Business → Aparelhos conectados → Conectar aparelho</p>{qr && <Image src={qr} alt="QR Code para conectar o WhatsApp Business" width={280} height={280} unoptimized className="mx-auto rounded-xl bg-white p-3" />}{pairingCode && <div className="mt-3"><p className="text-xs text-muted-foreground">Código de pareamento</p><code className="text-xl font-bold tracking-widest">{pairingCode}</code></div>}<p className="mt-4 text-xs text-muted-foreground">O status é atualizado automaticamente a cada 5 segundos.</p></div>}
        {!configured && <div className="flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground"><Server className="h-4 w-4 shrink-0 text-amber-400" /> Informe a URL HTTPS, a chave e um nome de instância. Salve antes de gerar o QR.</div>}
        {connected && <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" /> WhatsApp Business conectado à instância {instanceName}.</div>}
        {connected && <div className={`rounded-xl border p-3 text-sm ${webhookConfigured ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300"}`}>{webhookConfigured ? "Webhook da Caixa de Entrada ativo" : "Webhook não confirmado. Clique em Sincronizar Caixa de Entrada."}</div>}
      </CardContent>
    </Card>
  );
}
