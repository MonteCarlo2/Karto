import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { createOrder, deleteOrder, listOrders, listRuns, markRunsRead, updateOrder } from "@/lib/seller-hub/orders/repository";
import { validateOrderInput } from "@/lib/seller-hub/orders/types";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Поручения владельца и последние запуски. */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const db = createServerClient();
    const [orders, runs] = await Promise.all([listOrders(db, auth.user.id), listRuns(db, auth.user.id)]);
    return NextResponse.json({ ok: true, orders, runs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Поручения не открылись" }, { status: 502 });
  }
}

/** Создать поручение: { input }. Пауза/включить/правка: { id, status } или { id, input }. Удалить: { id, delete: true }. Прочитать запуски: { readRuns: true }. */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { id?: unknown; input?: unknown; status?: unknown; delete?: unknown; readRuns?: unknown } | null;
  if (!body) return NextResponse.json({ ok: false, error: "Неверный запрос" }, { status: 400 });
  const db = createServerClient();
  const nowMs = Date.now();
  try {
    if (body.readRuns === true) {
      await markRunsRead(db, auth.user.id);
      return NextResponse.json({ ok: true });
    }
    if (typeof body.id === "string") {
      if (body.delete === true) {
        await deleteOrder(db, auth.user.id, body.id);
        return NextResponse.json({ ok: true });
      }
      const status = body.status === "active" || body.status === "paused" ? body.status : undefined;
      if (!status && body.input === undefined) return NextResponse.json({ ok: false, error: "Нечего менять" }, { status: 400 });
      const order = await updateOrder(db, auth.user.id, body.id, { status, input: body.input }, nowMs);
      return NextResponse.json({ ok: true, order });
    }
    const parsed = validateOrderInput(body.input);
    if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    const order = await createOrder(db, auth.user.id, parsed.value, nowMs);
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Не получилось" }, { status: 400 });
  }
}
