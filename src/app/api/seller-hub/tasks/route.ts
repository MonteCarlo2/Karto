import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { isMissingTaskTableError, listSellerHubTasks } from "@/lib/seller-hub/task-engine/repository";

const MARKETS = new Set(["wildberries", "ozon", "yandex"]);

export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false }, { status: auth.status });
  }

  const marketplaceId = request.nextUrl.searchParams.get("marketplaceId") ?? "";
  if (!MARKETS.has(marketplaceId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const tasks = await listSellerHubTasks(auth.user.id, marketplaceId);
    return NextResponse.json({ ok: true, tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isMissingTaskTableError(message)) console.error("seller hub tasks list:", message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
