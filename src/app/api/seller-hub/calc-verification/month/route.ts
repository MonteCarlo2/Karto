import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken, wbRouteError } from "@/lib/seller-hub/wb-token-http";
import { buildMonthReconcile } from "@/lib/seller-hub/diagnostics";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { WildberriesApiError } from "@/lib/services/wildberries/client";
import {
  fetchBankPaymentSumForMonth,
  fetchRealizationMarginBundle,
} from "@/lib/services/wildberries/realization-margin";

export const maxDuration = 180;

function lastFullMonth(now = new Date()): { from: string; to: string; label: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based current
  const fromDate = new Date(Date.UTC(y, m - 1, 1));
  const toDate = new Date(Date.UTC(y, m, 0));
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);
  return { from, to, label: from.slice(0, 7) };
}

export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      snapshot?: SellerCatalogSnapshot;
      monthFrom?: string;
      monthTo?: string;
    };
    const period =
      body.monthFrom && body.monthTo
        ? { from: body.monthFrom, to: body.monthTo, label: body.monthFrom.slice(0, 7) }
        : lastFullMonth();

    const bundle = await fetchRealizationMarginBundle(access.token);
    const bank = await fetchBankPaymentSumForMonth(access.token, period.from, period.to);
    const facts = body.snapshot
      ? taskFactsFromSnapshot({
          ...body.snapshot,
          realization: body.snapshot.realization ?? bundle.snapshot,
        }).products
      : taskFactsFromSnapshot({
          marketplaceId: "wildberries",
          items: [],
          syncedAt: new Date().toISOString(),
          totalCount: 0,
          realization: bundle.snapshot,
        }).products;

    const month = buildMonthReconcile({
      rawRows: bundle.rawRows,
      facts,
      monthFrom: period.from,
      monthTo: period.to,
      bankPaymentSum: bank.sum,
      bankReports: bank.reports,
      bankError: bank.error ?? null,
    });

    return NextResponse.json({ ok: true, month });
  } catch (error) {
    if (error instanceof WildberriesApiError) {
      return wbRouteError(error, access.token, error.status >= 400 ? error.status : 502);
    }
    throw error;
  }
}
