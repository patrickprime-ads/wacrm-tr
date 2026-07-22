import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown; full_name?: unknown; invite_token?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  if (!email || !fullName || password.length < 6) return NextResponse.json({ error: "Preencha nome, e-mail e uma senha de pelo menos 6 caracteres" }, { status: 400 });
  const limit = checkRateLimit(`auth-signup:${email}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!limit.success) return rateLimitResponse(limit);
  try {
    const supabase = await createClient();
    const inviteToken = typeof body?.invite_token === "string" ? body.invite_token : "";
    const origin = new URL(request.url).origin;
    const emailRedirectTo = inviteToken ? `${origin}/join/${encodeURIComponent(inviteToken)}` : `${origin}/dashboard`;
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo } });
    if (error) return NextResponse.json({ error: error.message }, { status: error.status ?? 400 });
    return NextResponse.json({ success: true, requires_email_confirmation: !data.session });
  } catch (error) {
    console.error("[auth/signup] connection error", error);
    return NextResponse.json({ error: "Não foi possível conectar ao Supabase" }, { status: 503 });
  }
}

