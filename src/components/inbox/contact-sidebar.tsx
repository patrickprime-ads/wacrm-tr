"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, Deal, ContactNote, Tag } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  Sparkles,
  Loader2,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { toast } from "sonner";

interface ContactSidebarProps {
  contact: Contact | null;
  conversationId?: string | null;
}

interface ContactInsight {
  summary: string;
  interest_level: "cold" | "warm" | "hot";
  score: number;
  next_action: string;
  signals: string[];
  analyzed_at: string;
}

export function ContactSidebar({ contact, conversationId }: ContactSidebarProps) {
  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [insight, setInsight] = useState<ContactInsight | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, notes, and tags in parallel
    const [dealsRes, notesRes, tagsRes, insightRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
      supabase
        .from("ai_contact_insights")
        .select("summary, interest_level, score, next_action, signals, analyzed_at")
        .eq("contact_id", contact.id)
        .maybeSingle(),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
    setInsight((insightRes.data as ContactInsight | null) ?? null);
  }, [contact]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  const analyzeContact = useCallback(async () => {
    if (!contact || !conversationId) return;
    setAnalyzing(true);
    const response = await fetch("/api/ai/contact-insight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id: contact.id, conversation_id: conversationId }),
    });
    const body = await response.json().catch(() => ({}));
    setAnalyzing(false);
    if (!response.ok) return toast.error(body.error ?? "Não foi possível analisar o lead");
    setInsight(body.insight as ContactInsight);
    toast.success("Inteligência do lead atualizada");
  }, [contact, conversationId]);

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
      </div>
    );
  }

  const savedName = contact.name?.trim();
  const displayName =
    savedName && !["você", "you"].includes(savedName.toLowerCase())
      ? savedName
      : contact.phone;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {contact.avatar_url ? (
                <>
                  {/* Contact avatars may come from arbitrary customer-hosted HTTPS
                      URLs, so next/image cannot safely enumerate their hosts. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={contact.avatar_url}
                    alt={displayName}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                </>
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-xs text-muted-foreground">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* AI lead intelligence */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><Sparkles className="h-3.5 w-3.5" /> Inteligência do lead</div>
              <Button variant="ghost" size="sm" onClick={() => void analyzeContact()} disabled={analyzing || !conversationId} className="h-7 px-2 text-[10px] text-primary hover:bg-primary/10">
                {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {insight ? "Atualizar" : "Analisar"}
              </Button>
            </div>
            {insight ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3"><div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-primary/20 text-sm font-bold text-primary">{insight.score}</div><div><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", insight.interest_level === "hot" ? "bg-red-500/15 text-red-400" : insight.interest_level === "warm" ? "bg-amber-500/15 text-amber-400" : "bg-sky-500/15 text-sky-400")}>{insight.interest_level === "hot" ? "Quente" : insight.interest_level === "warm" ? "Morno" : "Frio"}</span><p className="mt-1 text-[10px] text-muted-foreground">Score comercial</p></div></div>
                <p className="text-xs leading-relaxed text-foreground/90">{insight.summary}</p>
                <div className="rounded-lg bg-card/60 p-2.5"><p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary"><Target className="h-3 w-3" /> Próxima ação</p><p className="mt-1 text-xs text-muted-foreground">{insight.next_action}</p></div>
                {insight.signals.length > 0 && <div className="flex flex-wrap gap-1">{insight.signals.map((signal) => <span key={signal} className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">{signal}</span>)}</div>}
              </div>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Resuma a conversa, identifique o interesse e receba uma próxima ação comercial.</p>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <TagIcon className="h-3 w-3" />
              Etiquetas
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">Nenhuma etiqueta</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Vendas ativas
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">Nenhuma venda ativa</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {deal.currency === "BRL" || !deal.currency ? "R$" : deal.currency}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              Notas
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Adicionar uma nota..."
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
