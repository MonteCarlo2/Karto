import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resilientFetch } from "@/lib/supabase/resilient-fetch";

/**
 * Ограничение только НЕУДАЧНЫХ попыток (успешный вход счётчик сбрасывает), окно 10 минут, счётчик в памяти (одно приложение).
 * Строго по паре «IP + email», мягче по одному IP и по одному email: чужой человек не может заблокировать вход владельцу аккаунта
 * со своего адреса, а подбор пароля упирается в лимит.
 */
const WINDOW_MS = 10 * 60_000;
const MAX_PAIR = 6;
const MAX_IP = 30;
const MAX_EMAIL = 40;
const MAX_KEYS = 5000;
const fails = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  return (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
}
function blocked(keys: Array<[string, number]>): boolean {
  const now = Date.now();
  return keys.some(([k, max]) => recent(k, now).length >= max);
}
function recordFail(keys: string[]) {
  const now = Date.now();
  for (const k of keys) {
    const list = recent(k, now);
    list.push(now);
    fails.delete(k);
    fails.set(k, list); // порядок вставки = давность: самые старые ключи вытесняем первыми
  }
  while (fails.size > MAX_KEYS) {
    const oldest = fails.keys().next().value;
    if (oldest === undefined) break;
    fails.delete(oldest);
  }
}

/** Адрес клиента: последний элемент X-Forwarded-For добавляет наш прокси, ему можно верить; левые элементы подделывает клиент. */
function clientIp(request: NextRequest): string {
  const parts = (request.headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const candidate = parts[parts.length - 1] ?? request.headers.get("x-real-ip")?.trim() ?? "";
  return /^[0-9a-fA-F:.]{3,45}$/.test(candidate) ? candidate : "unknown";
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

  const ip = clientIp(request);
  const emailKey = email.toLowerCase();
  const pairKey = `pair:${ip}|${emailKey}`;
  const ipKey = `ip:${ip}`;
  const mailKey = `email:${emailKey}`;
  if (blocked([[pairKey, MAX_PAIR], [ipKey, MAX_IP], [mailKey, MAX_EMAIL]])) {
    return NextResponse.json({ ok: false, message: "Слишком много попыток входа. Подождите несколько минут и попробуйте снова." }, { status: 429 });
  }

  const supabase = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: resilientFetch },
  });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      recordFail([pairKey, ipKey, mailKey]);
      return NextResponse.json({
        ok: false,
        // Наружу отдаём только код «email не подтверждён» (нужен форме входа), остальное обобщаем.
        code: (error as { code?: string } | null)?.code === "email_not_confirmed" ? "email_not_confirmed" : null,
        message: (error as { code?: string } | null)?.code === "email_not_confirmed" ? "Email not confirmed" : "Invalid login credentials",
      });
    }
    fails.delete(pairKey);
    fails.delete(mailKey);
    return NextResponse.json({
      ok: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Сервер входа временно недоступен. Попробуйте ещё раз." }, { status: 503 });
  }
}
