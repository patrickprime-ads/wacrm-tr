"use client";

import type { Deal, PipelineStage } from "@/types";
import { Calendar, Check, Clock3, GripVertical, Sparkles, X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

interface DealCardProps {
  deal: Deal;
  stage: PipelineStage | null;
  onEdit: (deal: Deal) => void;
  onHistory?: (deal: Deal) => void;
  isOverlay?: boolean;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function initials(name?: string, fallback?: string) {
  const source = (name || fallback || "?").trim();
  if (!source) return "?";
  return source.charAt(0).toUpperCase();
}

const leadLabels = {
  frio: { label: "Frio", className: "bg-sky-500/15 text-sky-300" },
  curioso: { label: "Curioso", className: "bg-amber-500/15 text-amber-300" },
  interessado: { label: "Interessado", className: "bg-blue-500/15 text-blue-300" },
  quente: { label: "Quente", className: "bg-orange-500/15 text-orange-300" },
  vendido: { label: "Vendido", className: "bg-emerald-500/15 text-emerald-300" },
  perdido: { label: "Perdido", className: "bg-red-500/15 text-red-300" },
} as const;

const originLabels: Record<string, string> = {
  meta_ads: "Meta",
  google_ads: "Google",
  referral: "Indicação",
  presencial: "Presencial",
  phone: "Ligação",
  active_base: "Base ativa",
  whatsapp: "WhatsApp",
  other: "Outros",
};

function nextAction(deal: Deal) {
  if (deal.status === "won") return "Confirmar dados e iniciar o pós-venda";
  if (deal.status === "lost") return "Registrar o motivo da perda";
  const temperature = deal.contact?.lead_temperature;
  if (temperature === "quente") return "Entrar em contato agora e tentar fechar";
  if (temperature === "interessado") return "Enviar proposta e combinar o próximo passo";
  if (temperature === "frio") return "Fazer uma pergunta curta para requalificar";
  return "Descobrir interesse e produto ideal";
}

export function DealCard({ deal, stage, onEdit, onHistory, isOverlay }: DealCardProps) {
  const savedContactName = deal.contact?.name?.trim();
  const contactLabel =
    savedContactName &&
    !["você", "you"].includes(savedContactName.toLowerCase())
      ? savedContactName
      : deal.contact?.phone || "Sem contato";
  const assigneeLabel = deal.assignee?.full_name || null;
  const leadTag = leadLabels[deal.contact?.lead_temperature ?? "frio"];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // `onClick` still fires after a non-drag tap because the PointerSensor
        // requires 5px movement before it counts as a drag.
        if (isOverlay) return;
        e.stopPropagation();
        onEdit(deal);
      }}
      onKeyDown={(event) => {
        if (!isOverlay && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onEdit(deal);
        }
      }}
      className={`group relative w-full cursor-grab rounded-xl border border-border/70 bg-card-2/80 py-3 pl-4 pr-3 text-left shadow-sm transition-all active:cursor-grabbing ${
        isOverlay
          ? "shadow-xl"
          : "hover:-translate-y-0.5 hover:border-border hover:bg-muted hover:shadow-lg"
      }`}
    >
      {/* 4px left accent bar using stage color */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: stage?.color ?? "#94a3b8" }}
      />

      <div className="flex items-start justify-between gap-2">
        <h4 className="flex-1 text-sm font-semibold leading-snug text-foreground break-words">
          {deal.title}
        </h4>
        {deal.status === "open" && (
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
        )}
        {deal.status === "won" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Check className="h-3 w-3" />
            Ganho
          </span>
        )}
        {deal.status === "lost" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            <X className="h-3 w-3" />
            Perdido
          </span>
        )}
      </div>

      {/* Contact row */}
      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
          {initials(deal.contact?.name, deal.contact?.phone)}
        </span>
        <span className="truncate text-xs text-muted-foreground">{contactLabel}</span>
        <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${leadTag.className}`}>
          {leadTag.label}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {deal.contact?.lead_source && (
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
            Origem: {originLabels[deal.contact.lead_source] || deal.contact.lead_source}
          </span>
        )}
        {deal.contact?.response_time_bucket && (
          <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
            Resposta: {deal.contact.response_time_bucket}
          </span>
        )}
        {deal.selected_products?.slice(0, 2).map((product) => (
          <span key={product} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {product}
          </span>
        ))}
      {(deal.selected_products?.length ?? 0) > 2 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            +{(deal.selected_products?.length ?? 0) - 2}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-primary/5 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
        <span><strong className="text-primary">Próxima ação:</strong> {nextAction(deal)}</span>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-bold text-primary">
          {formatCurrency(deal.value, deal.currency)}
        </span>
        {deal.expected_close_date && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(deal.expected_close_date)}
          </span>
        )}
      </div>

      {assigneeLabel && (
        <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
          <span
            title={assigneeLabel}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
          >
            {initials(assigneeLabel)}
          </span>
          <span className="max-w-28 truncate">{assigneeLabel}</span>
        </div>
      )}
      {onHistory && !isOverlay && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onHistory(deal);
          }}
          className="mt-3 flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <Clock3 className="h-3 w-3" />
          Histórico
        </button>
      )}
    </div>
  );
}
