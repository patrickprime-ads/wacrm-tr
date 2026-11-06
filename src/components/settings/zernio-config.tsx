"use client";

import { useEffect, useState } from "react";
import { Camera, MessageCircle, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Channel = { zernio_account_id: string; platform: string; username?: string; display_name?: string; is_active: boolean };

export function ZernioConfig() {
  const [apiKey, setApiKey] = useState("");
  const [profileId, setProfileId] = useState("");
  const [configured, setConfigured] = useState(false);
  const [webhook, setWebhook] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch("/api/zernio/config", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setConfigured(body.configured); setWebhook(body.webhookConfigured); setChannels(body.channels || []); setProfileId(body.profileId || "");
  };
  useEffect(() => { void load().catch(error => toast.error(error.message)); }, []);

  const action = async (name: "save" | "sync") => {
    setBusy(name);
    try {
      const response = await fetch("/api/zernio/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, apiKey, profileId }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      if (name === "save") { setApiKey(""); toast.success(`${body.channels} canal(is) conectado(s) e webhook configurado`); await load(); }
      else toast.success(`${body.imported} conversa(s) sincronizada(s)`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha na Zernio"); }
    finally { setBusy(null); }
  };

  return <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-400" />Zernio — canais oficiais</CardTitle><CardDescription className="mt-1">WhatsApp oficial, Instagram Direct e Messenger em uma conexão estável.</CardDescription></div><span className={`rounded-full px-2 py-1 text-xs ${configured ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>{configured ? "Conectado" : "Não configurado"}</span></div></CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>API Key da Zernio</Label><Input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={configured ? "Deixe vazio para manter a chave atual" : "sk_..."} /><p className="text-xs text-muted-foreground">A chave será criptografada antes de ser salva.</p></div><div className="space-y-2"><Label>Profile ID (opcional)</Label><Input value={profileId} onChange={event => setProfileId(event.target.value)} placeholder="Detectado automaticamente" /></div></div>
      <div className="flex flex-wrap gap-2"><Button onClick={() => void action("save")} disabled={!!busy}><Save className="h-4 w-4" />{busy === "save" ? "Conectando..." : "Conectar e descobrir canais"}</Button><Button variant="outline" onClick={() => void action("sync")} disabled={!configured || !!busy}><RefreshCw className={`h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />Sincronizar conversas</Button></div>
      {configured && <div className="rounded-xl border p-4"><div className="mb-3 flex items-center justify-between"><strong className="text-sm">Canais encontrados</strong><span className="text-xs text-muted-foreground">Webhook {webhook ? "ativo" : "pendente"}</span></div><div className="grid gap-2 md:grid-cols-2">{channels.map(channel => <div key={channel.zernio_account_id} className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">{channel.platform === "instagram" ? <Camera className="h-5 w-5 text-pink-400" /> : <MessageCircle className="h-5 w-5 text-emerald-400" />}<div><strong className="block text-sm">{channel.display_name || channel.username || channel.platform}</strong><span className="text-xs capitalize text-muted-foreground">{channel.platform === "facebook" ? "Messenger" : channel.platform}</span></div></div>)}</div></div>}
    </CardContent>
  </Card>;
}
