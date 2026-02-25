import { NextResponse } from "next/server";

/**
 * Health check для Timeweb: укажи «Путь проверки состояния» = /api/health.
 * Иначе платформа может слать SIGTERM, если не получает ответ на свой проверочный запрос.
 */
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
