import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAnonServerClient } from "@/lib/supabase/anon-server";
import {
  generateFourDigitCode,
  hashSignupCode,
  MAX_RESEND_CLICKS,
  RESEND_COOLDOWN_MS,
  SIGNUP_CODE_TTL_MS,
} from "@/lib/auth/signup-verification";
import { sendSignupVerificationEmail } from "@/lib/send-signup-verification-email";

async function findUserByEmail(
  admin: ReturnType<typeof createServerClient>,
  email: string
): Promise<{
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
} | null> {
  const lower = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === lower);
    if (u) return u;
    if (data.users.length < perPage) break;
    page++;
  }
  return null;
}

function isUnconfirmedLoginError(err: { message?: string } | null): boolean {
  const m = (err?.message || "").toLowerCase();
  return (
    m.includes("email not confirmed") ||
    m.includes("not confirmed") ||
    m.includes("email_not_confirmed")
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!emailRaw?.includes("@") || !password) {
      return NextResponse.json({ success: false, error: "Укажите email и пароль" }, { status: 400 });
    }

    const email = emailRaw.toLowerCase();
    const anon = createAnonServerClient();
    const { data: signData, error: signErr } = await anon.auth.signInWithPassword({
      email,
      password,
    });

    if (signData?.session) {
      await anon.auth.signOut();
      return NextResponse.json(
        { success: false, error: "Email уже подтверждён. Войдите в аккаунт." },
        { status: 400 }
      );
    }

    if (signErr && !isUnconfirmedLoginError(signErr)) {
      return NextResponse.json(
        { success: false, error: "Неверный email или пароль" },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const user = await findUserByEmail(supabase, email);
    if (!user || user.email_confirmed_at) {
      return NextResponse.json(
        { success: false, error: "Не удалось отправить код. Проверьте email и пароль." },
        { status: 400 }
      );
    }

    const { data: row, error: selErr } = await supabase
      .from("signup_email_verification")
      .select("resend_count, last_sent_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (selErr) {
      console.error("[resend-signup-code] select:", selErr);
      return NextResponse.json({ success: false, error: "Ошибка базы данных" }, { status: 500 });
    }

    const resendCount = row?.resend_count ?? 0;
    if (resendCount >= MAX_RESEND_CLICKS) {
      return NextResponse.json(
        { success: false, error: "Достигнут лимит повторных отправок. Обратитесь в поддержку." },
        { status: 429 }
      );
    }

    if (resendCount >= 1 && row?.last_sent_at) {
      const elapsed = Date.now() - new Date(row.last_sent_at).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const sec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return NextResponse.json(
          { success: false, error: `Подождите ${sec} сек. перед следующей отправкой`, code: "COOLDOWN" },
          { status: 429 }
        );
      }
    }

    const plainCode = generateFourDigitCode();
    let codeHash: string;
    try {
      codeHash = hashSignupCode(email, plainCode);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ success: false, error: m }, { status: 500 });
    }

    const expiresAt = new Date(Date.now() + SIGNUP_CODE_TTL_MS).toISOString();
    const nowIso = new Date().toISOString();

    const { error: upErr } = await supabase.from("signup_email_verification").upsert(
      {
        user_id: user.id,
        email,
        code_hash: codeHash,
        expires_at: expiresAt,
        resend_count: resendCount + 1,
        last_sent_at: nowIso,
        wrong_attempts: 0,
      },
      { onConflict: "user_id" }
    );

    if (upErr) {
      console.error("[resend-signup-code] upsert:", upErr);
      return NextResponse.json({ success: false, error: "Ошибка сохранения кода" }, { status: 500 });
    }

    const meta = user as { user_metadata?: { name?: string } };
    const sent = await sendSignupVerificationEmail({
      to: email,
      code: plainCode,
      name: meta?.user_metadata?.name,
    });
    if (!sent.ok) {
      return NextResponse.json(
        { success: false, error: sent.error || "Не удалось отправить письмо. Проверьте SMTP." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      resendCount: resendCount + 1,
      maxResendClicks: MAX_RESEND_CLICKS,
    });
  } catch (e) {
    console.error("[resend-signup-code]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
