import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings, StarKey } from "@/lib/auto-replies/settings-types";
import type { GenerateReplyRequest } from "@/lib/auto-replies/reply-generation";
import { generateAutoReply } from "@/lib/auto-replies/generate-auto-reply";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { consumeAutoReplyCredits } from "@/lib/auto-replies-balance";

export const runtime = "nodejs";
export const maxDuration = 60;

const STAR_SET = new Set<StarKey>(["1", "2", "3", "4", "5"]);
const MAX_REVIEW = 20000;
const MAX_HINT = 1200;
const MAX_PREVIOUS_REPLY = 8000;

function parseStar(raw: unknown): StarKey | null {
  const s = String(raw ?? "");
  return STAR_SET.has(s as StarKey) ? (s as StarKey) : null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAutoRepliesUser(request);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    let body: {
      reviewText?: string;
      starRating?: string | number;
      shop?: AutoRepliesShopSettings;
      mp?: AutoRepliesMarketplaceSettings;
      brandName?: string | null;
      buyerName?: string | null;
      productName?: string | null;
      hasReviewPhotos?: boolean;
      revisionHint?: string | null;
      previousReply?: string | null;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });
    }

    const reviewText = String(body.reviewText ?? "").trim();
    const starRating = parseStar(body.starRating);
    const shop = body.shop;
    const mp = body.mp;

    if (!starRating) {
      return NextResponse.json({ error: "Укажите оценку от 1 до 5" }, { status: 400 });
    }
    if (reviewText.length > MAX_REVIEW) {
      return NextResponse.json({ error: "Слишком длинный текст отзыва" }, { status: 400 });
    }
    if (!shop?.style || !shop?.templates || !shop?.training || !shop?.advanced) {
      return NextResponse.json({ error: "Настройки магазина не переданы" }, { status: 400 });
    }
    if (!mp?.usage || !mp?.starRules || !mp?.reviewScope || !mp?.connection) {
      return NextResponse.json({ error: "Настройки маркетплейса не переданы" }, { status: 400 });
    }

    const input: GenerateReplyRequest = {
      reviewText,
      starRating,
      shop,
      mp,
      brandName: body.brandName ?? null,
      buyerName: body.buyerName?.trim() || null,
      productName: body.productName?.trim() || null,
      hasReviewPhotos: Boolean(body.hasReviewPhotos),
      revisionHint: body.revisionHint?.trim().slice(0, MAX_HINT) ?? null,
      previousReply: body.previousReply?.trim().slice(0, MAX_PREVIOUS_REPLY) ?? null,
    };

    if (input.revisionHint && !input.previousReply) {
      return NextResponse.json(
        { error: "Для перегенерации с уточнением нужен предыдущий ответ" },
        { status: 400 }
      );
    }

    const isRegeneration = Boolean(input.previousReply?.trim());
    if (!isRegeneration) {
      const supabase = createServerClient();
      const charge = await consumeAutoReplyCredits(supabase, auth.user.id, 1);
      if (!charge.ok) {
        return NextResponse.json(
          {
            error: charge.error,
            code: charge.code ?? "insufficient_balance",
          },
          {
            status:
              charge.code === "insufficient_balance"
                ? 402
                : charge.code === "rpc_error"
                  ? 503
                  : 402,
          }
        );
      }
    }

    const result = await generateAutoReply(input);

    return NextResponse.json({
      reply: result.reply,
      source: result.source,
      stage: result.stage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auto-replies/generate-reply]", msg);
    return NextResponse.json(
      { error: "Не удалось сгенерировать ответ. Попробуйте ещё раз." },
      { status: 503 }
    );
  }
}
