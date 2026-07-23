'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
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

interface QuickProduct {
  name: string;
  price: number | null;
  group: string;
  detail?: string;
}

type LeadTemperature = NonNullable<Contact['lead_temperature']>;

const CONTRACT_OPTIONS = [
  { months: 1, label: 'Avulso / 1 mês' },
  { months: 2, label: 'Bimestral' },
  { months: 3, label: 'Trimestral' },
  { months: 6, label: 'Semestral' },
  { months: 12, label: 'Anual' },
] as const;

const LEAD_OPTIONS: Array<{ value: LeadTemperature; label: string }> = [
  { value: 'frio', label: 'Frio — pouco interesse' },
  { value: 'curioso', label: 'Curioso — pesquisando' },
  { value: 'interessado', label: 'Interessado' },
  { value: 'quente', label: 'Quente — pronto para comprar' },
  { value: 'vendido', label: 'Vendido' },
  { value: 'perdido', label: 'Perdido' },
];

const QUICK_PRODUCTS: QuickProduct[] = [
  { name: 'Cartão Essence', price: 59.9, group: 'Cartões principais', detail: 'Até 5 pessoas' },
  { name: 'Cartão Smart', price: 69.9, group: 'Cartões principais' },
  { name: 'Cartão Premium', price: 89.9, group: 'Cartões principais' },
  { name: 'Cartão Gold', price: 119.9, group: 'Cartões principais' },
  { name: 'Cartão Empresarial PJ', price: null, group: 'Cartões principais', detail: 'Valor personalizado' },
  { name: 'Premium DIH 300', price: 149.9, group: 'Premium com DIH' },
  { name: 'Premium DIH 500', price: 189.9, group: 'Premium com DIH' },
  { name: 'Premium DIH 1000', price: 269.9, group: 'Premium com DIH' },
  { name: 'Seguro Funeral Ampliado', price: 99.9, group: 'Adicionais / UP' },
  { name: 'Seguro Despesas Médicas', price: 19.9, group: 'Adicionais / UP' },
  { name: 'UP Internação 300', price: null, group: 'Adicionais / UP', detail: 'Valor personalizado' },
  { name: 'UP Internação 500', price: null, group: 'Adicionais / UP', detail: 'Valor personalizado' },
  { name: 'UP Internação 1000', price: null, group: 'Adicionais / UP', detail: 'Valor personalizado' },
  { name: 'Odontologia', price: null, group: 'Serviços avulsos', detail: 'Preencher valor' },
  { name: 'Exames', price: null, group: 'Serviços avulsos', detail: 'Laboratório / imagem' },
  { name: 'Consulta', price: null, group: 'Serviços avulsos', detail: 'Especialidades médicas' },
  { name: 'Outros', price: null, group: 'Serviços avulsos', detail: 'Serviço personalizado' },
];

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
  const { accountId } = useAuth();

  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [contractMonths, setContractMonths] = useState<1 | 2 | 3 | 6 | 12>(1);
  const [contactId, setContactId] = useState('');
  const [newContactMode, setNewContactMode] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactSource, setNewContactSource] = useState('presencial');
  const [stageId, setStageId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [leadTemperature, setLeadTemperature] =
    useState<LeadTemperature>('curioso');
  const [responseTimeBucket, setResponseTimeBucket] = useState('');

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
      setValue(String(deal.installment_value ?? deal.value ?? ''));
      setContractMonths(deal.contract_months ?? 1);
      // contact_id is nullable when the contact has been deleted
      // (migration 004: ON DELETE SET NULL). "" means "no selection".
      setContactId(deal.contact_id ?? '');
      setStageId(deal.stage_id);
      setAssignedTo(deal.assigned_to ?? '');
      setExpectedCloseDate(deal.expected_close_date ?? '');
      setNotes(deal.notes ?? '');
      setSelectedProducts(deal.selected_products ?? []);
      setLeadTemperature(deal.contact?.lead_temperature ?? 'curioso');
      setResponseTimeBucket(deal.contact?.response_time_bucket ?? '');
      setNewContactMode(false);
    } else {
      setTitle('');
      setValue('');
      setContractMonths(1);
      setContactId(defaultContactId || '');
      setStageId(defaultStageId || stages[0]?.id || '');
      setAssignedTo('');
      setExpectedCloseDate('');
      setNotes('');
      setSelectedProducts([]);
      setLeadTemperature('curioso');
      setResponseTimeBucket('');
      setNewContactMode(false);
      setNewContactName('');
      setNewContactPhone('');
      setNewContactSource('presencial');
    }
  }, [open, deal, defaultStageId, defaultContactId, stages]);
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
          lead_temperature: leadTemperature,
          response_time_bucket: responseTimeBucket || null,
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
      value: (parseFloat(value) || 0) * contractMonths,
      installment_value: parseFloat(value) || 0,
      contract_months: contractMonths,
      currency: 'BRL',
      contact_id: resolvedContactId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      assigned_to: assignedTo || null,
      notes: notes.trim() || null,
      expected_close_date: expectedCloseDate || null,
      selected_products: selectedProducts,
    };

    await supabase
      .from('contacts')
      .update({
        lead_temperature: leadTemperature,
        response_time_bucket: responseTimeBucket || null,
      })
      .eq('id', resolvedContactId);

    if (deal) {
      const { error } = await supabase
        .from('deals')
        .update(payload)
        .eq('id', deal.id);
      if (error) {
        toast.error('Falha ao salvar venda');
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
        toast.error('Falha ao criar venda');
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    toast.success(deal ? 'Venda atualizada' : 'Venda criada');
    onOpenChange(false);
    onSaved();
  }

  function chooseProduct(product: QuickProduct) {
    const next = selectedProducts.includes(product.name)
      ? selectedProducts.filter((name) => name !== product.name)
      : [...selectedProducts, product.name];
    setSelectedProducts(next);
    const contactName = newContactMode
      ? newContactName.trim()
      : contacts.find((contact) => contact.id === contactId)?.name?.trim();
    const primaryName = next[0];
    setTitle(primaryName ? `${primaryName}${contactName ? ` — ${contactName}` : ''}` : '');
    const total = QUICK_PRODUCTS.filter(
      (item) => next.includes(item.name) && item.price !== null,
    ).reduce((sum, item) => sum + (item.price ?? 0), 0);
    setValue(total ? String(total) : '');
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
      toast.error('Falha ao atualizar status da venda');
      return;
    }
    if (deal.contact_id && (status === 'won' || status === 'lost')) {
      await supabase
        .from('contacts')
        .update({
          lead_temperature: status === 'won' ? 'vendido' : 'perdido',
        })
        .eq('id', deal.contact_id);
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
      toast.error('Falha ao excluir venda');
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
                <div className="space-y-4">
                  {[...new Set(QUICK_PRODUCTS.map((product) => product.group))].map(
                    (group) => (
                      <section key={group}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {group}
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                          {QUICK_PRODUCTS.filter(
                            (product) => product.group === group,
                          ).map((product) => (
                            <button
                              key={product.name}
                              type="button"
                              onClick={() => chooseProduct(product)}
                              className={`rounded-xl border p-3 text-left transition-colors ${
                                selectedProducts.includes(product.name)
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border bg-muted/40 hover:border-primary/50'
                              }`}
                            >
                              <strong className="block text-sm">
                                {product.name}
                              </strong>
                              {product.detail && (
                                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                  {product.detail}
                                </span>
                              )}
                              <span className="mt-1 block text-xs text-primary">
                                {product.price === null
                                  ? 'Informar valor'
                                  : `R$ ${product.price.toFixed(2).replace('.', ',')}/mês`}
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    ),
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label className="text-muted-foreground">
                Valor da parcela / mensalidade
              </Label>
              <div className="relative">
                <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-xs font-semibold">
                  R$
                </span>
                <Input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0,00"
                  className="border-border bg-muted text-foreground pl-10"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Tipo do contrato</Label>
              <select
                value={contractMonths}
                onChange={(event) =>
                  setContractMonths(
                    Number(event.target.value) as 1 | 2 | 3 | 6 | 12,
                  )
                }
                className="border-border bg-muted text-foreground focus:border-primary h-9 w-full rounded-lg border px-2.5 text-sm outline-none"
              >
                {CONTRACT_OPTIONS.map((option) => (
                  <option key={option.months} value={option.months}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="border-border bg-primary/5 rounded-lg border p-3">
                <span className="text-muted-foreground block text-xs">
                  Total do contrato
                </span>
                <strong className="text-primary text-base">
                  {new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  }).format((parseFloat(value) || 0) * contractMonths)}
                </strong>
                <span className="text-muted-foreground ml-2 text-xs">
                  {contractMonths} {contractMonths === 1 ? 'parcela' : 'parcelas'}
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">
                Classificação do lead
              </Label>
              <select
                value={leadTemperature}
                onChange={(event) =>
                  setLeadTemperature(event.target.value as LeadTemperature)
                }
                className="border-border bg-muted text-foreground focus:border-primary h-9 w-full rounded-lg border px-2.5 text-sm outline-none"
              >
                {LEAD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Tempo de resposta</Label>
              <select
                value={responseTimeBucket}
                onChange={(event) => setResponseTimeBucket(event.target.value)}
                className="border-border bg-muted text-foreground focus:border-primary h-9 w-full rounded-lg border px-2.5 text-sm outline-none"
              >
                <option value="">Ainda não informado</option>
                <option value="Até 5 min">🟢 Até 5 min</option>
                <option value="5–15 min">🟡 5–15 min</option>
                <option value="15–30 min">🟠 15–30 min</option>
                <option value="30–60 min">🔴 30–60 min</option>
                <option value="Acima de 1 hora">⚫ Acima de 1 hora</option>
              </select>
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
                        Marcar como ganha
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
                        Marcar como perdida
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
                    Reabrir venda
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
                disabled={
                  saving ||
                  !title.trim() ||
                  (!contactId && !newContactMode) ||
                  !stageId
                }
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1"
              >
                {saving
                  ? 'Salvando...'
                  : deal
                    ? 'Salvar alterações'
                    : 'Criar venda'}
              </Button>
            </div>

            {deal &&
              (confirmDelete ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
                  <span className="text-red-300">Excluir esta venda?</span>
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
                  Excluir venda
                </button>
              ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
