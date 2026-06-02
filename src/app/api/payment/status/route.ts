import { NextResponse } from "next/server";

/** Публичный флаг: активен ли тестовый магазин ЮKassa (без утечки секрета). */
export async function GET() {
  const key = process.env.YOOKASSA_SECRET_KEY?.trim() ?? "";
  const testMode =
    process.env.YOOKASSA_TEST_MODE === "1" || key.startsWith("test_");
  return NextResponse.json({
    yookassaTestMode: testMode,
    shopId: process.env.YOOKASSA_SHOP_ID ?? null,
  });
}
