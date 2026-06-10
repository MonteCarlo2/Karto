import { NextRequest, NextResponse } from "next/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import {
  fetchAutoReplyHistory,
  fetchAutoReplyUserState,
} from "@/lib/auto-replies/auto-replies-supabase-db";
import { createServerClient } from "@/lib/supabase/server";
import { fetchUserBrandOnboarding } from "@/lib/brand/user-brand-onboarding-db";
function brandNameFromRow(draftJson: Record<string, unknown> | undefined): string | null {
  if (!draftJson || typeof draftJson !== "object") return null;
  const n = String(draftJson.name ?? "").trim();
  return n.length >= 2 ? n : null;
}

/** Настройки и история через сервер — браузеру не нужен прямой доступ к Supabase. */
export async function GET(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServerClient();
  const userId = auth.user.id;

  const [remote, remoteHistory, brandRow] = await Promise.all([
    fetchAutoReplyUserState(supabase, userId),
    fetchAutoReplyHistory(supabase, userId),
    fetchUserBrandOnboarding(supabase, userId).catch(() => null),
  ]);

  const brandFromOnboarding = brandNameFromRow(brandRow?.draft_json as Record<string, unknown> | undefined);
  const settingsRoot = remote?.settings_json as { shops?: Record<string, { displayName?: string }> } | null;
  const brandFromSettings = settingsRoot?.shops?.main?.displayName?.trim() || null;
  const brandName = brandFromOnboarding || brandFromSettings || remote?.shop_name?.trim() || null;

  return NextResponse.json({
    ok: true,
    userState: remote,
    history: remoteHistory ?? [],
    brandName,
  });
}
