import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resilientFetch } from "@/lib/supabase/resilient-fetch";

/**
 * Запасной вход по паролю через наш сервер. Нужен, когда браузер не достучался до Supabase напрямую
 * («Failed to fetch»: блокировка расширением, сбой провайдера или сети). Сервер проверяет пароль у Supabase
 * и отдаёт сессию, браузер её принимает через setSession. Пароль нигде не сохраняется и не пишется в лог.
 */
export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ ok: false, message: "Вход временно недоступен" }, { status: 500 });
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Некорректный запрос" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || email.length > 320 || password.length > 512) {
    return NextResponse.json({ ok: false, message: "Введите email и пароль" }, { status: 400 });
  }

  const supabase = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: resilientFetch },
  });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return NextResponse.json({
        ok: false,
        code: (error as { code?: string } | null)?.code ?? null,
        message: error?.message ?? "Не удалось войти",
      });
    }
    return NextResponse.json({
      ok: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Сервер входа временно недоступен. Попробуйте ещё раз." }, { status: 503 });
  }
}
