'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { CURRENCIES } from '@/lib/currency';
import { displayStageName } from '@/lib/pipelines/display';
import type {
  Contact,
  Conversation,
  Deal,
  DealStatus,
  PipelineStage,
  Profile,
} from '@/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Check,
  X,
  Trash2,
  MessageSquare,
  DollarSign,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

interface DealFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal | null;
  pipelineId: string;
  stages: PipelineStage[];
  defaultStageId?: string;
  defaultContactId?: string;
  onSaved: () => void;
}

const QUICK_PRODUCTS = [
  { name: 'Cartão Essence', price: 59.9, group: 'Cartões' },
  { name: 'Cartão Smart', price: 69.9, group: 'Cartões' },
  { name: 'Cartão Premium', price: 89.9, group: 'Cartões' },
  { name: 'Cartão Gold', price: 119.9, group: 'Cartões' },
  { name: 'Premium DIH 300', price: 149.9, group: 'Premium com DIH' },
  { name: 'Premium DIH 500', price: 189.9, group: 'Premium com DIH' },
  { name: 'Premium DIH 1000', price: 269.9, group: 'Premium com DIH' },
] as const;

export function DealForm({
  open,
  onOpenChange,
  deal,
  pipelineId,
  stages,
  defaultStageId,
  defaultContactId,
  onSaved,
}: DealFormProps) {
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();

  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [contactId, setContactId] = useState('');
  const [newContactMode, setNewContactMode] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactSource, setNewContactSource] = useState('presencial');
  const [stageId, setStageId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [linkedConversation, setLinkedConversation] =
    useState<Conversation | null>(null);

  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<DealStatus | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the form fields every time the sheet opens or its input
  // props change. This is a legitimate prop-driven sync; the rule is
  // over-cautious here, hence the block-level disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (deal) {
      setTitle(deal.title);
      setValue(String(deal.value ?? ''));
      setCurrency(deal.currency || defaultCurrency);
      // contact_id is nullable when the contact has been deleted
      // (migration 004: ON DELETE SET NULL). "" means "no selection".
      setContactId(deal.contact_id ?? '');
      setStageId(deal.stage_id);
      setAssignedTo(deal.assigned_to ?? '');
      setExpectedCloseDate(deal.expected_close_date ?? '');
      setNotes(deal.notes ?? '');
      setSelectedProduct('');
      setNewContactMode(false);
    } else {
      setTitle('');
      setValue('');
      setCurrency(defaultCurrency);
      setContactId(defaultContactId || '');
      setStageId(defaultStageId || stages[0]?.id || '');
      setAssignedTo('');
      setExpectedCloseDate('');
      setNotes('');
      setSelectedProduct('');
      setNewContactMode(false);
      setNewContactName('');
      setNewContactPhone('');
      setNewContactSource('presencial');
    }
  }, [open, deal, defaultStageId, defaultContactId, stages, defaultCurrency]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Load supporting data once the sheet is open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [c, p] = await Promise.all([
        supabase.from('contacts').select('*').order('name'),
        supabase.from('profiles').select('*').order('full_name'),
      ]);
      if (cancelled) return;
      setContacts((c.data ?? []) as Contact[]);
      setProfiles((p.data ?? []) as Profile[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  // Fetch linked conversation for the selected contact (newest open one).
  // Clearing on no-selection is sync with prop state; the populated
  // case runs setLinkedConversation inside the async fetch callback.
  useEffect(() => {
    if (!open || !contactId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLinkedConversation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_id', contactId)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setLinkedConversation((data as Conversation | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contactId, supabase]);

  async function handleSave() {
    if (!title.trim() || (!contactId && !newContactMode) || !stageId) {
      toast.error('Informe o título, o contato e a etapa');
      return;
    }
    setSaving(true);

    let resolvedContactId = contactId;
    if (newContactMode) {
      const normalizedPhone = newContactPhone.replace(/\D/g, '');
      if (!newContactName.trim() || !normalizedPhone || !accountId) {
        toast.error('Informe o nome e o WhatsApp do novo cliente');
        setSaving(false);
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { data: createdContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          account_id: accountId,
          user_id: session?.user.id,
          name: newContactName.trim(),
          phone: normalizedPhone,
          phone_normalized: normalizedPhone,
          lead_source: newContactSource,
        })
        .select('id')
        .single();
      if (contactError || !createdContact) {
        toast.error('Não foi possível cadastrar o cliente');
        setSaving(false);
        return;
      }
      resolvedContactId = createdContact.id;
    }

    const payload = {
      title: title.trim(),
      value: parseFloat(value) || 0,
      currency,
      contact_id: resolvedContactId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      assigned_to: assignedTo || null,
      notes: notes.trim() || null,
      expected_close_date: expectedCloseDate || null,
    };

    if (deal) {
      const { error } = await supabase
        .from('deals')
        .update(payload)
        .eq('id', deal.id);
      if (error) {
        toast.error('Falha ao salvar negócio');
        setSaving(false);
        return;
      }
    } else {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        toast.error('Not signed in');
        setSaving(false);
        return;
      }
      if (!accountId) {
        toast.error('Seu perfil não está vinculado a uma conta.');
        setSaving(false);
        return;
      }
      const { error } = await supabase.from('deals').insert({
        ...payload,
        user_id: user?.id,
        account_id: accountId,
        status: 'open',
      });
      if (error) {
        toast.error('Falha ao criar negócio');
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    toast.success(deal ? 'Venda atualizada' : 'Venda criada');
    onOpenChange(false);
    onSaved();
  }

  function chooseProduct(product: (typeof QUICK_PRODUCTS)[number]) {
    setSelectedProduct(product.name);
    setTitle(`Venda ${product.name}`);
    setValue(String(product.price));
  }

  async function handleStatusChange(status: DealStatus) {
    if (!deal) return;
    setStatusAction(status);
    const { error } = await supabase
      .from('deals')
      .update({ status })
      .eq('id', deal.id);
    setStatusAction(null);
    if (error) {
      toast.error('Falha ao atualizar status do negócio');
      return;
    }
    toast.success(
      status === 'won'
        ? 'Marcada como ganha'
        : status === 'lost'
          ? 'Marcada como perdida'
          : 'Venda reaberta'
    );
    onOpenChange(false);
    onSaved();
  }

  async function handleDelete() {
    if (!deal) return;
    setDeleting(true);
    const { error } = await supabase.from('deals').delete().eq('id', deal.id);
    setDeleting(false);
    if (error) {
      toast.error('Falha ao excluir negócio');
      return;
    }
    toast.success('Venda excluída');
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-popover border-border text-popover-foreground w-full p-0 sm:max-w-lg"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-border/50 border-b p-4">
            <SheetTitle className="text-popover-foreground">
              {deal ? 'Editar venda' : 'Nova Venda'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Título da venda</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Venda cartão premium"
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground">Cliente</Label>
                {!deal && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewContactMode((current) => !current);
                      setContactId('');
                    }}
                    className="text-primary text-xs font-medium"
                  >
                    {newContactMode ? 'Escolher existente' : '+ Cadastrar novo'}
                  </button>
                )}
              </div>
              {newContactMode ? (
                <div className="border-border bg-muted/20 grid gap-2 rounded-xl border p-3">
                  <Input
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Nome do cliente"
                  />
                  <Input
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="WhatsApp com DDD"
                    inputMode="tel"
                  />
                  <select
                    value={newContactSource}
                    onChange={(e) => setNewContactSource(e.target.value)}
                    className="border-border bg-muted h-9 rounded-lg border px-2.5 text-sm"
                  >
                    <option value="meta_ads">Meta</option>
                    <option value="google_ads">Google</option>
                    <option value="referral">Indicação</option>
                    <option value="presencial">Presencial</option>
                    <option value="phone">Ligação</option>
                    <option value="active_base">Base ativa</option>
                    <option value="other">Outros</option>
                  </select>
                </div>
              ) : (
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="border-border bg-muted text-foreground focus:border-primary focus:ring-primary h-9 w-full rounded-lg border px-2.5 text-sm outline-none focus:ring-1"
                >
                  <option value="">Selecione um contato</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.phone}
                    </option>
                  ))}
                </select>
              )}

              {linkedConversation && (
                <Link
                  href="/inbox"
                  className="bg-primary/10 text-primary hover:bg-primary/20 mt-1 inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs"
                >
                  <MessageSquare className="h-3 w-3" />
                  Abrir conversa
                </Link>
              )}
            </div>

            {!deal && (
              <div className="grid gap-2">
                <div>
                  <Label className="text-muted-foreground">
                    Escolha o produto
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    O título e o valor são preenchidos automaticamente.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_PRODUCTS.map((product) => (
                    <button
                      key={product.name}
                      type="button"
                      onClick={() => chooseProduct(product)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        selectedProduct === product.name
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-muted/40 hover:border-primary/50'
                      }`}
                    >
                      <span className="text-muted-foreground block text-xs">
                        {product.group}
                      </span>
                      <strong className="mt-1 block text-sm">
                        {product.name}
                      </strong>
                      <span className="text-primary mt-1 block text-xs">
                        R$ {product.price.toFixed(2).replace('.', ',')}/mês
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Valor</Label>
                <div className="relative">
                  <DollarSign className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
                  <Input
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0"
                    className="border-border bg-muted text-foreground pl-7"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Moeda</Label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="border-border bg-muted text-foreground focus:border-primary h-9 w-full rounded-lg border px-2.5 text-sm outline-none"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">
                Data prevista de fechamento
              </Label>
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Etapa</Label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="border-border bg-muted text-foreground focus:border-primary h-9 w-full rounded-lg border px-2.5 text-sm outline-none"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {displayStageName(s.name)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Responsável</Label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="border-border bg-muted text-foreground focus:border-primary h-9 w-full rounded-lg border px-2.5 text-sm outline-none"
              >
                <option value="">Sem responsável</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Notas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicionar observações..."
                className="border-border bg-muted text-foreground min-h-[100px]"
              />
            </div>

            {deal && (
              <div className="border-border bg-muted/50 space-y-2 rounded-lg border p-3">
                <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                  Status
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => handleStatusChange('won')}
                    disabled={!!statusAction || deal.status === 'won'}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1 disabled:opacity-50"
                  >
                    {statusAction === 'won' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-4 w-4" />
                        Mark as Won
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleStatusChange('lost')}
                    disabled={!!statusAction || deal.status === 'lost'}
                    className="flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {statusAction === 'lost' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <X className="mr-1 h-4 w-4" />
                        Mark as Lost
                      </>
                    )}
                  </Button>
                </div>
                {deal.status && deal.status !== 'open' && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleStatusChange('open')}
                    disabled={!!statusAction}
                    className="text-muted-foreground hover:text-foreground w-full"
                  >
                    Reopen deal
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="border-border/50 bg-popover/80 border-t p-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-border text-muted-foreground hover:bg-muted flex-1 bg-transparent"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !title.trim() || !contactId || !stageId}
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1"
              >
                {saving
                  ? 'Salvando...'
                  : deal
                    ? 'Salvar alterações'
                    : 'Criar negócio'}
              </Button>
            </div>

            {deal &&
              (confirmDelete ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
                  <span className="text-red-300">Excluir este negócio?</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="text-muted-foreground hover:bg-muted rounded px-2 py-1"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? 'Excluindo...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                  Excluir negócio
                </button>
              ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
