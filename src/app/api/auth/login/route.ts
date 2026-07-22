import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return NextResponse.json({ error: "Informe e-mail e senha" }, { status: 400 });
  const limit = checkRateLimit(`auth-login:${email}`, { limit: 10, windowMs: 15 * 60_000 });
  if (!limit.success) return rateLimitResponse(limit);
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return NextResponse.json({ error: error.message }, { status: error.status ?? 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/login] connection error", error);
    return NextResponse.json({ error: "Não foi possível conectar ao Supabase" }, { status: 503 });
  }
}
