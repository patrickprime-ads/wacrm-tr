export interface DailyReportData {
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
