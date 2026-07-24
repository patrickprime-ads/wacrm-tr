import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';
import { randomBytes } from 'node:crypto';
import {
  importEvolutionMessage,
  mergeEvolutionContactIdentity,
  type EvolutionMessage,
} from '@/lib/evolution/inbox';

type ConfigRow = {
  server_url: string;
  api_key_encrypted: string;
  instance_name: string;
  status: string;
  webhook_secret_encrypted?: string | null;
};

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, accountId: null, role: null };
  const { data } = await supabase
    .from('profiles')
    .select('account_id, account_role')
    .eq('user_id', user.id)
    .maybeSingle();
  return {
    supabase,
    accountId: data?.account_id as string | null,
    role: data?.account_role as string | null,
  };
}

function safeServerUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:')
    throw new Error('A URL da Evolution precisa usar HTTPS.');
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local')
  ) {
    throw new Error(
      'A Vercel não consegue acessar uma Evolution local. Use uma URL pública.'
    );
  }
  return url.origin;
}

async function evolution(config: ConfigRow, path: string, init?: RequestInit) {
  const response = await fetch(`${config.server_url}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      apikey: decrypt(config.api_key_encrypted),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    const value = data as {
      message?: string;
      error?: string;
      response?: { message?: string[] };
    };
    const message =
      value.message ||
      value.error ||
      value.response?.message?.join(', ') ||
      `Evolution respondeu ${response.status}`;
    throw new Error(message);
  }
  return data as Record<string, unknown>;
}

function qrFrom(data: Record<string, unknown>) {
  const nested = (data.qrcode ?? data.qr) as
    | Record<string, unknown>
    | undefined;
  const base64 = (data.base64 ?? nested?.base64) as string | undefined;
  const code = (data.code ?? nested?.code) as string | undefined;
  return {
    base64: base64?.startsWith('data:')
      ? base64
      : base64
        ? `data:image/png;base64,${base64}`
        : null,
    code: code ?? null,
  };
}

function profilePictureUrlFrom(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of ['profilePictureUrl', 'profilePicUrl']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.startsWith('http')) {
      return candidate;
    }
  }
  for (const key of ['data', 'response', 'picture', 'result']) {
    const nested = profilePictureUrlFrom(record[key]);
    if (nested) return nested;
  }
  return null;
}

function evolutionRecords(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  for (const key of ['contacts', 'chats', 'records', 'data', 'response']) {
    const nested = evolutionRecords(record[key]);
    if (nested.length) return nested;
  }
  return [];
}

export async function GET() {
  try {
    const { supabase, accountId } = await context();
    if (!accountId)
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const { data: config, error } = await supabase
      .from('evolution_config')
      .select('server_url, api_key_encrypted, instance_name, status')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error)
      return NextResponse.json(
        { error: 'Execute a migração 031_evolution_api.sql no Supabase.' },
        { status: 500 }
      );
    if (!config)
      return NextResponse.json({ configured: false, state: 'disconnected' });
    try {
      const stateData = await evolution(
        config as ConfigRow,
        `/instance/connectionState/${encodeURIComponent(config.instance_name)}`
      );
      const state = ((stateData.instance as Record<string, unknown> | undefined)
        ?.state ??
        stateData.state ??
        'disconnected') as string;
      let webhookConfigured = false;
      try {
        const hook = await evolution(
          config as ConfigRow,
          `/webhook/find/${encodeURIComponent(config.instance_name)}`
        );
        const webhook = (hook.webhook ?? hook) as Record<string, unknown>;
        webhookConfigured =
          webhook.enabled === true &&
          String(webhook.url || '').includes('/api/evolution/webhook');
      } catch {
        /* versões antigas podem não oferecer o endpoint de consulta */
      }
      await supabase
        .from('evolution_config')
        .update({ status: state })
        .eq('account_id', accountId);
      return NextResponse.json({
        configured: true,
        server_url: config.server_url,
        instance_name: config.instance_name,
        state,
        webhook_configured: webhookConfigured,
      });
    } catch (error) {
      return NextResponse.json({
        configured: true,
        server_url: config.server_url,
        instance_name: config.instance_name,
        state: 'disconnected',
        warning:
          error instanceof Error
            ? error.message
            : 'Falha ao consultar a Evolution',
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, role } = await context();
    if (!accountId)
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (role !== 'owner' && role !== 'admin')
      return NextResponse.json(
        { error: 'Somente administradores podem configurar o WhatsApp.' },
        { status: 403 }
      );
    const body = (await request.json()) as {
      action?: string;
      server_url?: string;
      api_key?: string;
      instance_name?: string;
    };

    if (body.action === 'save') {
      const serverUrl = safeServerUrl(body.server_url?.trim() || '');
      const instanceName = body.instance_name?.trim() || '';
      if (!/^[a-zA-Z0-9_-]{3,50}$/.test(instanceName))
        return NextResponse.json(
          {
            error:
              'Use de 3 a 50 letras, números, hífen ou sublinhado no nome da instância.',
          },
          { status: 400 }
        );
      const { data: existing } = await supabase
        .from('evolution_config')
        .select('api_key_encrypted, webhook_secret_encrypted')
        .eq('account_id', accountId)
        .maybeSingle();
      const encryptedKey = body.api_key?.trim()
        ? encrypt(body.api_key.trim())
        : existing?.api_key_encrypted;
      if (!encryptedKey)
        return NextResponse.json(
          { error: 'Informe a chave global da Evolution API.' },
          { status: 400 }
        );
      const webhookSecret =
        existing?.webhook_secret_encrypted ||
        encrypt(randomBytes(32).toString('hex'));
      const { error } = await supabase
        .from('evolution_config')
        .upsert(
          {
            account_id: accountId,
            server_url: serverUrl,
            instance_name: instanceName,
            api_key_encrypted: encryptedKey,
            webhook_secret_encrypted: webhookSecret,
            status: 'disconnected',
          },
          { onConflict: 'account_id' }
        );
      if (error)
        return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    const { data: config, error } = await supabase
      .from('evolution_config')
      .select(
        'server_url, api_key_encrypted, instance_name, status, webhook_secret_encrypted'
      )
      .eq('account_id', accountId)
      .maybeSingle();
    if (error || !config)
      return NextResponse.json(
        { error: 'Salve a configuração da Evolution primeiro.' },
        { status: 400 }
      );
    const instance = encodeURIComponent(config.instance_name);
    const origin = new URL(request.url).origin;
    const webhookSecret = config.webhook_secret_encrypted
      ? decrypt(config.webhook_secret_encrypted)
      : null;
    const configureWebhook = async () => {
      if (!webhookSecret)
        throw new Error(
          'Salve novamente a configuração para gerar a segurança do webhook.'
        );
      await evolution(config as ConfigRow, `/webhook/set/${instance}`, {
        method: 'POST',
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: `${origin}/api/evolution/webhook?token=${encodeURIComponent(webhookSecret)}`,
            webhookByEvents: false,
            webhookBase64: false,
            events: [
              'MESSAGES_SET',
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'CONTACTS_SET',
              'CONTACTS_UPSERT',
              'CONTACTS_UPDATE',
              'CONNECTION_UPDATE',
            ],
          },
        }),
      });
    };

    if (body.action === 'sync') {
      // Rotate on every manual sync so a URL exposed in logs/screenshots
      // immediately becomes invalid.
      const freshSecret = randomBytes(32).toString('hex');
      await supabase
        .from('evolution_config')
        .update({ webhook_secret_encrypted: encrypt(freshSecret) })
        .eq('account_id', accountId);
      await evolution(config as ConfigRow, `/webhook/set/${instance}`, {
        method: 'POST',
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: `${origin}/api/evolution/webhook?token=${encodeURIComponent(freshSecret)}`,
            webhookByEvents: false,
            webhookBase64: false,
            events: [
              'MESSAGES_SET',
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'CONTACTS_SET',
              'CONTACTS_UPSERT',
              'CONTACTS_UPDATE',
              'CONNECTION_UPDATE',
            ],
          },
        }),
      });
      let imported = 0;
      let skipped = 0;
      let contactsUpdated = 0;
      let importWarning: string | null = null;
      try {
        try {
          const currentSettings = await evolution(
            config as ConfigRow,
            `/settings/find/${instance}`,
          );
          const settings = (currentSettings.settings ??
            currentSettings) as Record<string, unknown>;
          await evolution(config as ConfigRow, `/settings/set/${instance}`, {
            method: 'POST',
            body: JSON.stringify({
              rejectCall: Boolean(settings.rejectCall),
              msgCall: String(settings.msgCall ?? ''),
              groupsIgnore: Boolean(settings.groupsIgnore),
              alwaysOnline: Boolean(settings.alwaysOnline),
              readMessages: Boolean(settings.readMessages),
              readStatus: Boolean(settings.readStatus),
              syncFullHistory: true,
              wavoipToken: String(settings.wavoipToken ?? ''),
            }),
          });
        } catch {
          // Older Evolution releases may not expose the settings endpoint.
          // History/contact import below must still continue in that case.
        }

        const contactResult = await evolution(
          config as ConfigRow,
          `/chat/findContacts/${instance}`,
          {
            method: 'POST',
            body: JSON.stringify({
              where: {},
              take: 1000,
              skip: 0,
              orderBy: {},
            }),
          }
        );
        type EvolutionIdentity = {
          id?: string;
          number?: string;
          remoteJid?: string;
          remoteJidAlt?: string;
          pushName?: string;
          name?: string;
          profilePictureUrl?: string | null;
          profilePicUrl?: string | null;
          contactName?: string;
          savedName?: string;
          verifiedName?: string;
          notify?: string;
          businessName?: string;
          lastMessage?: {
            pushName?: string;
            key?: {
              remoteJid?: string;
              remoteJidAlt?: string;
            };
          };
        };
        const evolutionContacts = evolutionRecords(
          contactResult,
        ) as EvolutionIdentity[];
        try {
          const chatResult = await evolution(
            config as ConfigRow,
            `/chat/findChats/${instance}`,
            {
              method: 'POST',
              body: JSON.stringify({
                where: {},
                take: 1000,
                skip: 0,
                orderBy: {},
              }),
            },
          );
          const chats = evolutionRecords(chatResult) as EvolutionIdentity[];
          evolutionContacts.push(...chats);
        } catch {
          // Some Evolution releases do not expose findChats.
        }
        const { data: localContacts } = await supabase
          .from('contacts')
          .select('id, phone_normalized, avatar_url')
          .eq('account_id', accountId);
        const contactsByPhone = new Map(
          (localContacts ?? []).map((contact) => [
            contact.phone_normalized,
            contact,
          ]),
        );
        for (const evolutionContact of evolutionContacts) {
          const jidCandidates = [
            evolutionContact.number,
            evolutionContact.remoteJid,
            evolutionContact.remoteJidAlt,
            evolutionContact.id,
            evolutionContact.lastMessage?.key?.remoteJid,
            evolutionContact.lastMessage?.key?.remoteJidAlt,
          ].filter((value): value is string => Boolean(value));
          const realJid =
            jidCandidates.find(
              (value) =>
                value.endsWith('@s.whatsapp.net') ||
                value.endsWith('@c.us'),
            ) || evolutionContact.number;
          const lidJid = jidCandidates.find((value) => value.endsWith('@lid'));
          const phone = String(realJid || '')
            .split('@')[0]
            .replace(/\D/g, '');
          const internalId = String(lidJid || '')
            .split('@')[0]
            .replace(/\D/g, '');
          const name = (
            evolutionContact.pushName ||
            evolutionContact.name ||
            evolutionContact.contactName ||
            evolutionContact.savedName ||
            evolutionContact.verifiedName ||
            evolutionContact.notify ||
            evolutionContact.businessName ||
            evolutionContact.lastMessage?.pushName
          )?.trim();
          if (!phone && !internalId) continue;
          const validName =
            name &&
            name.toLowerCase() !== 'você' &&
            name.toLowerCase() !== 'you'
              ? name
              : null;
          const identifiers = [...new Set([phone, internalId].filter(Boolean))];
          const matches = [
            ...new Map(
              identifiers
                .map((identifier) => contactsByPhone.get(identifier))
                .filter(Boolean)
                .map((contact) => [contact!.id, contact!]),
            ).values(),
          ];
          if (!matches.length) continue;
          let avatarUrl =
            evolutionContact.profilePictureUrl ||
            evolutionContact.profilePicUrl ||
            null;
          const needsAvatar = matches.some((contact) => !contact.avatar_url);
          if (!avatarUrl && needsAvatar && (realJid || phone)) {
            try {
              const picture = await evolution(
                config as ConfigRow,
                `/chat/fetchProfilePictureUrl/${instance}`,
                {
                  method: 'POST',
                  body: JSON.stringify({ number: phone || realJid }),
                },
              );
              avatarUrl = profilePictureUrlFrom(picture);
            } catch {
              // The contact may hide their photo through WhatsApp privacy.
            }
          }
          const realPhoneAlreadyExists = Boolean(
            phone &&
            matches.some((contact) => contact.phone_normalized === phone)
          );
          const realContact = matches.find(
            (contact) => contact.phone_normalized === phone,
          );
          const lidContact = matches.find(
            (contact) => contact.phone_normalized === internalId,
          );
          if (
            realContact &&
            lidContact &&
            realContact.id !== lidContact.id
          ) {
            const merged = await mergeEvolutionContactIdentity(
              accountId,
              realContact.id,
              lidContact.id,
            );
            if (!merged) {
              await supabase
                .from('conversations')
                .update({ contact_id: realContact.id })
                .eq('account_id', accountId)
                .eq('contact_id', lidContact.id);
            }
          }
          for (const match of matches) {
            const replaceInternalId = Boolean(
              phone &&
              internalId &&
              match.phone_normalized === internalId &&
              !realPhoneAlreadyExists
            );
            const { error: updateError } = await supabase
              .from('contacts')
              .update({
                ...(validName ? { name: validName } : {}),
                ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
                ...(replaceInternalId
                  ? { phone }
                  : {}),
              })
              .eq('id', match.id)
              .eq('account_id', accountId);
            if (!updateError) contactsUpdated += 1;
          }
        }

        const pageSize = 100;
        const maxPages = 5;
        const seenMessageIds = new Set<string>();
        for (let page = 1; page <= maxPages; page += 1) {
          const history = await evolution(
            config as ConfigRow,
            `/chat/findMessages/${instance}`,
            {
              method: 'POST',
              body: JSON.stringify({
                where: { key: {} },
                page,
                offset: pageSize,
              }),
            },
          );
          const container = (history.messages ?? history) as
            | Record<string, unknown>
            | EvolutionMessage[];
          const records = Array.isArray(container)
            ? container
            : Array.isArray(container.records)
              ? (container.records as EvolutionMessage[])
              : [];
          if (!records.length) break;

          let newRecordsOnPage = 0;
          for (const message of records) {
            const externalId = message.key?.id || message.id;
            if (externalId && seenMessageIds.has(externalId)) continue;
            if (externalId) seenMessageIds.add(externalId);
            newRecordsOnPage += 1;
            const result = await importEvolutionMessage(accountId, message);
            if (result === 'imported') imported += 1;
            else skipped += 1;
          }
          // Some older Evolution versions ignore `page`. Avoid importing
          // the same first page repeatedly, and stop normally at the end.
          if (newRecordsOnPage === 0 || records.length < pageSize) break;
        }

        // Message history can resolve an old @lid contact to its real phone.
        // Run a second enrichment pass afterwards, otherwise the first pass
        // cannot match that newly repaired phone to findContacts/findChats.
        const { data: repairedContacts } = await supabase
          .from('contacts')
          .select('id, name, phone_normalized, avatar_url')
          .eq('account_id', accountId);
        const identitiesByNumber = new Map<string, EvolutionIdentity>();
        for (const identity of evolutionContacts) {
          const candidates = [
            identity.number,
            identity.remoteJid,
            identity.remoteJidAlt,
            identity.id,
            identity.lastMessage?.key?.remoteJid,
            identity.lastMessage?.key?.remoteJidAlt,
          ];
          for (const candidate of candidates) {
            const digits = String(candidate || '')
              .split('@')[0]
              .replace(/\D/g, '');
            if (digits) identitiesByNumber.set(digits, identity);
          }
        }

        const fetchedPictures = new Map<string, string>();
        const phonesNeedingPicture = (repairedContacts ?? [])
          .filter((contact) => {
            const phone = contact.phone_normalized || '';
            const identity = identitiesByNumber.get(phone);
            return (
              !contact.avatar_url &&
              !identity?.profilePictureUrl &&
              !identity?.profilePicUrl &&
              phone.startsWith('55') &&
              (phone.length === 12 || phone.length === 13)
            );
          })
          .map((contact) => contact.phone_normalized)
          .slice(0, 60);
        for (let index = 0; index < phonesNeedingPicture.length; index += 8) {
          const batch = phonesNeedingPicture.slice(index, index + 8);
          await Promise.all(
            batch.map(async (phone) => {
              try {
                const picture = await evolution(
                  config as ConfigRow,
                  `/chat/fetchProfilePictureUrl/${instance}`,
                  {
                    method: 'POST',
                    body: JSON.stringify({ number: phone }),
                  },
                );
                const url = profilePictureUrlFrom(picture);
                if (url) fetchedPictures.set(phone, url);
              } catch {
                // WhatsApp privacy or an older Evolution release may deny it.
              }
            }),
          );
        }

        for (const contact of repairedContacts ?? []) {
          const phone = contact.phone_normalized || '';
          const identity = identitiesByNumber.get(phone);
          const candidateName = (
            identity?.pushName ||
            identity?.name ||
            identity?.contactName ||
            identity?.savedName ||
            identity?.verifiedName ||
            identity?.notify ||
            identity?.businessName ||
            identity?.lastMessage?.pushName
          )?.trim();
          const genericName =
            !contact.name?.trim() ||
            ['contato do whatsapp', 'desconhecido', 'sem nome', 'você', 'voce', 'you'].includes(
              contact.name.trim().toLowerCase(),
            ) ||
            /^\d{14,}$/.test(contact.name.replace(/\D/g, ''));
          const validName =
            candidateName &&
            !['você', 'voce', 'you'].includes(candidateName.toLowerCase())
              ? candidateName
              : null;
          const avatarUrl =
            identity?.profilePictureUrl ||
            identity?.profilePicUrl ||
            fetchedPictures.get(phone) ||
            null;
          if ((genericName && validName) || (!contact.avatar_url && avatarUrl)) {
            const { error: repairError } = await supabase
              .from('contacts')
              .update({
                ...(genericName && validName ? { name: validName } : {}),
                ...(!contact.avatar_url && avatarUrl
                  ? { avatar_url: avatarUrl }
                  : {}),
              })
              .eq('id', contact.id)
              .eq('account_id', accountId);
            if (!repairError) contactsUpdated += 1;
          }
        }
      } catch (error) {
        importWarning =
          error instanceof Error
            ? error.message
            : 'O histórico não pôde ser consultado';
      }
      return NextResponse.json({
        ok: true,
        imported,
        skipped,
        contacts_updated: contactsUpdated,
        import_warning: importWarning,
      });
    }

    if (body.action === 'connect') {
      try {
        // A maioria dos clientes já cria a instância no Evolution
        // Manager. Consultá-la primeiro também permite que instalações
        // configuradas com chave por instância gerem o QR sem precisar
        // da chave global exigida por /instance/create.
        const connected = await evolution(
          config as ConfigRow,
          `/instance/connect/${instance}`
        );
        await configureWebhook();
        return NextResponse.json({ ok: true, ...qrFrom(connected) });
      } catch (error) {
        const message =
          error instanceof Error ? error.message.toLowerCase() : '';
        const missing =
          message.includes('not found') ||
          message.includes('does not exist') ||
          message.includes('não existe') ||
          message.includes('404');
        if (!missing) throw error;
      }
      const created = await evolution(config as ConfigRow, '/instance/create', {
        method: 'POST',
        body: JSON.stringify({
          instanceName: config.instance_name,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });
      await configureWebhook();
      return NextResponse.json({ ok: true, ...qrFrom(created) });
    }

    if (body.action === 'logout') {
      await evolution(config as ConfigRow, `/instance/logout/${instance}`, {
        method: 'DELETE',
      });
      await supabase
        .from('evolution_config')
        .update({ status: 'disconnected' })
        .eq('account_id', accountId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Falha na Evolution API',
      },
      { status: 500 }
    );
  }
}
