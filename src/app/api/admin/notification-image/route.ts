import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import {
  isAdminStatsConfigured,
  isAdminStatsEmail,
  isAdminStatsSecretProvided,
} from "@/lib/admin/stats-access";

const BUCKET = "generated-images";
const PREFIX = "notification-assets";
const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

async function requireAdmin(request: NextRequest): Promise<true | Response> {
  if (!isAdminStatsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Админка не настроена. Задайте ADMIN_STATS_EMAILS или ADMIN_STATS_SECRET на сервере.",
      },
      { status: 503 }
    );
  }

  const secretOk = isAdminStatsSecretProvided(request.headers.get("x-admin-stats-secret"));
  if (!secretOk) {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: "Нужна авторизация или секрет" }, { status: 401 });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });
    }
    const userClient = createClient(url, anon);
    const {
      data: { user },
      error,
    } = await userClient.auth.getUser(token);
    if (error || !user?.email || !isAdminStatsEmail(user.email)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
  }

  return true;
}

/**
 * POST multipart/form-data: поле `file` — картинка для вставки в уведомление.
 * Возвращает публичный URL (bucket generated-images).
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (gate !== true) return gate;

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
    return NextResponse.json({ error: "Файл больше 4 МБ" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  const ext = ALLOWED.get(mime);
  if (!ext) {
    return NextResponse.json(
      { error: "Допустимы PNG, JPEG, WebP, GIF" },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const name = `${PREFIX}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const supabase = createServerClient();
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(name, buf, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    console.error("[admin/notification-image]", upErr);
    return NextResponse.json(
      { error: "Не удалось загрузить в Storage", details: upErr.message },
      { status: 500 }
    );
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(name);
  if (!pub?.publicUrl) {
    return NextResponse.json({ error: "Нет публичного URL bucket" }, { status: 500 });
  }

  return NextResponse.json({ url: pub.publicUrl });
}
