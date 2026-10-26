import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { fetchStocksReport } from "@/lib/services/wildberries/analytics-client";

export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  const stocksReport = await fetchStocksReport(access.token);
  if (stocksReport.error) {
    return NextResponse.json(
      {
        ok: false,
        error: safeSellerHubMessage(stocksReport.error, access.token),
        stocksReport,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, stocksReport });
}
