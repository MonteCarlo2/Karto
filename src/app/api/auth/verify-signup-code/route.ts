import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAnonServerClient } from "@/lib/supabase/anon-server";
import { findAuthUserByEmail } from "@/lib/auth/find-auth-user-by-email";
import {
  hashSignupCode,
  MAX_SIGNUP_CODE_ATTEMPTS,
} from "@/lib/auth/signup-verification";

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
    const codeRaw = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";

    if (!emailRaw?.includes("@") || !password) {
      return NextResponse.json({ success: false, error: "Укажите email и пароль" }, { status: 400 });
    }
    if (codeRaw.length !== 4) {
      return NextResponse.json({ success: false, error: "Введите 4 цифры кода" }, { status: 400 });
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
    const user = await findAuthUserByEmail(supabase, email);
    if (!user) {
      return NextResponse.json({ success: false, error: "Пользователь не найден" }, { status: 404 });
    }
    if (user.email_confirmed_at) {
      return NextResponse.json(
        { success: false, error: "Email уже подтверждён" },
        { status: 400 }
      );
    }

    const { data: row, error: selErr } = await supabase
      .from("signup_email_verification")
      .select("id, code_hash, expires_at, wrong_attempts")
      .eq("user_id", user.id)
      .maybeSingle();

    if (selErr || !row) {
      return NextResponse.json(
        {
          success: false,
          error: "Код не найден или истёк. Запросите новый код кнопкой «Отправить ещё раз».",
        },
        { status: 400 }
      );
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabase.from("signup_email_verification").delete().eq("user_id", user.id);
      return NextResponse.json(
        { success: false, error: "Срок действия кода истёк. Запросите новый код." },
        { status: 400 }
      );
    }

    if (row.wrong_attempts >= MAX_SIGNUP_CODE_ATTEMPTS) {
      await supabase.from("signup_email_verification").delete().eq("user_id", user.id);
      return NextResponse.json(
        {
          success: false,
          error: "Слишком много неверных попыток. Зарегистрируйтесь снова или запросите новый код.",
        },
        { status: 429 }
      );
    }

    let expectedHash: string;
    try {
      expectedHash = hashSignupCode(email, codeRaw);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ success: false, error: m }, { status: 500 });
    }

    if (expectedHash !== row.code_hash) {
      await supabase
        .from("signup_email_verification")
        .update({ wrong_attempts: row.wrong_attempts + 1 })
        .eq("user_id", user.id);
      return NextResponse.json(
        { success: false, error: "Неверный код. Проверьте письмо и попробуйте снова." },
        { status: 400 }
      );
    }

    const { error: confErr } = await supabase.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    });
    if (confErr) {
      console.error("[verify-signup-code] confirm:", confErr);
      return NextResponse.json(
        { success: false, error: "Не удалось подтвердить email. Попробуйте позже." },
        { status: 500 }
      );
    }

    await supabase.from("signup_email_verification").delete().eq("user_id", user.id);

    try {
      const { data: userFull, error: getErr } = await supabase.auth.admin.getUserById(user.id);
      if (!getErr && userFull?.user) {
        const opted = userFull.user.user_metadata?.email_marketing_opt_in === true;
        const { error: consentErr } = await supabase.from("email_marketing_consent").upsert(
          {
            user_id: user.id,
            opted_in: opted,
            opted_in_at: opted ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        if (consentErr && consentErr.code !== "42P01") {
          console.warn("[verify-signup-code] email_marketing_consent:", consentErr.message);
        }
      }
    } catch (e) {
      console.warn("[verify-signup-code] consent upsert:", e);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[verify-signup-code]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}
