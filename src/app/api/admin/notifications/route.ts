import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import {
  isAdminStatsConfigured,
  isAdminStatsEmail,
  isAdminStatsSecretProvided,
} from "@/lib/admin/stats-access";

type Category = "message" | "reply" | "news" | "promo";

const CATEGORIES: Category[] = ["message", "reply", "news", "promo"];

function parseImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
    .slice(0, 12);
}

/**
 * POST: отправить уведомление одному пользователю (userId / userEmail) или всем (broadcast).
 * Доступ: те же ADMIN_STATS_EMAILS / ADMIN_STATS_SECRET, что и для статистики.
 */
export async function POST(request: NextRequest) {
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
    const { data: { user }, error } = await userClient.auth.getUser(token);
    if (error || !user?.email || !isAdminStatsEmail(user.email)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
  }

  let body: {
    broadcast?: boolean;
    userId?: string;
    userEmail?: string;
    title?: string;
    body?: string;
    imageUrls?: string[];
    linkUrl?: string;
    category?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!title || title.length > 300) {
    return NextResponse.json({ error: "Заголовок обязателен (до 300 символов)" }, { status: 400 });
  }
  if (!text || text.length > 20000) {
    return NextResponse.json({ error: "Текст обязателен (до 20000 символов)" }, { status: 400 });
  }

  const category = CATEGORIES.includes(body.category as Category)
    ? (body.category as Category)
    : "message";

  const imageUrls = parseImageUrls(body.imageUrls);
  const linkUrl =
    typeof body.linkUrl === "string" && body.linkUrl.trim().startsWith("http")
      ? body.linkUrl.trim().slice(0, 2000)
      : null;

  const supabase = createServerClient();

  if (body.broadcast === true) {
    const { data, error } = await supabase.rpc("admin_notify_all_users", {
      p_title: title,
      p_body: text,
      p_image_urls: imageUrls.length ? imageUrls : [],
      p_link_url: linkUrl,
      p_category: category,
    });

    if (error) {
      console.error("[admin/notifications] broadcast:", error);
      return NextResponse.json(
        {
          error:
            "Рассылка не выполнена. Примените миграцию 20260407_user_notifications.sql и проверьте функцию admin_notify_all_users.",
          details: error.message,
        },
        { status: 500 }
      );
    }

    const inserted = typeof data === "number" ? data : Number(data);
    return NextResponse.json({
      success: true,
      broadcast: true,
      recipients: inserted,
    });
  }

  let userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const email = typeof body.userEmail === "string" ? body.userEmail.trim().toLowerCase() : "";

  if (!userId && email) {
    const { data: found, error: findErr } = await supabase.rpc("find_auth_user_by_email", {
      p_email: email,
    });
    if (findErr) {
      console.error("[admin/notifications] find user:", findErr);
      return NextResponse.json({ error: "Не удалось найти пользователя по email" }, { status: 500 });
    }
    const row = Array.isArray(found) ? found[0] : found;
    if (row?.id) userId = String(row.id);
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Укажите userId, userEmail или broadcast: true" },
      { status: 400 }
    );
  }

  const { data: inserted, error: insErr } = await supabase
    .from("user_notifications")
    .insert({
      user_id: userId,
      title,
      body: text,
      image_urls: imageUrls,
      link_url: linkUrl,
      category,
    })
    .select("id")
    .single();

  if (insErr) {
    console.error("[admin/notifications] insert:", insErr);
    return NextResponse.json(
      { error: "Не удалось создать уведомление", details: insErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    id: inserted?.id,
  });
}
