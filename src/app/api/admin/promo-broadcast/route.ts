import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import {
  getAdminStatsSecretExpected,
  isAdminStatsConfigured,
  isAdminStatsEmail,
  isAdminStatsSecretProvided,
} from "@/lib/admin/stats-access";
import { sendHtmlEmailSmtp, isSmtpConfigured } from "@/lib/email/smtp";

type Body = {
  campaignId?: string;
  /** In-app: заголовок и HTML тела уведомления */
  notifyTitle?: string;
  notifyBody?: string;
  notifyLinkUrl?: string;
  /** Email: тема и HTML; подставляется {{PROMO_CODE}} из кампании */
  emailSubject?: string;
  emailHtml?: string;
  sendInApp?: boolean;
  sendEmail?: boolean;
  /** Пауза между письмами (мс), по умолчанию 120 */
  emailThrottleMs?: number;
};

/**
 * GET: подсказка (в браузере открывается именно GET — без этого был бы 405).
 */
export async function GET() {
  return NextResponse.json(
    {
      hint:
        "Не открывайте этот URL в браузере для рассылки. Нужен POST с JSON (campaignId, sendEmail, sendInApp, emailSubject, emailHtml, notifyTitle, notifyBody, …) и заголовок x-admin-stats-secret или Authorization: Bearer. Локально: скопируйте scripts/promo-potok989-rassylka.example.json, затем выполните scripts/send-promo-broadcast.ps1 из корня репозитория.",
    },
    { status: 200 }
  );
}

/**
 * POST: рассылка по promo_campaign_recipients — in-app и/или email (только с opted_in).
 * Доступ: x-admin-stats-secret или Bearer + email из ADMIN_STATS_EMAILS.
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

  const secretHeaderRaw = request.headers.get("x-admin-stats-secret");
  const secretFromClient = secretHeaderRaw?.trim() ?? "";
  const serverSecret = getAdminStatsSecretExpected();

  if (secretFromClient && !serverSecret) {
    return NextResponse.json(
      {
        error:
          "На сервере не задан ADMIN_STATS_SECRET. Укажите ту же строку, что и локально, в переменных окружения Timeweb (или Docker) и перезапустите приложение.",
      },
      { status: 503 }
    );
  }

  const secretOk = isAdminStatsSecretProvided(secretHeaderRaw);
  if (!secretOk) {
    if (secretFromClient && serverSecret) {
      return NextResponse.json(
        {
          error:
            "Неверный x-admin-stats-secret: значение не совпадает с ADMIN_STATS_SECRET на сервере. Проверьте пробелы/кавычки в панели Timeweb и что после изменения env был redeploy/restart.",
        },
        { status: 401 }
      );
    }
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        {
          error:
            "Нужен заголовок x-admin-stats-secret (как в scripts/send-promo-broadcast.ps1) или Authorization: Bearer с сессией админа (email из ADMIN_STATS_EMAIL).",
        },
        { status: 401 }
      );
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });
    }
    const userClient = createClient(url, anon);
    const {
      data: { user },
      error,
    } = await userClient.auth.getUser(token);
    if (error || !user?.email || !isAdminStatsEmail(user.email)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const campaignId = typeof body.campaignId === "string" ? body.campaignId.trim() : "";
  if (!campaignId) {
    return NextResponse.json({ error: "Укажите campaignId" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: campaign, error: campErr } = await supabase
    .from("promo_campaigns")
    .select("id, code")
    .eq("id", campaignId)
    .maybeSingle();

  if (campErr || !campaign) {
    return NextResponse.json(
      { error: "Кампания не найдена. Проверьте UUID и миграцию 20260424." },
      { status: 404 }
    );
  }

  const promoCode = String(campaign.code ?? "").trim();
  const sendInApp = body.sendInApp === true;
  const sendEmail = body.sendEmail === true;
  if (!sendInApp && !sendEmail) {
    return NextResponse.json(
      { error: "Укажите хотя бы одно: sendInApp: true и/или sendEmail: true" },
      { status: 400 }
    );
  }

  let inAppCount: number | null = null;
  if (sendInApp) {
    let title = typeof body.notifyTitle === "string" ? body.notifyTitle.trim() : "";
    let html = typeof body.notifyBody === "string" ? body.notifyBody.trim() : "";
    if (!title || !html) {
      return NextResponse.json(
        { error: "Для in-app укажите notifyTitle и notifyBody (HTML)" },
        { status: 400 }
      );
    }
    title = title.split("{{PROMO_CODE}}").join(promoCode);
    html = html.split("{{PROMO_CODE}}").join(promoCode);
    const linkUrl =
      typeof body.notifyLinkUrl === "string" && body.notifyLinkUrl.startsWith("http")
        ? body.notifyLinkUrl.trim().slice(0, 2000)
        : null;

    const { data: n, error: rpcErr } = await supabase.rpc("admin_notify_promo_campaign_recipients", {
      p_campaign_id: campaignId,
      p_title: title,
      p_body: html,
      p_image_urls: [],
      p_link_url: linkUrl,
      p_replies_enabled: false,
    });

    if (rpcErr) {
      console.error("[admin/promo-broadcast] rpc notify:", rpcErr);
      return NextResponse.json(
        { error: "Не удалось создать уведомления", details: rpcErr.message },
        { status: 500 }
      );
    }
    inAppCount = typeof n === "number" ? n : Number(n);
  }

  let emailSent = 0;
  let emailFailed = 0;
  const throttle = Math.min(5000, Math.max(50, Number(body.emailThrottleMs) || 120));

  if (sendEmail) {
    if (!isSmtpConfigured()) {
      return NextResponse.json(
        { error: "SMTP не настроен — письма не отправлены", inAppCount },
        { status: 503 }
      );
    }
    const subject = typeof body.emailSubject === "string" ? body.emailSubject.trim() : "";
    let html = typeof body.emailHtml === "string" ? body.emailHtml.trim() : "";
    if (!subject || !html) {
      return NextResponse.json(
        { error: "Для email укажите emailSubject и emailHtml" },
        { status: 400 }
      );
    }
    html = html.split("{{PROMO_CODE}}").join(promoCode);

    const { data: emails, error: emErr } = await supabase.rpc("admin_promo_recipient_emails_opted_in", {
      p_campaign_id: campaignId,
    });

    if (emErr) {
      console.error("[admin/promo-broadcast] emails rpc:", emErr);
      return NextResponse.json(
        { error: "Не удалось получить список email", details: emErr.message, inAppCount },
        { status: 500 }
      );
    }

    const list = (emails as { email: string }[] | null)?.map((r) => r.email).filter(Boolean) ?? [];

    for (const to of list) {
      const r = await sendHtmlEmailSmtp({ to, subject, html });
      if (r.ok) emailSent++;
      else {
        emailFailed++;
        console.warn("[admin/promo-broadcast] smtp fail:", to, r.error);
      }
      await new Promise((res) => setTimeout(res, throttle));
    }
  }

  return NextResponse.json({
    success: true,
    campaignId,
    promoCode,
    inAppCount,
    emailSent,
    emailFailed,
  });
}
