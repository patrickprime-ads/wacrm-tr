"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2, Cloud, Copy, ExternalLink, Globe2, MessageCircle, Server } from "lucide-react";
import { toast } from "sonner";
import { WhatsAppConfig } from "@/components/settings/whatsapp-config";
import { Button } from "@/components/ui/button";

export default function WhatsAppBusinessPage() {
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const isLocal = /localhost|127\.0\.0\.1/.test(origin);
  const webhook = origin ? `${origin}/api/whatsapp/webhook` : "/api/whatsapp/webhook";
  async function copy() { await navigator.clipboard.writeText(webhook); toast.success("URL do webhook copiada"); }
  return <div className="space-y-6"><div><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-emerald-400"><MessageCircle className="h-4 w-4"/> Canal oficial</div><h1 className="text-2xl font-bold">WhatsApp Business</h1><p className="mt-1 text-sm text-muted-foreground">Conecte a API oficial da Meta para receber, responder e automatizar conversas.</p></div>
    <section className={`rounded-2xl border p-5 ${isLocal ? "border-amber-500/30 bg-amber-500/8" : "border-emerald-500/30 bg-emerald-500/8"}`}><div className="flex items-start gap-3">{isLocal ? <Server className="mt-0.5 h-5 w-5 text-amber-400"/> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400"/>}<div className="min-w-0 flex-1"><h2 className="font-semibold">{isLocal ? "Você está usando localhost" : "Domínio público detectado"}</h2><p className="mt-1 text-sm text-muted-foreground">{isLocal ? "A Meta não consegue enviar mensagens para localhost. Publique o CRM ou use um túnel HTTPS durante os testes." : "Esta URL HTTPS pode ser cadastrada como Callback URL no painel da Meta."}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><code className="min-w-0 flex-1 truncate rounded-lg border bg-background px-3 py-2 text-xs">{webhook}</code><Button variant="outline" size="sm" onClick={copy}><Copy className="h-4 w-4"/> Copiar</Button></div></div></div></section>
    {isLocal && <section className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border bg-card p-5"><Cloud className="h-5 w-5 text-primary"/><h2 className="mt-3 font-semibold">Opção definitiva: publicar</h2><p className="mt-1 text-sm text-muted-foreground">Hospede na Vercel, Hostinger ou outro servidor e conecte um domínio. Você receberá uma URL HTTPS estável para a Meta.</p></div><div className="rounded-2xl border bg-card p-5"><Globe2 className="h-5 w-5 text-cyan-400"/><h2 className="mt-3 font-semibold">Opção de teste: túnel HTTPS</h2><p className="mt-1 text-sm text-muted-foreground">Cloudflare Tunnel ou ngrok cria uma URL pública temporária apontando para seu <code>localhost:3000</code>.</p><a className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline" href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/" target="_blank" rel="noreferrer">Abrir instruções <ExternalLink className="h-3.5 w-3.5"/></a></div></section>}
    <WhatsAppConfig />
  </div>;
}
