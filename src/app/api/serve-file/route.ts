import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import sharp from "sharp";
import { getWritableFilePath } from "@/lib/services/image-processing";

/**
 * Отдаёт файлы из /tmp/karto-temp и /tmp/karto-output.
 * GET /api/serve-file?f=uuid.png&dir=temp|output
 * Опционально ?w=400 — отдать уменьшенную версию (для быстрой загрузки галереи).
 */
export async function GET(request: NextRequest) {
  const f = request.nextUrl.searchParams.get("f");
  const dir = request.nextUrl.searchParams.get("dir");
  const widthParam = request.nextUrl.searchParams.get("w");
  if (!f || !dir || (dir !== "temp" && dir !== "output")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (f.includes("/") || f.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  try {
    const filePath = getWritableFilePath(f, dir as "temp" | "output");
    let buffer = await fs.readFile(filePath);
    const maxWidth = widthParam ? Math.min(800, Math.max(200, parseInt(widthParam, 10) || 0)) : 0;

    if (maxWidth > 0) {
      const resized = await sharp(buffer)
        .resize(maxWidth, null, { withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      buffer = Buffer.from(resized);
    }

    return new NextResponse(buffer as Buffer, {
      headers: {
        "Content-Type": maxWidth > 0 ? "image/jpeg" : "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
