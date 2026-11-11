/**
 * Origem do lead para etiquetas e cartão "De onde veio" (Prime, 11/11/2026).
 * Junta o que o WhatsApp manda (anúncio clique-para-WhatsApp) com o que o painel de rastreio repassa
 * (campanha, Google Ads, site, link rastreado).
 */
type ContatoOrigem = {
  lead_source?: string | null;
  source_detail?: string | null;
  source_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  click_id?: string | null;
};

export type Origem = { rotulo: string; classe: string; anuncio: boolean; tipo: string; classeTipo: string };

const CLASSES = {
  facebook: "bg-blue-500/15 text-blue-400",
  instagram: "bg-pink-500/15 text-pink-400",
  google: "bg-amber-500/15 text-amber-500",
  site: "bg-sky-500/15 text-sky-400",
  neutro: "bg-muted text-muted-foreground",
};

/** Origem do lead em duas etiquetas: tipo (Anúncio / Orgânico) e rede (Facebook, Instagram, Google, Site, WhatsApp). */
export function origemDoLead(c: ContatoOrigem | null | undefined): Origem | null {
  if (!c) return null;
  const tudo = [c.lead_source, c.utm_source, c.utm_medium, c.source_url, c.source_detail].filter(Boolean).join(" ").toLowerCase();
  const pago = c.lead_source === "meta_ads" || c.lead_source === "google_ads" || /paid|cpc|ads/.test(String(c.utm_medium || ""));
  const tipo = pago ? { tipo: "Anúncio", classeTipo: "bg-emerald-500/15 text-emerald-500", anuncio: true } : { tipo: "Orgânico", classeTipo: "bg-muted text-muted-foreground", anuncio: false };
  if (c.lead_source === "google_ads" || /google|gclid/.test(tudo)) return { rotulo: "Google", classe: CLASSES.google, ...tipo };
  if (/instagram|\big\b/.test(tudo)) return { rotulo: "Instagram", classe: CLASSES.instagram, ...tipo };
  if (c.lead_source === "meta_ads" || /facebook|fb\.me|\bfb\b|\bmeta\b/.test(tudo)) return { rotulo: "Facebook", classe: CLASSES.facebook, ...tipo };
  if (/site|landing|organic_search|seo/.test(tudo)) return { rotulo: "Site", classe: CLASSES.site, ...tipo };
  return { rotulo: "WhatsApp", classe: CLASSES.neutro, ...tipo };
}

/** Nome do anúncio/campanha para mostrar junto da origem. */
export function detalheDoAnuncio(c: ContatoOrigem | null | undefined) {
  if (!c) return { campanha: null as string | null, anuncio: null as string | null, link: null as string | null };
  const anuncio = c.utm_content || (c.source_detail && c.source_detail !== "WhatsApp Business" ? c.source_detail : null);
  const link = c.source_url && /^https:\/\//.test(c.source_url) ? c.source_url : null;
  return { campanha: c.utm_campaign || null, anuncio, link };
}
