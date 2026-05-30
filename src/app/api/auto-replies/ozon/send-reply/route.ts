import { NextRequest, NextResponse } from "next/server";
import { parseApiKey, requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { prepareReplyTextForMarketplace } from "@/lib/auto-replies/reply-postprocess";
import {
  answerOzonReview,
  OzonApiError,
  parseOzonCredentials,
} from "@/lib/services/ozon/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_REPLY_LENGTH = 2000;

export async function POST(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    clientId?: string;
    apiKey?: string;
    reviewId?: string;
    text?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });
  }

  const credentials = parseOzonCredentials({
    clientId: body.clientId,
    apiKey: parseApiKey(body.apiKey),
  });

  if (!credentials) {
    return NextResponse.json({ error: "Укажите Client ID и API Key Ozon" }, { status: 400 });
  }

  const reviewId = String(body.reviewId ?? "").trim();
  const text = prepareReplyTextForMarketplace(String(body.text ?? ""));

  if (!reviewId) {
    return NextResponse.json({ error: "Не указан ID отзыва" }, { status: 400 });
  }
  if (text.length < 2) {
    return NextResponse.json({ error: "Текст ответа слишком короткий" }, { status: 400 });
  }
  if (text.length > MAX_REPLY_LENGTH) {
    return NextResponse.json(
      { error: `Текст ответа не должен превышать ${MAX_REPLY_LENGTH} символов` },
      { status: 400 }
    );
  }

  try {
    await answerOzonReview(credentials, reviewId, text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OzonApiError) {
      return NextResponse.json(
        {
          error: e.message,
          status: e.status,
          premiumPlusRequired: e.premiumPlusRequired,
        },
        { status: e.status >= 400 && e.status < 600 ? e.status : 502 }
      );
    }
    const msg = e instanceof Error ? e.message : "Не удалось отправить ответ";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
