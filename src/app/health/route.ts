import { NextResponse } from "next/server";

/** Дублирует /api/health — некоторые панели (Timeweb) проверяют /health по умолчанию. */
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
