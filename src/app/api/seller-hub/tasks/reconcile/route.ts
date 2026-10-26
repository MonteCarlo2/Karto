import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { parseTaskReconcileBody } from "@/lib/seller-hub/task-engine/parse";
import { isMissingTaskTableError, reconcileSellerHubTasks } from "@/lib/seller-hub/task-engine/repository";

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

  const input = parseTaskReconcileBody(body);
  if (!input) {
    return NextResponse.json({ ok: false, error: "Некорректные данные каталога" }, { status: 400 });
  }

  try {
    const tasks = await reconcileSellerHubTasks(auth.user.id, input);
    return NextResponse.json({ ok: true, tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isMissingTaskTableError(message)) console.error("seller hub tasks:", message);
    return NextResponse.json({ ok: false, fallback: true }, { status: isMissingTaskTableError(message) ? 200 : 500 });
  }
}
