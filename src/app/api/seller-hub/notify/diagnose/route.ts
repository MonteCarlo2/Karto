import net from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { getTelegramBotUsername, getTelegramProxyLabel, getTelegramProxyUrl, getTelegramWebhookSecret, isTelegramConfigured } from "@/lib/telegram/config";
import { fetchTelegramLinkByUserId } from "@/lib/telegram/telegram-db";
import { telegramGetMe, telegramGetWebhookInfo } from "@/lib/telegram/bot-api";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** Проверка прокси по шагам без Telegram-токена: достаёт ли сервер до прокси и разрешает ли он соединение с api.telegram.org (ответ на CONNECT). */
function probeProxy(rawUrl: string, limitMs: number): Promise<{ ok: boolean; detail: string; ms: number }> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(rawUrl.startsWith("http") ? rawUrl : `http://${rawUrl}`);
    } catch {
      resolve({ ok: false, detail: "Адрес прокси записан неверно. Нужен вид http://логин:пароль@адрес:порт.", ms: 0 });
      return;
    }
    const socket = net.connect({ host: url.hostname, port: Number(url.port) || 80 });
    let done = false;
    const finish = (ok: boolean, detail: string) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ok, detail, ms: Date.now() - t0 });
    };
    socket.setTimeout(limitMs, () => finish(false, `Сервер прокси не отвечает за ${Math.round(limitMs / 1000)} с: адрес или порт недоступны, прокси выключен или заблокирован.`));
    socket.on("error", (e) => finish(false, `Не удаётся подключиться к прокси: ${e.message}. Проверьте адрес и порт.`));
    socket.on("connect", () => {
      const credentials = url.username ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}` : "";
      const auth = credentials ? `Proxy-Authorization: Basic ${Buffer.from(credentials).toString("base64")}\r\n` : "";
      socket.write(`CONNECT api.telegram.org:443 HTTP/1.1\r\nHost: api.telegram.org:443\r\n${auth}\r\n`);
    });
    socket.on("data", (chunk) => {
      const line = chunk.toString("utf8").split("\r\n")[0] ?? "";
      const code = Number(line.split(" ")[1]);
      if (code === 200) finish(true, "Прокси принял соединение с Telegram.");
      else if (code === 407) finish(false, "Прокси просит другой логин или пароль (ответ 407). Проверьте логин и пароль в TELEGRAM_PROXY.");
      else if (code === 403) finish(false, "Прокси запретил выход на api.telegram.org (ответ 403). Этот прокси не пускает в Telegram: нужен другой.");
      else if (!line.startsWith("HTTP/")) finish(false, "Прокси ответил не как HTTP-прокси. Возможно, это SOCKS-прокси: сайт умеет только HTTP-прокси.");
      else finish(false, `Прокси ответил «${line.slice(0, 80)}».`);
    });
  });
}

type Step = { id: string; title: string; ok: boolean; detail: string; ms?: number };

async function timed<T>(run: () => Promise<T>, limitMs: number): Promise<{ ok: true; value: T; ms: number } | { ok: false; error: string; ms: number }> {
  const t0 = Date.now();
  try {
    const value = await Promise.race([run(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`нет ответа за ${Math.round(limitMs / 1000)} с`)), limitMs))]);
    return { ok: true, value, ms: Date.now() - t0 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), ms: Date.now() - t0 };
  }
}

/**
 * Диагностика Telegram по шагам: настроен ли бот, как он получает сообщения (webhook на сайте или опрос на локальном сервере), доходит ли сервер до Telegram,
 * привязан ли ваш чат. Токены и пароли не показываются, у прокси виден только адрес без логина.
 */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const steps: Step[] = [];

  const configured = isTelegramConfigured();
  steps.push({ id: "token", title: "Токен бота на сервере", ok: configured, detail: configured ? "Задан." : "Не задан TELEGRAM_BOT_TOKEN в .env.local. Бот работать не будет." });

  const polling = process.env.TELEGRAM_POLLING === "1" || process.env.TELEGRAM_POLLING === "true";
  const production = process.env.NODE_ENV === "production";
  const hook = Boolean(process.env.TELEGRAM_WEBHOOK_URL?.trim()) && Boolean(getTelegramWebhookSecret());
  steps.push({
    id: "mode",
    title: "Как бот получает ваши сообщения",
    ok: production ? hook : polling,
    detail: production
      ? hook
        ? "Через webhook: TELEGRAM_WEBHOOK_URL и TELEGRAM_WEBHOOK_SECRET заданы."
        : "Нужны TELEGRAM_WEBHOOK_URL (публичный адрес сайта) и TELEGRAM_WEBHOOK_SECRET. Без них бот не увидит сообщения."
      : polling
        ? "Локальный режим: сервер сам опрашивает Telegram (TELEGRAM_POLLING=1). Работает только пока запущен локальный сервер."
        : "Локально Telegram не может достучаться до localhost. Добавьте TELEGRAM_POLLING=1 в .env.local и перезапустите сервер, либо проверяйте на боевом сайте с webhook.",
  });

  const proxy = getTelegramProxyLabel();
  steps.push({ id: "proxy", title: "Прокси для Telegram", ok: true, detail: proxy ? `Используется: ${proxy.replace(/\/\/[^@]*@/, "//")}` : "Не задан, запросы идут напрямую." });

  const proxyUrl = getTelegramProxyUrl();
  if (proxyUrl) {
    const probe = await probeProxy(proxyUrl, 10_000);
    steps.push({ id: "proxy-probe", title: "Прокси пускает в Telegram", ok: probe.ok, ms: probe.ms, detail: probe.detail });
  }

  if (configured) {
    const me = await timed(() => telegramGetMe(), 20_000);
    steps.push({ id: "reach", title: "Сервер достаёт до Telegram", ok: me.ok, ms: me.ms, detail: me.ok ? `Бот @${me.value.username ?? getTelegramBotUsername()} отвечает за ${(me.ms / 1000).toFixed(1)} с.` : `Нет: ${me.error}. Если задан прокси, он не работает или заблокирован: проверьте TELEGRAM_PROXY, логин и пароль.` });
    if (me.ok) {
      const info = await timed(() => telegramGetWebhookInfo(), 20_000);
      if (info.ok) {
        const w = info.value as { url?: string; pending_update_count?: number; last_error_message?: string };
        steps.push({
          id: "webhook",
          title: "Состояние webhook у Telegram",
          ok: production ? Boolean(w.url) && !w.last_error_message : !w.url,
          detail: w.url ? `Адрес: ${w.url}. Ждут обработки: ${w.pending_update_count ?? 0}.${w.last_error_message ? ` Последняя ошибка Telegram: ${w.last_error_message}` : ""}${production ? "" : " Для локального опроса адрес должен быть пустым: сервер сам его снимет."}` : `Webhook не задан.${(w.pending_update_count ?? 0) > 0 ? ` В очереди сообщений: ${w.pending_update_count}.` : ""}${production ? " На боевом сайте он нужен." : " Для локального опроса так и должно быть."}`,
        });
      } else steps.push({ id: "webhook", title: "Состояние webhook у Telegram", ok: false, ms: info.ms, detail: `Не удалось узнать: ${info.error}` });
    }
  }

  const link = await fetchTelegramLinkByUserId(createServerClient(), auth.user.id).catch(() => null);
  steps.push({ id: "link", title: "Ваш Telegram привязан", ok: Boolean(link) && link?.notify_enabled !== false, detail: link ? (link.notify_enabled === false ? "Привязан, но уведомления выключены: бот был заблокирован. Подключите заново." : `Да${link.username ? `, @${link.username}` : ""}.`) : "Нет. Нажмите «Подключить Telegram» и Start в боте." });

  return NextResponse.json({ ok: true, allOk: steps.every((s) => s.ok), steps });
}
