"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2, Copy, ExternalLink, MessageCircle, QrCode, Server, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { WhatsAppConfig } from "@/components/settings/whatsapp-config";
import { Button } from "@/components/ui/button";

export default function WhatsAppBusinessPage() {
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const isLocal = /localhost|127\.0\.0\.1/.test(origin);
  const webhook = origin ? `${origin}/api/whatsapp/webhook` : "/api/whatsapp/webhook";
  async function copy() { await navigator.clipboard.writeText(webhook); toast.success("URL do webhook copiada"); }

  return <div className="space-y-6">
    <div><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-emerald-400"><MessageCircle className="h-4 w-4" /> Canal WhatsApp</div><h1 className="text-2xl font-bold">Conectar WhatsApp Business</h1><p className="mt-1 text-sm text-muted-foreground">Use o WhatsApp Business do celular ou conecte diretamente pela API oficial da Meta.</p></div>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="relative rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5">
        <span className="absolute right-4 top-4 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">Recomendado</span>
        <QrCode className="h-6 w-6 text-emerald-400" /><h2 className="mt-4 font-semibold">WhatsApp Business no celular</h2>
        <p className="mt-1 text-sm text-muted-foreground">Mantenha o mesmo número no aplicativo e no CRM usando o fluxo oficial de coexistência da Meta. Quando a conta for elegível, a própria Meta exibirá o QR Code durante a conexão.</p>
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-background/40 p-3 text-xs text-muted-foreground">Esta conexão precisa do App ID e do Cadastro Incorporado da Meta. O QR não é gerado pelo CRM e ficará disponível depois que o aplicativo Meta for configurado e aprovado.</div>
        <a className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-medium text-black hover:bg-emerald-400" href="https://www.facebook.com/business/help/" target="_blank" rel="noreferrer">Preparar conta na Meta <ExternalLink className="h-4 w-4" /></a>
      </div>
      <div className="rounded-2xl border bg-card p-5"><ShieldCheck className="h-6 w-6 text-primary" /><h2 className="mt-4 font-semibold">API oficial da Meta</h2><p className="mt-1 text-sm text-muted-foreground">Para empresas que já possuem WhatsApp Cloud API, número de telefone, conta WABA e token permanente.</p><Button className="mt-4" variant="outline" onClick={() => document.getElementById("api-oficial")?.scrollIntoView({ behavior: "smooth" })}>Configurar API oficial</Button></div>
    </section>

    <section className={`rounded-2xl border p-5 ${isLocal ? "border-amber-500/30 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}><div className="flex items-start gap-3">{isLocal ? <Server className="mt-0.5 h-5 w-5 text-amber-400" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />}<div className="min-w-0 flex-1"><h2 className="font-semibold">{isLocal ? "Você está usando localhost" : "Domínio público detectado"}</h2><p className="mt-1 text-sm text-muted-foreground">{isLocal ? "A Meta não consegue enviar mensagens para localhost. Publique o CRM para testar." : "Esta URL HTTPS pode ser cadastrada como URL de retorno no painel da Meta."}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><code className="min-w-0 flex-1 truncate rounded-lg border bg-background px-3 py-2 text-xs">{webhook}</code><Button variant="outline" size="sm" onClick={copy}><Copy className="h-4 w-4" /> Copiar</Button></div></div></div></section>
    <div id="api-oficial" className="scroll-mt-6"><WhatsAppConfig /></div>
  </div>;
}
