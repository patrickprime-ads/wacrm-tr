import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";

export async function GET() {
  let stage = "START";

  try {
    stage = "CREATE_AUTH_CLIENT";
    const supabase = await createClient();

    stage = "GET_USER";
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return NextResponse.json(
        {
          error: "MASTER_SUMMARY_ERROR",
          stage,
          detail: userError.message,
        },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401 }
      );
    }

    stage = "CHECK_MASTER_ADMIN";
    const {
      data: caller,
      error: callerError,
    } = await supabase
      .from("profiles")
      .select("is_master_admin")
      .eq("user_id", user.id)
      .maybeSingle();

    if (callerError) {
      return NextResponse.json(
        {
          error: "MASTER_SUMMARY_ERROR",
          stage,
          detail: callerError.message,
        },
        { status: 500 }
      );
    }

    if (!caller?.is_master_admin) {
      return NextResponse.json(
        { error: "Acesso exclusivo do Admin Master" },
        { status: 403 }
      );
    }

    stage = "CREATE_ADMIN_CLIENT";
    const db = supabaseAdmin();

    stage = "QUERY_MASTER_DATA";

    const [
      accountsResult,
      profilesResult,
      dealsResult,
      contactsResult,
      conversationsResult,
      featuresResult,
    ] = await Promise.all([
      db.from("accounts").select("id, name, created_at"),
      db.from("profiles").select("account_id, account_role"),
      db.from("deals").select("account_id, status, value, assigned_to"),
      db.from("contacts").select("account_id"),
      db.from("conversations").select("account_id, status"),
      db.from("account_features").select("account_id, plan, enabled_features, agent_enabled_features"),
    ]);

    const queryErrors = [
      { table: "accounts", error: accountsResult.error },
      { table: "profiles", error: profilesResult.error },
      { table: "deals", error: dealsResult.error },
      { table: "contacts", error: contactsResult.error },
      { table: "conversations", error: conversationsResult.error },
      { table: "account_features", error: featuresResult.error },
    ].filter((item) => item.error);

    if (queryErrors.length > 0) {
      console.error('[master-summary] Supabase query failures', {
        stage,
        errors: queryErrors.map((item) => ({
          table: item.table,
          code: item.error?.code,
          message: item.error?.message,
          hint: item.error?.hint,
        })),
      });
      return NextResponse.json(
        {
          error: "MASTER_SUMMARY_ERROR",
          stage,
          detail: queryErrors.map((item) => ({
            table: item.table,
            message: item.error?.message,
          })),
        },
        { status: 500 }
      );
    }

    const accounts = accountsResult.data ?? [];
    const profiles = profilesResult.data ?? [];
    const deals = dealsResult.data ?? [];
    const contacts = contactsResult.data ?? [];
    const conversations = conversationsResult.data ?? [];
    const features = featuresResult.data ?? [];

    stage = "BUILD_SUMMARY";

    const rows = accounts
      .map((account) => {
        const access = features.find((feature) => feature.account_id === account.id);
        const accountDeals = deals.filter(
          (deal) => deal.account_id === account.id
        );

        return {
          id: account.id,
          name: account.name,
          plan: access?.plan ?? "free",
          enabledFeatures: access?.enabled_features ?? [],
          agentEnabledFeatures: access?.agent_enabled_features ?? [],

          sellers: profiles.filter(
            (profile) =>
              profile.account_id === account.id &&
              profile.account_role === "agent"
          ).length,

          contacts: contacts.filter(
            (contact) => contact.account_id === account.id
          ).length,

          conversations: conversations.filter(
            (conversation) =>
              conversation.account_id === account.id &&
              conversation.status !== "closed"
          ).length,

          wonDeals: accountDeals.filter(
            (deal) => deal.status === "won"
          ).length,

          revenue: accountDeals
            .filter((deal) => deal.status === "won")
            .reduce(
              (sum, deal) => sum + Number(deal.value || 0),
              0
            ),

          openPipeline: accountDeals
            .filter((deal) => deal.status === "open")
            .reduce(
              (sum, deal) => sum + Number(deal.value || 0),
              0
            ),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    stage = "SUCCESS";

    return NextResponse.json({
      accounts: rows,

      totals: {
        accounts: rows.length,

        sellers: rows.reduce(
          (sum, row) => sum + row.sellers,
          0
        ),

        revenue: rows.reduce(
          (sum, row) => sum + row.revenue,
          0
        ),

        contacts: rows.reduce(
          (sum, row) => sum + row.contacts,
          0
        ),
      },
    });
  } catch (error) {
    console.error('[master-summary] unexpected failure', { stage, error });
    return NextResponse.json(
      {
        error: "MASTER_SUMMARY_ERROR",
        stage,
        detail:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}
