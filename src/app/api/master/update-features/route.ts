import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { ALL_FEATURES } from "@/lib/features";

function rpcErrorToResponse(err: PostgrestError): NextResponse {
  if (err.code === "42501") {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err.code === "22023") {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error("[master-update-features] unexpected RPC error:", err);
  return NextResponse.json(
    { error: "Failed to update features" },
    { status: 500 },
  );
}

export async function PATCH(request: Request) {
  try {
    // Get the current user context
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is master admin
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("is_master_admin")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr || !profile?.is_master_admin) {
      return NextResponse.json(
        { error: "Only master admin can update features" },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      accountId?: unknown;
      plan?: unknown;
      enabledFeatures?: unknown;
      agentEnabledFeatures?: unknown;
    } | null;

    const accountId = typeof body?.accountId === "string" ? body.accountId : null;
    const plan = typeof body?.plan === "string" ? body.plan : null;
    const enabledFeatures = Array.isArray(body?.enabledFeatures)
      ? body.enabledFeatures.filter((f) => typeof f === "string")
      : null;
    const agentEnabledFeatures = Array.isArray(body?.agentEnabledFeatures)
      ? body.agentEnabledFeatures.filter((f) => typeof f === "string")
      : null;

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 },
      );
    }

    if (plan && !["free", "pro", "business", "enterprise"].includes(plan)) {
      return NextResponse.json(
        { error: "Invalid plan value" },
        { status: 400 },
      );
    }

    const validFeatures = new Set<string>(ALL_FEATURES);
    if (enabledFeatures?.some((feature) => !validFeatures.has(feature)) || agentEnabledFeatures?.some((feature) => !validFeatures.has(feature))) {
      return NextResponse.json({ error: "Recurso inválido" }, { status: 400 });
    }
    if (enabledFeatures && agentEnabledFeatures?.some((feature) => !enabledFeatures.includes(feature))) {
      return NextResponse.json({ error: "O vendedor não pode receber um menu bloqueado para a empresa" }, { status: 400 });
    }

    const update: Record<string, unknown> = { updated_by_user_id: user.id };
    if (plan) update.plan = plan;
    if (enabledFeatures) update.enabled_features = enabledFeatures;
    if (agentEnabledFeatures) update.agent_enabled_features = agentEnabledFeatures;
    const { error } = await supabase.from("account_features").update(update).eq("account_id", accountId);
    if (!error && plan) await supabase.from("accounts").update({ plan }).eq("id", accountId);

    if (error) return rpcErrorToResponse(error);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[master-update-features] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
