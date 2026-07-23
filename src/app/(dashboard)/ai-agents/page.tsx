'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  FlaskConical,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { createClient } from '@/lib/supabase/client';
import { AgentRunHistory } from '@/components/ai/agent-run-history';
import { AiOperationsSummary } from '@/components/ai/ai-operations-summary';
import { FollowupQueue } from '@/components/ai/followup-queue';

type Agent = {
  id: string;
  name: string;
  role: string;
  description: string | null;
  instructions: string;
  model: string | null;
  temperature: number;
  is_active: boolean;
  tone: string;
  response_length: string;
  use_emojis: boolean;
  followup_enabled: boolean;
  followup_delay_hours: number;
  followup_max_attempts: number;
  followup_start_hour: number;
  followup_end_hour: number;
  followup_quick_delays: number[];
};
type Draft = Omit<Agent, 'id'>;
const EMPTY: Draft = {
  name: '',
  role: 'Atendimento',
  description: '',
  instructions: '',
  model: '',
  temperature: 0.4,
  is_active: false,
  tone: 'equilibrado',
  response_length: 'curto',
  use_emojis: false,
  followup_enabled: false,
  followup_delay_hours: 24,
  followup_max_attempts: 3,
  followup_start_hour: 9,
  followup_end_hour: 18,
  followup_quick_delays: [1, 24, 72],
};

export default function AiAgentsPage() {
  const { accountId, user } = useAuth();
  const canEdit = useCan('edit-settings');
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [testAgent, setTestAgent] = useState<Agent | null>(null);
  const [testMessage, setTestMessage] = useState(
    'Olá! Quero conhecer melhor os serviços da empresa.'
  );
  const [testResponse, setTestResponse] = useState<{
    text: string;
    model: string;
    latencyMs: number;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from('ai_agents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Não foi possível carregar os agentes');
    setAgents((data ?? []) as Agent[]);
  }, []);
  useEffect(() => {
    void createClient()
      .from('ai_agents')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error('Não foi possível carregar os agentes');
        setAgents((data ?? []) as Agent[]);
      });
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  function createAgent() {
    setEditingId(null);
    setDraft(EMPTY);
    setOpen(true);
  }
  function editAgent(agent: Agent) {
    const { id, ...values } = agent;
    setEditingId(id);
    setDraft(values);
    setOpen(true);
  }

  async function save() {
    if (!accountId || !user || !draft.name.trim() || !draft.instructions.trim())
      return toast.error('Informe nome e instruções do agente');
    setSaving(true);
    const db = createClient();
    const values = {
      ...draft,
      name: draft.name.trim(),
      instructions: draft.instructions.trim(),
      model: draft.model?.trim() || null,
    };
    const result = editingId
      ? await db.from('ai_agents').update(values).eq('id', editingId)
      : await db.from('ai_agents').insert({
          ...values,
          account_id: accountId,
          created_by_user_id: user.id,
        });
    setSaving(false);
    if (result.error) return toast.error('Falha ao salvar o agente');
    setOpen(false);
    toast.success(editingId ? 'Agente atualizado' : 'Agente criado');
    void load();
  }

  async function remove(id: string) {
    const { error } = await createClient()
      .from('ai_agents')
      .delete()
      .eq('id', id);
    if (error) return toast.error('Falha ao excluir o agente');
    toast.success('Agente excluído');
    void load();
  }

  function openTest(agent: Agent) {
    setTestAgent(agent);
    setTestResponse(null);
  }

  async function runTest() {
    if (!testAgent || !testMessage.trim()) return;
    setTesting(true);
    setTestResponse(null);
    const response = await fetch(`/api/ai/agents/${testAgent.id}/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: testMessage }),
    });
    const body = await response.json().catch(() => ({}));
    setTesting(false);
    if (!response.ok)
      return toast.error(body.error ?? 'Falha ao executar o agente');
    setTestResponse(body);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-primary mb-1 flex items-center gap-2 text-xs font-semibold tracking-[0.18em] uppercase">
            <Sparkles className="h-3.5 w-3.5" /> Inteligência artificial
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Agentes de IA</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Configure especialistas para atender, qualificar e acompanhar seus
            leads.
          </p>
        </div>
        <Button onClick={createAgent} disabled={!canEdit}>
          <Plus className="h-4 w-4" /> Novo agente
        </Button>
      </div>

      <AiOperationsSummary />

      {agents === null ? (
        <div className="flex h-56 items-center justify-center">
          <Loader2 className="text-primary h-6 w-6 animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <div className="border-border bg-card/40 flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
          <span className="bg-primary/10 text-primary flex h-14 w-14 items-center justify-center rounded-2xl">
            <Bot className="h-7 w-7" />
          </span>
          <h2 className="mt-4 font-semibold">Crie seu primeiro agente</h2>
          <p className="text-muted-foreground mt-1 max-w-md text-sm">
            Defina como ele deve conversar, qual papel terá e quando poderá
            entrar em ação.
          </p>
          <Button className="mt-5" onClick={createAgent} disabled={!canEdit}>
            <Plus className="h-4 w-4" /> Criar agente
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <article
              key={agent.id}
              className="border-border bg-card rounded-2xl border p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="bg-primary/12 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <Bot className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-semibold">{agent.name}</h2>
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${agent.is_active ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`}
                    />
                  </div>
                  <p className="text-primary text-xs">{agent.role}</p>
                </div>
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="text-muted-foreground hover:bg-muted rounded-lg p-1.5">
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openTest(agent)}>
                        <FlaskConical className="h-4 w-4" /> Testar agente
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => editAgent(agent)}>
                        <Pencil className="h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => remove(agent.id)}
                      >
                        <Trash2 className="h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <p className="text-muted-foreground mt-4 line-clamp-2 min-h-10 text-sm">
                {agent.description || 'Sem descrição.'}
              </p>
              <div className="border-border text-muted-foreground mt-4 flex items-center justify-between border-t pt-3 text-xs">
                <span>{agent.model || 'Modelo padrão'}</span>
                <span>Temperatura {Number(agent.temperature).toFixed(1)}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openTest(agent)}
                disabled={!canEdit}
                className="mt-4 w-full"
              >
                <FlaskConical className="h-3.5 w-3.5" /> Abrir playground
              </Button>
            </article>
          ))}
        </div>
      )}

      <AgentRunHistory />
      <FollowupQueue />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Editar agente' : 'Novo agente de IA'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="agent-name">Nome</Label>
                <Input
                  id="agent-name"
                  value={draft.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Ex.: SDR Sofia"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="agent-role">Função</Label>
                <Input
                  id="agent-role"
                  value={draft.role}
                  onChange={(e) => set('role', e.target.value)}
                  placeholder="Qualificação de leads"
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="agent-description">Descrição</Label>
              <Input
                id="agent-description"
                value={draft.description ?? ''}
                onChange={(e) => set('description', e.target.value)}
                placeholder="O que este agente faz?"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="agent-instructions">Instruções do agente</Label>
              <Textarea
                id="agent-instructions"
                value={draft.instructions}
                onChange={(e) => set('instructions', e.target.value)}
                placeholder="Você é um especialista comercial. Faça perguntas curtas, identifique a necessidade..."
                className="mt-1.5 min-h-36"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Tom</Label>
                <select
                  value={draft.tone}
                  onChange={(e) => set('tone', e.target.value)}
                  className="border-input bg-background mt-1.5 h-9 w-full rounded-lg border px-3 text-sm"
                >
                  <option value="direto">Direto</option>
                  <option value="equilibrado">Equilibrado</option>
                  <option value="consultivo">Consultivo</option>
                  <option value="amigavel">Amigável</option>
                  <option value="formal">Formal</option>
                </select>
              </div>
              <div>
                <Label>Tamanho</Label>
                <select
                  value={draft.response_length}
                  onChange={(e) => set('response_length', e.target.value)}
                  className="border-input bg-background mt-1.5 h-9 w-full rounded-lg border px-3 text-sm"
                >
                  <option value="muito_curto">Bem simples</option>
                  <option value="curto">Curto</option>
                  <option value="detalhado">Detalhado</option>
                </select>
              </div>
              <label className="border-border flex items-center justify-between rounded-xl border px-3">
                <span className="text-sm">Usar emojis</span>
                <Switch
                  checked={draft.use_emojis}
                  onCheckedChange={(value) => set('use_emojis', value)}
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="agent-model">Modelo</Label>
                <Input
                  id="agent-model"
                  value={draft.model ?? ''}
                  onChange={(e) => set('model', e.target.value)}
                  placeholder="Usar modelo padrão"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="agent-temperature">
                  Criatividade: {draft.temperature.toFixed(1)}
                </Label>
                <input
                  id="agent-temperature"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={draft.temperature}
                  onChange={(e) => set('temperature', Number(e.target.value))}
                  className="mt-3 w-full accent-[var(--primary)]"
                />
              </div>
            </div>
            <div className="border-border bg-muted/20 rounded-xl border p-4">
              <label className="flex items-center justify-between">
                <span>
                  <strong className="block text-sm">
                    Follow-up automático com IA
                  </strong>
                  <span className="text-muted-foreground text-xs">
                    Para quando o lead parar de responder
                  </span>
                </span>
                <Switch
                  checked={draft.followup_enabled}
                  onCheckedChange={(value) => set('followup_enabled', value)}
                />
              </label>
              {draft.followup_enabled && (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <Label>Esperar (horas)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={720}
                        value={draft.followup_delay_hours}
                        onChange={(e) =>
                          set('followup_delay_hours', Number(e.target.value))
                        }
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label>Máx. tentativas</Label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={draft.followup_max_attempts}
                        onChange={(e) =>
                          set('followup_max_attempts', Number(e.target.value))
                        }
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label>Início</Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={draft.followup_start_hour}
                        onChange={(e) =>
                          set('followup_start_hour', Number(e.target.value))
                        }
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label>Fim</Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={draft.followup_end_hour}
                        onChange={(e) =>
                          set('followup_end_hour', Number(e.target.value))
                        }
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Atalhos na conversa (horas)</Label>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Até 5 prazos que o vendedor verá no botão Follow-up.
                    </p>
                    <Input
                      value={draft.followup_quick_delays.join(', ')}
                      onChange={(e) =>
                        set(
                          'followup_quick_delays',
                          e.target.value
                            .split(',')
                            .map((item) => Number(item.trim()))
                            .filter(
                              (item) =>
                                Number.isInteger(item) &&
                                item >= 1 &&
                                item <= 720
                            )
                            .slice(0, 5)
                        )
                      }
                      placeholder="1, 24, 72"
                      className="mt-2"
                    />
                  </div>
                </div>
              )}
            </div>
            <label className="border-border bg-muted/30 flex items-center justify-between rounded-xl border p-3">
              <span>
                <strong className="block text-sm">Agente ativo</strong>
                <span className="text-muted-foreground text-xs">
                  Disponível para automações e atendimento
                </span>
              </span>
              <Switch
                checked={draft.is_active}
                onCheckedChange={(value) => set('is_active', value)}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar agente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!testAgent}
        onOpenChange={(next) => {
          if (!next) setTestAgent(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="text-primary h-5 w-5" /> Playground ·{' '}
              {testAgent?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="test-message">Mensagem do lead</Label>
              <Textarea
                id="test-message"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="mt-1.5 min-h-24"
              />
            </div>
            {testResponse && (
              <div className="border-primary/20 bg-primary/5 rounded-xl border p-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-primary font-semibold tracking-wider uppercase">
                    Resposta do agente
                  </span>
                  <span className="text-muted-foreground">
                    {testResponse.model} · {testResponse.latencyMs} ms
                  </span>
                </div>
                <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                  {testResponse.text}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestAgent(null)}>
              Fechar
            </Button>
            <Button onClick={runTest} disabled={testing || !testMessage.trim()}>
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {testing ? 'Gerando resposta...' : 'Enviar teste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
