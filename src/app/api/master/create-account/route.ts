import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Plan } from "@/hooks/use-enabled-features";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Check if user is master admin
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("is_master_admin")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr || !profile?.is_master_admin) {
      return NextResponse.json(
        { error: "Only master admin can create accounts" },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      fullName?: unknown;
      plan?: unknown;
    } | null;

    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const fullName =
      typeof body?.fullName === "string" ? body.fullName.trim() : "";
    const plan =
      typeof body?.plan === "string" ? body.plan : ("pro" as Plan);

    // Validation
    if (!email || !fullName) {
      return NextResponse.json(
        { error: "Email and fullName are required" },
        { status: 400 },
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    if (!["free", "pro", "business", "enterprise"].includes(plan)) {
      return NextResponse.json(
        { error: "Invalid plan" },
        { status: 400 },
      );
    }

    // 1. Create auth user with master admin secret key
    // For this, we need to use the service_role client
    const adminClient = createClient();
    
    // Generate a temporary password
    const tempPassword = Math.random().toString(36).slice(-12);

    // Create the user via admin API (this requires service_role key)
    // NOTE: In production, you might want to use Supabase's admin SDK
    // or handle this differently. For now, we'll create via the regular client
    // and send invitation instead.

    const { data: { user: newUser }, error: createUserErr } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (createUserErr || !newUser) {
      console.error("[create-account] auth error:", createUserErr);
      // If email already exists, we can still proceed but note it
      if (createUserErr?.message?.includes("already exists")) {
        return NextResponse.json(
          { error: "Email already registered" },
          { status: 400 },
        );
      }
      throw createUserErr || new Error("Failed to create user");
    }

    // 2. Create account
    const { data: accountData, error: accountErr } = await supabase
      .from("accounts")
      .insert({
        name: fullName,
        owner_user_id: newUser.id,
        plan,
      })
      .select("id")
      .single();

    if (accountErr || !accountData) {
      console.error("[create-account] account creation error:", accountErr);
      throw accountErr || new Error("Failed to create account");
    }

    // 3. Update profile with account info
    const { error: profileUpdateErr } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        account_id: accountData.id,
        account_role: "owner",
      })
      .eq("user_id", newUser.id);

    if (profileUpdateErr) {
      console.error("[create-account] profile update error:", profileUpdateErr);
      throw profileUpdateErr;
    }

    // 4. Create account features record
    const { error: featuresErr } = await supabase
      .from("account_features")
      .insert({
        account_id: accountData.id,
        plan,
        updated_by_user_id: user.id,
      });

    if (featuresErr) {
      console.error("[create-account] features error:", featuresErr);
      // Not critical, continue
    }

    return NextResponse.json({
      ok: true,
      accountId: accountData.id,
      userId: newUser.id,
      tempPassword, // Only return to master admin in response (not ideal for production)
    });
  } catch (err) {
    console.error("[create-account] error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
