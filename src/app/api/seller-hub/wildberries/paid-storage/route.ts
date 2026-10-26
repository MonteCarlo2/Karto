import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";
import { safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import type { SellerPaidStorageSnapshot } from "@/lib/seller-hub/types";
import { fetchPaidStorage } from "@/lib/services/wildberries/analytics-client";

export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let previous: SellerPaidStorageSnapshot | null = null;
  try {
    const body = (await request.json().catch(() => null)) as {
      previous?: SellerPaidStorageSnapshot | null;
    } | null;
    previous = body?.previous ?? null;
  } catch {
    previous = null;
  }

  const paidStorage = await fetchPaidStorage(access.token, previous);
  const waiting =
    paidStorage.status === "pending" || (paidStorage.pendingChunks?.length ?? 0) > 0;
  if (paidStorage.error && !waiting && Object.keys(paidStorage.byNm).length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: safeSellerHubMessage(paidStorage.error, access.token),
        paidStorage,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    paidStorage: {
      ...paidStorage,
      error: paidStorage.error
        ? safeSellerHubMessage(paidStorage.error, access.token)
        : undefined,
    },
  });
}
