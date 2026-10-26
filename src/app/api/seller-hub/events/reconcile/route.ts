import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { parseEventReconcileInput } from "@/lib/seller-hub/event-history";
import {
  isMissingSellerHubHistoryError,
  readSellerHubEventHistory,
  reconcileSellerHubEventHistory,
} from "@/lib/seller-hub/event-history-server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  // Фоновый режим: интерфейс только читает то, что насчитал сервер.
  const readOnly = body && typeof body === "object" ? (body as { readOnly?: unknown; marketplaceId?: unknown }) : null;
  if (readOnly?.readOnly === true && typeof readOnly.marketplaceId === "string" && readOnly.marketplaceId.length <= 32) {
    try {
      return NextResponse.json({ ok: true, events: await readSellerHubEventHistory(auth.user.id, readOnly.marketplaceId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isMissingSellerHubHistoryError(message)) return NextResponse.json({ ok: false, fallback: true });
      console.error("seller hub event history (read):", message);
      return NextResponse.json({ ok: false, fallback: true }, { status: 500 });
    }
  }
  const input = parseEventReconcileInput(body);
  if (!input) {
    return NextResponse.json({ ok: false, error: "Некорректные данные каталога" }, { status: 400 });
  }

  try {
    const events = await reconcileSellerHubEventHistory(auth.user.id, input);
    return NextResponse.json({ ok: true, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingSellerHubHistoryError(message)) {
      return NextResponse.json({ ok: false, fallback: true });
    }
    console.error("seller hub event history:", message);
    return NextResponse.json({ ok: false, fallback: true }, { status: 500 });
  }
}
