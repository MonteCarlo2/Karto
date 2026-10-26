import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { isValidUserSetting, pickValidSettings } from "@/lib/seller-hub/user-settings";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MARKETPLACE = "wildberries";

/** Все сохранённые настройки пользователя (только известные ключи с допустимыми значениями). */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { data, error } = await createServerClient()
    .from("seller_hub_user_settings")
    .select("setting_key, value")
    .eq("user_id", auth.user.id)
    .eq("marketplace_id", MARKETPLACE);
  if (error) return NextResponse.json({ ok: false, error: "Не удалось прочитать настройки" }, { status: 500 });
  return NextResponse.json({ ok: true, settings: pickValidSettings(data ?? []) });
}

/** Сохранить одну настройку. Ключ и значение проверяются по белому списку. */
export async function PUT(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { key?: unknown; value?: unknown } | null;
  if (!body || typeof body.key !== "string" || !isValidUserSetting(body.key, body.value)) {
    return NextResponse.json({ ok: false, error: "Неизвестная настройка или недопустимое значение" }, { status: 400 });
  }
  const { error } = await createServerClient()
    .from("seller_hub_user_settings")
    .upsert(
      {
        user_id: auth.user.id,
        marketplace_id: MARKETPLACE,
        setting_key: body.key,
        value: body.value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,marketplace_id,setting_key" },
    );
  if (error) return NextResponse.json({ ok: false, error: "Не удалось сохранить настройку" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
