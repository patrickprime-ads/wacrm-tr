"use client";

import Link from "next/link";
import { MessageCircle, QrCode, Settings2, ShieldCheck } from "lucide-react";
import { EvolutionConfig } from "@/components/settings/evolution-config";

export default function WhatsAppBusinessPage() {
  return <div className="space-y-6">
    <div><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-emerald-400"><MessageCircle className="h-4 w-4" /> Canal WhatsApp</div><h1 className="text-2xl font-bold">WhatsApp Business</h1><p className="mt-1 text-sm text-muted-foreground">Conecte o aplicativo por QR Code e acompanhe o estado da sessão.</p></div>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="relative rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5"><span className="absolute right-4 top-4 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">Mais usado</span><QrCode className="h-6 w-6 text-emerald-400" /><h2 className="mt-4 font-semibold">WhatsApp Business por QR Code</h2><p className="mt-1 text-sm text-muted-foreground">Use sua Evolution API com o aplicativo instalado no celular.</p></div>
      <div className="rounded-2xl border bg-card p-5"><ShieldCheck className="h-6 w-6 text-primary" /><h2 className="mt-4 font-semibold">API oficial da Meta</h2><p className="mt-1 text-sm text-muted-foreground">As credenciais técnicas da Cloud API ficam organizadas em Configurações.</p><Link className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted" href="/settings?tab=whatsapp&provider=meta"><Settings2 className="h-4 w-4" /> Abrir configurações</Link></div>
    </section>

    <EvolutionConfig />
  </div>;
}
