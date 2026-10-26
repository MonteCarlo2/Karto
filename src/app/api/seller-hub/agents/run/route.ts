import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runAutopayForUser, usersWithAutopay } from "@/lib/seller-hub/ads-autopilot";

export const maxDuration = 120;

function secretOk(request: NextRequest): boolean {
  const expected = process.env.SELLER_HUB_AGENT_SECRET?.trim();
  if (!expected || expected.length < 16) return false;
  const given = request.headers.get("x-agent-secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Серверный проход автопилота агента рекламы (автопополнение). Вызывается планировщиком по расписанию (например, раз в 15 минут)
 * с заголовком x-agent-secret. Без переменной SELLER_HUB_AGENT_SECRET (не короче 16 знаков) маршрут выключен.
 * Тело {"dry": true} — только расчёт, без пополнений (для проверки перед включением).
 * Автопилот работает только у тех, кто сам включил правило в режиме «автопилот».
 */
export async function POST(request: NextRequest) {
  if (!process.env.SELLER_HUB_AGENT_SECRET) {
    return NextResponse.json({ ok: false, error: "Автопилот агента не подключён на сервере" }, { status: 503 });
  }
  if (!secretOk(request)) {
    return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { dry?: unknown };
  const dry = body.dry === true;
  const users = await usersWithAutopay();
  const results = [];
  for (const userId of users) results.push(await runAutopayForUser(userId, dry));
  return NextResponse.json({
    ok: true,
    dry,
    users: results.map((r) => ({ decisions: r.decisions.length, executed: r.executed.length, skipped: r.skipped, error: r.error ?? null })),
  });
}
