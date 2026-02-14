import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { getWritableFilePath } from "@/lib/services/image-processing";

/**
 * Отдаёт файлы из /tmp/karto-temp и /tmp/karto-output (когда в проде нет записи в public).
 * Вызов: GET /api/serve-file?f=uuid.png&dir=temp|output
 */
export async function GET(request: NextRequest) {
  const f = request.nextUrl.searchParams.get("f");
  const dir = request.nextUrl.searchParams.get("dir");
  if (!f || !dir || (dir !== "temp" && dir !== "output")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (f.includes("/") || f.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  try {
    const filePath = getWritableFilePath(f, dir as "temp" | "output");
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
