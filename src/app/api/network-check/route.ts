import { NextResponse } from "next/server";

const TIMEOUT_MS = 12_000;

async function checkUrl(
  name: string,
  url: string
): Promise<{ name: string; ok: boolean; status?: number; error?: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "Karto-NetworkCheck/1" },
    });
    clearTimeout(t);
    // Любой ответ (200, 401, 404) = сервер достижим
    return { name, ok: true, status: res.status };
  } catch (e: unknown) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return { name, ok: false, error: msg };
  }
}

/**
 * Диагностика: проверка доступа к внешним API из процесса приложения (контейнера).
 * Вызов: GET https://karto.pro/api/network-check (или с сервера после деплоя).
 * Результат покажет, видит ли именно приложение эти хосты (в отличие от curl на хосте).
 */
export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const tasks: Promise<{ name: string; ok: boolean; status?: number; error?: string }>[] = [
    supabaseUrl
      ? checkUrl("Supabase (ваш проект)", `${supabaseUrl.replace(/\/$/, "")}/rest/v1/`)
      : Promise.resolve({ name: "Supabase (ваш проект)", ok: false, error: "SUPABASE_URL не задан" }),
    checkUrl("Replicate API", "https://api.replicate.com/v1/models"),
    checkUrl("KIE AI", "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=diagnostic"),
    checkUrl("KIE Upload", "https://kieai.redpandaai.co/"),
    checkUrl("OpenRouter API", "https://openrouter.ai/api/v1/models"),
  ];

  const results = await Promise.all(tasks);
  const ok = results.filter((r) => r.ok).length;
  const total = results.length;

  return NextResponse.json({
    message: "Проверка из процесса приложения (тот же контейнер, что и API)",
    ok: `${ok}/${total}`,
    results: results.map((r) => ({
      name: r.name,
      ok: r.ok,
      status: r.status,
      error: r.error,
    })),
    hint:
      ok < total
        ? "Если здесь ошибки (timeout, fetch failed), а curl на хосте работает — окружение приложения (контейнер) изолировано от сети. Передайте этот JSON в поддержку Timeweb."
        : "Все проверки прошли.",
  });
}
