"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { QrCode, ShieldCheck } from "lucide-react";
import { EvolutionConfig } from "./evolution-config";
import { WhatsAppConfig } from "./whatsapp-config";

export function WhatsAppSettingsHub() {
  const params = useSearchParams();
  const [provider, setProvider] = useState<"evolution" | "meta">(params.get("provider") === "meta" ? "meta" : "evolution");
  return <section className="space-y-5">
    <div><h2 className="text-xl font-semibold">Canais do WhatsApp</h2><p className="mt-1 text-sm text-muted-foreground">Escolha como esta conta se conecta ao WhatsApp.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={() => setProvider("evolution")} className={`rounded-xl border p-4 text-left transition-colors ${provider === "evolution" ? "border-emerald-500/50 bg-emerald-500/10" : "bg-card hover:bg-muted/50"}`}><QrCode className="h-5 w-5 text-emerald-400" /><strong className="mt-2 block text-sm">WhatsApp Business</strong><span className="text-xs text-muted-foreground">QR Code pela Evolution API</span></button>
      <button type="button" onClick={() => setProvider("meta")} className={`rounded-xl border p-4 text-left transition-colors ${provider === "meta" ? "border-primary/50 bg-primary/10" : "bg-card hover:bg-muted/50"}`}><ShieldCheck className="h-5 w-5 text-primary" /><strong className="mt-2 block text-sm">API oficial da Meta</strong><span className="text-xs text-muted-foreground">Cloud API, WABA e token permanente</span></button>
    </div>
    {provider === "evolution" ? <EvolutionConfig /> : <WhatsAppConfig />}
  </section>;
}
