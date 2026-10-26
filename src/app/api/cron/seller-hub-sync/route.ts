import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSyncRunner } from "@/lib/seller-hub/sync/holder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Ручной или внешний запуск одного «тика» фонового сбора. Обычно не нужен: сервер сам запускает планировщик при старте
 * (src/lib/seller-hub/sync/scheduler.ts, подключён в instrumentation.ts). Маршрут оставлен для проверки вручную и на случай,
 * когда встроенный планировщик выключен (SELLER_HUB_SYNC=0).
 *
 * Authorization: Bearer <CRON_SECRET>. Отвечает сразу, чтение WB продолжается внутри процесса сервера
 * (постоянный Node-сервер, не serverless). Использует тот же воркер, что и планировщик, поэтому дублей проходов не создаёт.
 */

function authorized(request: NextRequest): boolean | "missing-secret" {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return "missing-secret";
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  const ok = authorized(request);
  if (ok === "missing-secret") return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 500 });
  if (!ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const runner = getSyncRunner();
  const { cabinets } = await runner.tick();
  return NextResponse.json({ ok: true, cabinets, running: runner.busyCount() });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
