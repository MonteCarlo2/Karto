import { NextRequest, NextResponse } from "next/server";

import { parseApiKey, requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";

import { prepareReplyTextForMarketplace } from "@/lib/auto-replies/reply-postprocess";

import {

  answerYandexGoodsFeedback,

  fetchYandexCampaigns,

  parseYandexCredentials,

  resolveYandexCampaign,

  YandexApiError,

} from "@/lib/services/yandex/client";



export const runtime = "nodejs";

export const maxDuration = 60;



export async function POST(request: NextRequest) {

  const auth = await requireAutoRepliesUser(request);

  if (!auth.user) {

    return NextResponse.json({ error: auth.error }, { status: auth.status });

  }



  let body: {

    apiKey?: string;

    campaignId?: string;

    businessId?: string;

    feedbackId?: string;

    text?: string;

  };



  try {

    body = await request.json();

  } catch {

    return NextResponse.json({ error: "Нужен JSON-тело запроса" }, { status: 400 });

  }



  const parsed = parseYandexCredentials({

    apiKey: parseApiKey(body.apiKey),

    campaignId: body.campaignId,

    businessId: body.businessId,

  });



  if (!parsed) {

    return NextResponse.json({ error: "Укажите токен и Campaign ID Яндекс Маркета" }, { status: 400 });

  }



  const feedbackId = Number(body.feedbackId);

  const text = prepareReplyTextForMarketplace(String(body.text ?? ""));



  if (!Number.isFinite(feedbackId) || feedbackId <= 0) {

    return NextResponse.json({ error: "Не указан ID отзыва" }, { status: 400 });

  }

  if (text.length < 2) {

    return NextResponse.json({ error: "Текст ответа слишком короткий" }, { status: 400 });

  }

  if (text.length > 4096) {

    return NextResponse.json({ error: "Текст ответа не должен превышать 4096 символов" }, { status: 400 });

  }



  let businessId = parsed.businessId?.trim();

  if (!businessId) {

    try {

      const campaigns = await fetchYandexCampaigns(parsed.apiKey);

      const campaign = resolveYandexCampaign(campaigns, parsed.campaignId);

      businessId = campaign?.business?.id ? String(campaign.business.id) : undefined;

    } catch (e) {

      const message = e instanceof YandexApiError ? e.message : "Не удалось определить кабинет";

      return NextResponse.json({ error: message }, { status: 502 });

    }

  }



  if (!businessId) {

    return NextResponse.json(

      { error: "Не найден businessId. Нажмите «Проверить подключение» в разделе «Кабинет и API»." },

      { status: 400 }

    );

  }



  try {

    await answerYandexGoodsFeedback(

      {

        apiKey: parsed.apiKey,

        campaignId: parsed.campaignId,

        businessId,

      },

      feedbackId,

      text

    );

    return NextResponse.json({ ok: true });

  } catch (e) {

    if (e instanceof YandexApiError) {

      return NextResponse.json(

        { error: e.message, status: e.status },

        { status: e.status >= 400 && e.status < 600 ? e.status : 502 }

      );

    }

    const msg = e instanceof Error ? e.message : "Не удалось отправить ответ";

    return NextResponse.json({ error: msg }, { status: 503 });

  }

}


