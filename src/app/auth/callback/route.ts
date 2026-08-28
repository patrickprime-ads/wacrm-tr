import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next");
  const next = requestedNext?.startsWith("/") ? requestedNext : "/painel";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  const errorUrl = new URL("/forgot-password", requestUrl.origin);
  errorUrl.searchParams.set(
    "erro",
    "O link expirou ou já foi utilizado. Solicite um novo link."
  );
  return NextResponse.redirect(errorUrl);
}
