import { NextRequest, NextResponse } from "next/server";
import { parseApiKey, requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { prepareReplyTextForMarketplace } from "@/lib/auto-replies/reply-postprocess";
import { answerWildberriesFeedback, WildberriesApiError } from "@/lib/services/wildberries/client";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { apiKey?: string; feedbackId?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });
  }

  const apiKey = parseApiKey(body.apiKey);
  const feedbackId = String(body.feedbackId ?? "").trim();
  const text = prepareReplyTextForMarketplace(String(body.text ?? ""));

  if (!apiKey) {
    return NextResponse.json({ error: "Укажите API-токен Wildberries" }, { status: 400 });
  }
  if (!feedbackId) {
    return NextResponse.json({ error: "Не указан ID отзыва" }, { status: 400 });
  }
  if (text.length < 2) {
    return NextResponse.json({ error: "Текст ответа слишком короткий" }, { status: 400 });
  }
  if (text.length > 5000) {
    return NextResponse.json({ error: "Текст ответа не должен превышать 5000 символов" }, { status: 400 });
  }

  try {
    await answerWildberriesFeedback({ token: apiKey, feedbackId, text });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof WildberriesApiError) {
      return NextResponse.json(
        { error: e.message, status: e.status },
        { status: e.status >= 400 && e.status < 600 ? e.status : 502 }
      );
    }
    const msg = e instanceof Error ? e.message : "Не удалось отправить ответ";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
