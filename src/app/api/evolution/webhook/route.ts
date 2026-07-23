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
      data?: EvolutionMessage | EvolutionMessage[];
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
