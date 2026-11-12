import { supabaseAdmin } from "@/lib/flows/admin-client";

export type EvolutionMessage = {
  id?: string;
  key?: {
    id?: string;
    remoteJid?: string;
    remoteJidAlt?: string;
    senderPn?: string;
    senderLid?: string;
    fromMe?: boolean;
  };
  senderPn?: string;
  senderLid?: string;
  pushName?: string;
  messageType?: string;
  messageTimestamp?: number | string;
  message?: Record<string, unknown>;
};

export async function mergeEvolutionContactIdentity(
  accountId: string,
  survivorId: string,
  duplicateId: string,
) {
  const db = supabaseAdmin();
  const { error } = await db.rpc("merge_evolution_contact_identity", {
    p_account_id: accountId,
    p_survivor_id: survivorId,
    p_duplicate_id: duplicateId,
  });
  return !error;
}

function messageText(data: EvolutionMessage) {
  const message = data.message ?? {};
  const extended = message.extendedTextMessage as { text?: string } | undefined;
  const image = message.imageMessage as { caption?: string } | undefined;
  const video = message.videoMessage as { caption?: string } | undefined;
  const document = message.documentMessage as { title?: string; fileName?: string } | undefined;
  return String(
    message.conversation ||
      extended?.text ||
      image?.caption ||
      video?.caption ||
      document?.title ||
      document?.fileName ||
      "",
  );
}

function contentType(data: EvolutionMessage) {
  const type = (data.messageType || Object.keys(data.message ?? {})[0] || "").toLowerCase();
  if (type.includes("image")) return "image";
  if (type.includes("video")) return "video";
  if (type.includes("audio")) return "audio";
  if (type.includes("document")) return "document";
  if (type.includes("location")) return "location";
  return "text";
}

function adReferral(data: EvolutionMessage) {
  // Prime: o "externalAdReply" do anúncio pode vir em qualquer tipo de mensagem (texto, imagem...) ou direto em data.contextInfo.
  type Ad = { title?: string; body?: string; sourceUrl?: string; mediaUrl?: string; thumbnailUrl?: string; originalImageUrl?: string; sourceId?: string; sourceApp?: string; sourceType?: string };
  const achar = (valor: unknown, fundo = 0): Ad | null => {
    if (!valor || typeof valor !== "object" || fundo > 4) return null;
    const r = valor as Record<string, unknown>;
    if (r.externalAdReply && typeof r.externalAdReply === "object") return r.externalAdReply as Ad;
    for (const v of Object.values(r)) { const a = achar(v, fundo + 1); if (a) return a; }
    return null;
  };
  const ad = achar({ m: data.message ?? {}, c: (data as { contextInfo?: unknown }).contextInfo });
  if (!ad) return null;
  const url = ad.sourceUrl || ad.mediaUrl || null;
  const rede = /instagram/i.test(`${ad.sourceApp || ""} ${url || ""}`) ? "instagram" : "facebook";
  return {
    label: ad.title?.trim() || ad.body?.trim() || "Anúncio Meta",
    url,
    rede,
    adId: ad.sourceId ? String(ad.sourceId).slice(0, 60) : null,
    imagem: [ad.originalImageUrl, ad.thumbnailUrl].find((u) => typeof u === 'string' && /^https:\/\//.test(u)) || null,
  };
}

export async function importEvolutionMessage(accountId: string, data: EvolutionMessage) {
  const db = supabaseAdmin();
  const jidCandidates = [
    data.key?.remoteJid,
    data.key?.remoteJidAlt,
    ...(!data.key?.fromMe
      ? [
          data.key?.senderPn,
          data.senderPn,
          data.key?.senderLid,
          data.senderLid,
        ]
      : []),
  ].filter((value): value is string => Boolean(value));
  const jid =
    jidCandidates.find(
      (value) =>
        value.endsWith("@s.whatsapp.net") || value.endsWith("@c.us"),
    ) ||
    jidCandidates.find((value) => !value.endsWith("@lid")) ||
    jidCandidates[0] ||
    "";
  if (jid.endsWith("@g.us") || jid.endsWith("@broadcast")) return "ignored" as const;

  const phone = jid.split("@")[0].replace(/\D/g, "");
  const externalId = data.key?.id || data.id;
  if (!phone || !externalId) return "ignored" as const;

  // Evolution v2 may identify the same person with both a real WhatsApp
  // JID and an internal @lid. Older imports stored the @lid digits as the
  // phone number. Reconcile that legacy contact before the duplicate-message
  // shortcut so a manual history sync can repair existing conversations.
  const realJid = jidCandidates.find(
    (value) =>
      value.endsWith("@s.whatsapp.net") || value.endsWith("@c.us"),
  );
  const lidJid = jidCandidates.find((value) => value.endsWith("@lid"));
  const realPhone = realJid?.split("@")[0].replace(/\D/g, "") || "";
  const lidNumber = lidJid?.split("@")[0].replace(/\D/g, "") || "";
  if (realPhone && lidNumber && realPhone !== lidNumber) {
    const { data: identityMatches } = await db
      .from("contacts")
      .select("id,phone_normalized")
      .eq("account_id", accountId)
      .in("phone_normalized", [realPhone, lidNumber]);
    const realContact = identityMatches?.find(
      (contact) => contact.phone_normalized === realPhone,
    );
    const lidContact = identityMatches?.find(
      (contact) => contact.phone_normalized === lidNumber,
    );
    const inboundName =
      !data.key?.fromMe &&
      data.pushName?.trim() &&
      !["você", "you"].includes(data.pushName.trim().toLowerCase())
        ? data.pushName.trim()
        : null;
    if (lidContact && realContact && lidContact.id !== realContact.id) {
      const merged = await mergeEvolutionContactIdentity(
        accountId,
        realContact.id,
        lidContact.id,
      );
      if (!merged) {
        // Compatibility fallback until migration 040 is installed.
        await db
          .from("conversations")
          .update({ contact_id: realContact.id })
          .eq("account_id", accountId)
          .eq("contact_id", lidContact.id);
      }
      if (inboundName) {
        await db
          .from("contacts")
          .update({ name: inboundName })
          .eq("id", realContact.id);
      }
    } else if (lidContact && !realContact) {
      await db
        .from("contacts")
        .update({
          phone: realPhone,
          ...(inboundName ? { name: inboundName } : {}),
        })
        .eq("id", lidContact.id);
    }
  }

  const { data: duplicate } = await db
    .from("messages")
    .select("id, conversations!inner(account_id)")
    .eq("message_id", externalId)
    .eq("conversations.account_id", accountId)
    .limit(1)
    .maybeSingle();
  if (duplicate) {
    const referral = adReferral(data);
    const inboundName =
      !data.key?.fromMe &&
      data.pushName?.trim() &&
      !["você", "you"].includes(data.pushName.trim().toLowerCase())
        ? data.pushName.trim()
        : null;
    if (referral || inboundName) {
      await db
        .from("contacts")
        .update({
          ...(inboundName ? { name: inboundName } : {}),
          ...(referral
            ? {
                lead_source: "meta_ads",
                source_detail: referral.label,
                source_url: referral.url,
                utm_source: referral.rede,
                ...(referral.adId ? { ad_id: referral.adId } : {}),
                utm_medium: "paid_social",
              }
            : {}),
        })
        .eq("account_id", accountId)
        .eq("phone_normalized", phone);
    }
    return "duplicate" as const;
  }

  const { data: owner } = await db
    .from("profiles")
    .select("user_id")
    .eq("account_id", accountId)
    .in("account_role", ["owner", "admin"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!owner?.user_id) throw new Error("Conta sem proprietário ou administrador");

  let { data: contact } = await db
    .from("contacts")
    .select("id")
    .eq("account_id", accountId)
    .eq("phone_normalized", phone)
    .maybeSingle();
  if (!contact) {
    const referral = adReferral(data);
    const inboundName =
      !data.key?.fromMe &&
      data.pushName?.trim() &&
      !["você", "you"].includes(data.pushName.trim().toLowerCase())
        ? data.pushName.trim()
        : null;
    const created = await db
      .from("contacts")
      .insert({
        account_id: accountId,
        user_id: owner.user_id,
        name: inboundName || phone,
        phone,
        lead_temperature: "frio",
        lead_source: referral ? "meta_ads" : "whatsapp",
        source_detail: referral?.label || "WhatsApp Business",
        source_url: referral?.url || null,
        utm_source: referral ? referral.rede : null,
        ad_id: referral?.adId || null,
        utm_medium: referral ? "paid_social" : null,
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    contact = created.data;
  } else {
    const referral = adReferral(data);
    const inboundName =
      !data.key?.fromMe &&
      data.pushName?.trim() &&
      !["você", "you"].includes(data.pushName.trim().toLowerCase())
        ? data.pushName.trim()
        : null;
    if (referral || inboundName) {
      await db
        .from("contacts")
        .update({
          ...(inboundName ? { name: inboundName } : {}),
          ...(referral
            ? {
                lead_source: "meta_ads",
                source_detail: referral.label,
                source_url: referral.url,
                utm_source: referral.rede,
                ...(referral.adId ? { ad_id: referral.adId } : {}),
                utm_medium: "paid_social",
              }
            : {}),
        })
        .eq("id", contact.id);
    }
  }

  // Prime: miniatura do anúncio (coluna da atualização 055; sem ela, só não guarda).
  const anuncioImg = adReferral(data)?.imagem;
  if (anuncioImg) await db.from("contacts").update({ ad_image_url: anuncioImg }).eq("id", contact.id).then(() => null, () => null);

  let { data: conversation } = await db
    .from("conversations")
    .select("id, unread_count")
    .eq("account_id", accountId)
    .eq("contact_id", contact.id)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conversation) {
    const created = await db
      .from("conversations")
      .insert({
        account_id: accountId,
        user_id: owner.user_id,
        contact_id: contact.id,
        status: "open",
        unread_count: 0,
      })
      .select("id, unread_count")
      .single();
    if (created.error) throw created.error;
    conversation = created.data;
  }

  const text = messageText(data);
  const fallback = `[${data.messageType || "mensagem"}]`;
  const timestamp = Number(data.messageTimestamp || Date.now() / 1000);
  const createdAt = new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000).toISOString();
  const fromMe = data.key?.fromMe === true;
  const { error: messageError } = await db.from("messages").insert({
    conversation_id: conversation.id,
    sender_type: fromMe ? "agent" : "customer",
    sender_id: fromMe ? owner.user_id : null,
    content_type: contentType(data),
    content_text: text || fallback,
    message_id: externalId,
    status: fromMe ? "sent" : "delivered",
    created_at: createdAt,
  });
  if (messageError) throw messageError;

  await db
    .from("conversations")
    .update({
      last_message_text: text || fallback,
      last_message_at: createdAt,
      unread_count: fromMe ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);
  return "imported" as const;
}
