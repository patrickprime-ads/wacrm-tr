import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import type { Plan } from "@/hooks/use-enabled-features";

function rpcErrorToResponse(err: PostgrestError): NextResponse {
  if (err.code === "42501") {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err.code === "22023") {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error("[update-features] unexpected RPC error:", err);
  return NextResponse.json(
    { error: "Failed to update features" },
    { status: 500 },
  );
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole("owner");

    const body = (await request.json().catch(() => null)) as {
      plan?: unknown;
      enabledFeatures?: unknown;
    } | null;

    const plan = typeof body?.plan === "string" ? body.plan : null;
    const enabledFeatures = Array.isArray(body?.enabledFeatures)
      ? body.enabledFeatures.filter((f) => typeof f === "string")
      : null;

    if (plan && !["free", "pro", "business", "enterprise"].includes(plan)) {
      return NextResponse.json(
        { error: "Invalid plan value" },
        { status: 400 },
      );
    }

    const { error } = await ctx.supabase.rpc("update_account_features", {
      p_account_id: ctx.accountId,
      p_plan: plan,
      p_enabled_features: enabledFeatures,
    });

    if (error) return rpcErrorToResponse(error);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

// GET endpoint to retrieve current features
export async function GET(request: Request) {
  try {
    const ctx = await requireRole("agent");

    const { data, error } = await ctx.supabase
      .from("account_features")
      .select("plan, enabled_features")
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error("[get-features] error:", error);
      return NextResponse.json(
        { error: "Failed to load features" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      plan: data?.plan ?? "free",
      enabledFeatures: data?.enabled_features ?? [
        "dashboard",
        "contacts",
        "follow_ups",
        "settings",
      ],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
