import { NextResponse } from "next/server";
import { decrypt } from "@/lib/whatsapp/encryption";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { importEvolutionMessage, type EvolutionMessage } from "@/lib/evolution/inbox";

export async function POST(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    const payload = await request.json() as {
      event?: string;
      instance?: string;
      data?:
        | EvolutionMessage
        | EvolutionMessage[]
        | EvolutionContact
        | EvolutionContact[];
    };
    if (!token || !payload.instance) {
      return NextResponse.json({ error: "Webhook inválido" }, { status: 401 });
    }

    const db = supabaseAdmin();
    const { data: config } = await db
      .from("evolution_config")
      .select("account_id, webhook_secret_encrypted")
      .eq("instance_name", payload.instance)
      .maybeSingle();
    if (!config?.webhook_secret_encrypted || decrypt(config.webhook_secret_encrypted) !== token) {
      return NextResponse.json({ error: "Webhook não autorizado" }, { status: 401 });
    }

    const event = (payload.event || "")
      .toLowerCase()
      .replaceAll("_", ".")
      .replaceAll("-", ".");
    if (event === "connection.update") {
      const state = String((payload.data as { state?: string })?.state || "disconnected");
      await db.from("evolution_config").update({ status: state }).eq("account_id", config.account_id);
      return NextResponse.json({ ok: true });
    }
    if (
      event === "contacts.upsert" ||
      event === "contacts.set" ||
      event === "contacts.update"
    ) {
      const contacts = Array.isArray(payload.data)
        ? (payload.data as EvolutionContact[])
        : payload.data
          ? [payload.data as EvolutionContact]
          : [];
      let updated = 0;
      for (const contact of contacts) {
        const phone = digits(contact.number);
        const internalId = digits(contact.id);
        const identifiers = [...new Set([phone, internalId].filter(Boolean))];
        if (!identifiers.length) continue;
        const { data: matches } = await db
          .from("contacts")
          .select("id,phone_normalized")
          .eq("account_id", config.account_id)
          .in("phone_normalized", identifiers);
        const realPhoneAlreadyExists = Boolean(
          phone &&
            matches?.some((match) => match.phone_normalized === phone),
        );
        for (const match of matches ?? []) {
          const name = (contact.pushName || contact.name)?.trim();
          const avatar =
            contact.profilePictureUrl || contact.profilePicUrl || null;
          const replaceInternalId = Boolean(
            phone &&
              internalId &&
              match.phone_normalized === internalId &&
              !realPhoneAlreadyExists,
          );
          const { error } = await db
            .from("contacts")
            .update({
              ...(name && !["você", "you"].includes(name.toLowerCase())
                ? { name }
                : {}),
              ...(avatar ? { avatar_url: avatar } : {}),
              ...(replaceInternalId
                ? { phone, phone_normalized: phone }
                : {}),
            })
            .eq("id", match.id);
          if (!error) updated += 1;
        }
      }
      return NextResponse.json({ ok: true, updated });
    }
    if (event !== "messages.upsert" && event !== "messages.set") {
      return NextResponse.json({ ok: true });
    }

    const messages = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
    let imported = 0;
    for (const message of messages) {
      if (await importEvolutionMessage(config.account_id, message) === "imported") imported += 1;
    }
    return NextResponse.json({ ok: true, imported });
  } catch (error) {
    console.error("[evolution/webhook]", error);
    return NextResponse.json({ error: "Falha ao processar evento" }, { status: 500 });
  }
}

type EvolutionContact = {
  id?: string;
  number?: string;
  pushName?: string;
  name?: string;
  profilePictureUrl?: string | null;
  profilePicUrl?: string | null;
};

function digits(value?: string) {
  return String(value || "")
    .split("@")[0]
    .replace(/\D/g, "");
}
