import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Только development: пишет karto-diagnostics.json в корень проекта.
 * Без токенов — тело уже собрано на клиенте.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Только в development" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Пустое тело" }, { status: 400 });
  }
  const filePath = path.join(process.cwd(), "karto-diagnostics.json");
  await writeFile(filePath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return NextResponse.json({ ok: true, path: filePath });
}
