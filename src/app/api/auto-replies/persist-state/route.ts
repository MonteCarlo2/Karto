import { NextRequest, NextResponse } from "next/server";
import { createServerClientWithAuth } from "@/lib/supabase/server-auth";
import { createServerClient } from "@/lib/supabase/server";
import { sanitizeSettingsJsonForSupabase } from "@/lib/auto-replies/settings-sanitize";

/**
 * Серверное сохранение состояния автоответов.
 * API-ключи принудительно вычищаются — даже если клиент прислал их по ошибке.
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createServerClientWithAuth();
    if (!supabaseAuth) {
      return NextResponse.json({ error: "Auth unavailable" }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = (await request.json()) as {
      workspace_prefs?: unknown;
      settings_json?: unknown;
      compose_drafts?: unknown;
      shop_id?: string;
      shop_name?: string | null;
    };

    const supabase = createServerClient();
    const payload = {
      user_id: user.id,
      email: user.email ?? null,
      shop_id: typeof body.shop_id === "string" && body.shop_id.trim() ? body.shop_id.trim() : "main",
      shop_name: typeof body.shop_name === "string" ? body.shop_name : null,
      workspace_prefs: body.workspace_prefs ?? {},
      settings_json: sanitizeSettingsJsonForSupabase(body.settings_json),
      compose_drafts:
        body.compose_drafts && typeof body.compose_drafts === "object" && !Array.isArray(body.compose_drafts)
          ? body.compose_drafts
          : {},
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("auto_reply_user_state").upsert(payload, {
      onConflict: "user_id",
    });

    if (error) {
      console.warn("[auto-replies/persist-state]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.warn("[auto-replies/persist-state]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
