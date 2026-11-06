import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/account";
import { evolutionRequest, type EvolutionConfig } from "@/lib/evolution/client";
import { formatCurrency } from "@/lib/currency";
import type { DailyReportData } from "@/types/reports";

/**
 * Formata o relatório em texto para WhatsApp
 */
function formatReportForWhatsApp(
  report: DailyReportData,
  accountName: string,
): string {
  const startDate = new Date(report.period.start).toLocaleDateString("pt-BR");
  const endDate = new Date(report.period.end).toLocaleDateString("pt-BR");

  const lines = [
    "📊 RESUMO DO PERÍODO",
    "",
    `📅 ${startDate} a ${endDate}`,
    "",
    `📥 Leads que entraram: ${report.leads_in}`,
    `✅ Vendas fechadas: ${report.deals_won}`,
    `💰 Valor fechado: ${formatCurrency(report.revenue)}`,
    `🎯 Conversão: ${(report.conversion_rate * 100).toFixed(1)}%`,
    "",
    "📌 Situação atual dos leads que entraram:",
    `🆕 Novos: ${report.lead_statuses.new}`,
    `🤝 Em negociação: ${report.lead_statuses.negotiating}`,
    `❌ Perdidos: ${report.lead_statuses.lost}`,
    `🚫 Sem retorno: ${report.lead_statuses.no_return}`,
    "",
    "👩‍💼 Consultoras:",
  ];

  // Add consultants
  if (report.consultants.length > 0) {
    report.consultants.forEach((c) => {
      lines.push(
        `* ${c.name}: ${c.leads} leads | ${c.deals_won} vendas | ${formatCurrency(c.revenue)}`,
      );
    });
  } else {
    lines.push("* Sem dados de consultoras");
  }

  return lines.join("\n");
}

interface SendReportRequest {
  start_date: string;
  end_date: string;
  phone_numbers?: string[]; // optional: specific recipients
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("owner");

    const body = (await request.json().catch(() => null)) as SendReportRequest | null;

    if (!body?.start_date || !body?.end_date) {
      return NextResponse.json(
        { error: "start_date and end_date are required" },
        { status: 400 },
      );
    }

    // 1. Fetch the report data
    const reportRes = await fetch(
      `${new URL(request.url).origin}/api/reports/daily-summary?start_date=${encodeURIComponent(body.start_date)}&end_date=${encodeURIComponent(body.end_date)}`,
      {
        headers: {
          Authorization: request.headers.get("Authorization") || "",
        },
      },
    );

    if (!reportRes.ok) {
      throw new Error("Failed to fetch report data");
    }

    const report = (await reportRes.json()) as DailyReportData;

    // 2. Get account info
    const { data: account } = await ctx.supabase
      .from("accounts")
      .select("name")
      .eq("id", ctx.accountId)
      .single();

    const accountName = account?.name || "Empresa";

    // 3. Format message
    const message = formatReportForWhatsApp(report, accountName);

    // 4. Get Evolution config or WhatsApp config
    const { data: evolutionConfig } = await ctx.supabase
      .from("evolution_config")
      .select("server_url, api_key_encrypted, instance_name, status")
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (!evolutionConfig) {
      return NextResponse.json(
        {
          error:
            "WhatsApp não está configurado. Por favor configure a Evolution API",
        },
        { status: 400 },
      );
    }

    if (evolutionConfig.status !== "open") {
      return NextResponse.json(
        { error: "WhatsApp não está conectado" },
        { status: 400 },
      );
    }

    // 5. Get recipient phone numbers (default: account owner's phone from profile)
    let recipients = body.phone_numbers || [];

    if (recipients.length === 0) {
      // Try to get owner's phone from contact
      const { data: ownerProfile } = await ctx.supabase
        .from("profiles")
        .select("id")
        .eq("account_id", ctx.accountId)
        .eq("account_role", "owner")
        .single();

      // For now, we'll just return an error asking for phone numbers
      // In production, you might store phone numbers in the account or profile
      if (!recipients.length) {
        return NextResponse.json(
          {
            error:
              "Nenhum número de telefone fornecido. Adicione phone_numbers na requisição",
          },
          { status: 400 },
        );
      }
    }

    // 6. Send via Evolution for each recipient
    const instance = encodeURIComponent(evolutionConfig.instance_name);
    const sentTo = [];
    const errors = [];

    for (const phone of recipients) {
      try {
        await evolutionRequest(
          evolutionConfig as EvolutionConfig,
          `/message/sendText/${instance}`,
          {
            method: "POST",
            body: JSON.stringify({
              number: phone,
              text: message,
            }),
          },
        );
        sentTo.push(phone);
      } catch (err) {
        errors.push({
          phone,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message_preview: message,
      sent_to: sentTo,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[send-daily-report] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
