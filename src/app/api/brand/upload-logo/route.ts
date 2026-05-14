import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

const BUCKET = "generated-images";
const PREFIX = "brand-logos";
const MAX_BYTES = 5 * 1024 * 1024;

const MIME_TO_EXT = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
  ["image/gif", "gif"],
]);

function resolveExtAndMime(fileName: string, reportedMime: string): { ext: string; mime: string } | null {
  const primary = MIME_TO_EXT.get(reportedMime);
  if (primary) return { ext: primary, mime: reportedMime };

  const lower = fileName.toLowerCase();
  const byName: Record<string, { ext: string; mime: string }> = {
    ".png": { ext: "png", mime: "image/png" },
    ".jpg": { ext: "jpg", mime: "image/jpeg" },
    ".jpeg": { ext: "jpg", mime: "image/jpeg" },
    ".webp": { ext: "webp", mime: "image/webp" },
    ".svg": { ext: "svg", mime: "image/svg+xml" },
    ".gif": { ext: "gif", mime: "image/gif" },
  };
  for (const [suffix, v] of Object.entries(byName)) {
    if (lower.endsWith(suffix)) return v;
  }

  const octet = reportedMime === "application/octet-stream" || !reportedMime;
  if (octet && lower.endsWith(".png")) return { ext: "png", mime: "image/png" };
  return null;
}

/**
 * multipart/form-data — поле `file`: загрузка логотипа бренда в Storage.
 * Требует Bearer access token текущего пользователя.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Сервер не настроен" }, { status: 500 });
  }

  const userClient = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(token);
  if (userErr || !user?.id) {
    return NextResponse.json({ error: "Сессия недействительна" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ожидается multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Добавьте файл (поле file)" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Файл не больше 5 МБ" }, { status: 400 });
  }

  const originalName =
    file instanceof File && typeof file.name === "string" ? file.name : "logo.bin";
  const reportedMime = file.type || "application/octet-stream";
  const resolved = resolveExtAndMime(originalName, reportedMime);
  if (!resolved) {
    return NextResponse.json(
      { error: "Допустимы PNG, JPEG, WebP, SVG, GIF" },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const objectPath = `${PREFIX}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${resolved.ext}`;

  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json({ error: "Сервер не настроен (Storage)" }, { status: 500 });
  }

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectPath, buf, {
    contentType: resolved.mime,
    upsert: false,
  });

  if (upErr) {
    console.error("[brand/upload-logo]", upErr);
    return NextResponse.json(
      { error: "Не удалось загрузить файл", details: upErr.message },
      { status: 500 }
    );
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  if (!pub?.publicUrl) {
    return NextResponse.json({ error: "Нет публичного URL" }, { status: 500 });
  }

  return NextResponse.json({ url: pub.publicUrl });
}
