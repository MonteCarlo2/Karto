import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

import {
  accountDeletionBlockedMessageRu,
  getAccountDeletionStatus,
} from "@/lib/account/deletion-policy";
import { preserveDemoFlowEmailUsageOnAccountDeletion } from "@/lib/demo-flow/email-usage";
import { preserveWelcomePerkDeviceClaimOnAccountDeletion } from "@/lib/welcome-perks/device-claims-persist";
import { createServerClient } from "@/lib/supabase/server";
import { createServerClientWithAuth } from "@/lib/supabase/server-auth";

const CONFIRM_PHRASE = "УДАЛИТЬ";

async function resolveRequestUser(request: NextRequest): Promise<User | null> {
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

/** GET — можно ли удалить аккаунт (14-дневный кулдаун). */
export async function GET(request: NextRequest) {
  try {
    const user = await resolveRequestUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const status = getAccountDeletionStatus(user.created_at);
    return NextResponse.json({
      success: true,
      ...status,
      message: status.allowed
        ? null
        : accountDeletionBlockedMessageRu(status.daysRemaining, status.unlockAt),
    });
  } catch (error) {
    console.error("[delete-account] GET", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await resolveRequestUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const deletionStatus = getAccountDeletionStatus(user.created_at);
    if (!deletionStatus.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: accountDeletionBlockedMessageRu(
            deletionStatus.daysRemaining,
            deletionStatus.unlockAt
          ),
          code: "account_deletion_cooldown",
          daysRemaining: deletionStatus.daysRemaining,
          unlockAt: deletionStatus.unlockAt,
        },
        { status: 403 }
      );
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

    await preserveWelcomePerkDeviceClaimOnAccountDeletion(supabase, user.id);
    await preserveDemoFlowEmailUsageOnAccountDeletion(supabase, user.id, user.email);

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
