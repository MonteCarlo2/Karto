import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { parseTaskStatusPatch } from "@/lib/seller-hub/task-engine/lifecycle";
import { isMissingTaskTableError, updateSellerHubTaskStatus } from "@/lib/seller-hub/task-engine/repository";

const MARKETS = new Set(["wildberries", "ozon", "yandex"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!id || id.length > 80) {
    return NextResponse.json({ ok: false, error: "Некорректные данные" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const marketplaceId =
    body && typeof body === "object" && typeof (body as { marketplaceId?: unknown }).marketplaceId === "string"
      ? (body as { marketplaceId: string }).marketplaceId
      : "";
  if (!MARKETS.has(marketplaceId)) {
    return NextResponse.json({ ok: false, error: "Некорректные данные" }, { status: 400 });
  }

  const parsed = parseTaskStatusPatch(body, Date.now());
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  try {
    const result = await updateSellerHubTaskStatus(auth.user.id, marketplaceId, id, parsed.patch);
    if (!result.ok && result.reason === "missing") {
      return NextResponse.json({ ok: false, error: "Задача не найдена" }, { status: 404 });
    }
    if (!result.ok && result.reason === "closed") {
      return NextResponse.json({ ok: false, error: "Эту задачу уже нельзя изменить" }, { status: 400 });
    }
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: "Статус задачи уже изменился. Обновите список." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, task: result.task });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isMissingTaskTableError(message)) console.error("seller hub task status:", message);
    return NextResponse.json({ ok: false, error: "Не удалось сохранить статус" }, { status: 500 });
  }
}
