import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  generateFourDigitCode,
  hashSignupCode,
  MAX_RESEND_CLICKS,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!emailRaw || !emailRaw.includes("@")) {
      return NextResponse.json({ success: false, error: "Введите корректный email" }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ success: false, error: "Пароль слишком короткий" }, { status: 400 });
    }
    if (!name || name.length < 1) {
      return NextResponse.json({ success: false, error: "Введите имя" }, { status: 400 });
    }

    const email = emailRaw.toLowerCase();
    const supabase = createServerClient();

    let userId: string;

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: {
        name,
        consent_personal_data: true,
        consent_personal_data_at: new Date().toISOString(),
      },
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message?.toLowerCase() ?? "";
      const duplicate =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists") ||
        createErr?.status === 422;

      if (!duplicate) {
        console.error("[register-send-code] createUser:", createErr);
        return NextResponse.json(
          { success: false, error: createErr?.message || "Не удалось создать аккаунт" },
          { status: 400 }
        );
      }

      const existing = await findUserByEmail(supabase, email);
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Пользователь с таким email уже зарегистрирован. Войдите или восстановите пароль." },
          { status: 409 }
        );
      }
      if (existing.email_confirmed_at) {
        return NextResponse.json(
          { success: false, error: "Пользователь с таким email уже зарегистрирован. Войдите в аккаунт." },
          { status: 409 }
        );
      }

      const { error: updErr } = await supabase.auth.admin.updateUserById(existing.id, {
        password,
        user_metadata: {
          name,
          consent_personal_data: true,
          consent_personal_data_at: new Date().toISOString(),
        },
      });
      if (updErr) {
        console.error("[register-send-code] updateUser:", updErr);
        return NextResponse.json({ success: false, error: updErr.message }, { status: 400 });
      }
      userId = existing.id;
      await supabase.from("signup_email_verification").delete().eq("user_id", userId);
    } else {
      userId = created.user.id;
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

    const { error: insErr } = await supabase.from("signup_email_verification").upsert(
      {
        user_id: userId,
        email,
        code_hash: codeHash,
        expires_at: expiresAt,
        resend_count: 0,
        last_sent_at: nowIso,
        wrong_attempts: 0,
      },
      { onConflict: "user_id" }
    );

    if (insErr) {
      console.error("[register-send-code] insert verification:", insErr);
      return NextResponse.json({ success: false, error: "Ошибка сохранения кода" }, { status: 500 });
    }

    const sent = await sendSignupVerificationEmail({ to: email, code: plainCode, name });
    if (!sent.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            sent.error ||
            "Не удалось отправить письмо с кодом. Настройте SMTP (SMTP_HOST, SMTP_USER, SMTP_PASSWORD).",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      email,
      maxResendClicks: MAX_RESEND_CLICKS,
    });
  } catch (e) {
    console.error("[register-send-code]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
