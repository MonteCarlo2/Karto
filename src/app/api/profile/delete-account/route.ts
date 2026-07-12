import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { createServerClientWithAuth } from "@/lib/supabase/server-auth";

const CONFIRM_PHRASE = "УДАЛИТЬ";

async function resolveRequestUser(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data.user) return data.user;
    }
  }

  const supabaseAuth = await createServerClientWithAuth();
  if (!supabaseAuth) return null;
  const { data, error } = await supabaseAuth.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await resolveRequestUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const confirmPhrase =
      typeof body.confirmPhrase === "string" ? body.confirmPhrase.trim().toUpperCase() : "";

    if (confirmPhrase !== CONFIRM_PHRASE) {
      return NextResponse.json(
        {
          success: false,
          error: `Для подтверждения введите слово «${CONFIRM_PHRASE}»`,
        },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("[delete-account] admin.deleteUser:", deleteError.message);
      return NextResponse.json(
        { success: false, error: "Не удалось удалить аккаунт. Попробуйте позже." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[delete-account]", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
