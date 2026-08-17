import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/account";

interface DailyReportData {
  period: {
    start: string;
    end: string;
  };
  leads_in: number;
  deals_won: number;
  revenue: number;
  conversion_rate: number;
  lead_statuses: {
    new: number;
    negotiating: number;
    lost: number;
    no_return: number;
  };
  consultants: Array<{
    name: string;
    leads: number;
    deals_won: number;
    revenue: number;
  }>;
}

/**
 * Gera relatório diário de vendas.
 * Retorna dados formatados para WhatsApp.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireRole("agent");

    const url = new URL(request.url);
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "start_date and end_date are required" },
        { status: 400 },
      );
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 },
      );
    }

    // 1. Get leads that entered in the period
    const { data: leadsIn, error: leadsErr } = await ctx.supabase
      .from("contacts")
      .select("id, name, lead_temperature, classification")
      .eq("account_id", ctx.accountId)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    if (leadsErr) throw leadsErr;

    const leadsCount = leadsIn?.length || 0;

    // 2. Get deals closed in the period
    const { data: deals, error: dealsErr } = await ctx.supabase
      .from("deals")
      .select("id, value, status, contact_id, user_id, profiles!deals_user_id_fkey(full_name)")
      .eq("account_id", ctx.accountId)
      .eq("status", "won")
      .gte("updated_at", start.toISOString())
      .lte("updated_at", end.toISOString());

    if (dealsErr) throw dealsErr;

    const dealsWon = deals?.length || 0;
    const totalRevenue = deals?.reduce((sum, d) => sum + (d.value || 0), 0) || 0;

    // 3. Lead statuses
    const leadStatuses = {
      new: leadsIn?.filter((l) => !l.lead_temperature || l.lead_temperature === "frio").length || 0,
      negotiating: leadsIn?.filter((l) => l.lead_temperature === "morno").length || 0,
      lost: leadsIn?.filter((l) => l.classification === "perdido").length || 0,
      no_return: leadsIn?.filter(
        (l) =>
          l.classification === "sem_retorno" || 
          l.lead_temperature === "frio"
      ).length || 0,
    };

    // 4. Group by consultant
    const consultantMap = new Map<
      string,
      { name: string; leads: number; deals: number; revenue: number }
    >();

    // Count leads per user
    const { data: leadUsers, error: leadUsersErr } = await ctx.supabase
      .from("contacts")
      .select("user_id, profiles!contacts_user_id_fkey(full_name)")
      .eq("account_id", ctx.accountId)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    if (!leadUsersErr && leadUsers) {
      leadUsers.forEach((item: any) => {
        const userId = item.user_id;
        const userName = item.profiles?.full_name || "Desconhecido";
        const existing = consultantMap.get(userId) || {
          name: userName,
          leads: 0,
          deals: 0,
          revenue: 0,
        };
        existing.leads += 1;
        consultantMap.set(userId, existing);
      });
    }

    // Add deals per user
    deals?.forEach((deal: any) => {
      const userId = deal.user_id;
      const userName =
        deal.profiles?.full_name || "Desconhecido";
      const existing = consultantMap.get(userId) || {
        name: userName,
        leads: 0,
        deals: 0,
        revenue: 0,
      };
      existing.deals += 1;
      existing.revenue += deal.value || 0;
      consultantMap.set(userId, existing);
    });

    const consultants = Array.from(consultantMap.values());
    const conversionRate =
      leadsCount > 0 ? Math.round((dealsWon / leadsCount) * 100) / 100 : 0;

    const report: DailyReportData = {
      period: {
        start: startDate,
        end: endDate,
      },
      leads_in: leadsCount,
      deals_won: dealsWon,
      revenue: totalRevenue,
      conversion_rate: conversionRate,
      lead_statuses: leadStatuses,
      consultants: consultants.sort((a, b) => b.leads - a.leads),
    };

    return NextResponse.json(report);
  } catch (err) {
    console.error("[daily-summary] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
