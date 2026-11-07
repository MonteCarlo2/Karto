import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resilientFetch } from "@/lib/supabase/resilient-fetch";

/** Ограничение попыток: считаем в памяти сервера (одно приложение), окно 10 минут. Против подбора пароля через этот маршрут. */
const WINDOW_MS = 10 * 60_000;
const MAX_PER_IP = 20;
const MAX_PER_EMAIL = 8;
const hits = new Map<string, number[]>();

function tooMany(key: string, max: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return list.length > max;
}

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

  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim();
  if (tooMany(`ip:${ip}`, MAX_PER_IP) || tooMany(`email:${email.toLowerCase()}`, MAX_PER_EMAIL)) {
    return NextResponse.json({ ok: false, message: "Слишком много попыток входа. Подождите несколько минут и попробуйте снова." }, { status: 429 });
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
        // Наружу отдаём только код «email не подтверждён» (нужен форме входа), остальное обобщаем.
        code: (error as { code?: string } | null)?.code === "email_not_confirmed" ? "email_not_confirmed" : null,
        message: (error as { code?: string } | null)?.code === "email_not_confirmed" ? "Email not confirmed" : "Invalid login credentials",
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
