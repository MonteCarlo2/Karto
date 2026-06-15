import { NextRequest, NextResponse } from "next/server";

import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";

import { createServerClient } from "@/lib/supabase/server";

import { fetchTelegramLinkByUserId } from "@/lib/telegram/telegram-db";

import { getTelegramBotUsername, isTelegramConfigured } from "@/lib/telegram/config";



export const runtime = "nodejs";



export async function GET(request: NextRequest) {

  const auth = await requireAutoRepliesUser(request);

  if (!auth.user) {

    return NextResponse.json({ error: auth.error }, { status: auth.status });

  }



  const supabase = createServerClient();

  const link = await fetchTelegramLinkByUserId(supabase, auth.user.id);



  return NextResponse.json({

    configured: isTelegramConfigured(),

    linked: Boolean(link),

    botUsername: getTelegramBotUsername(),

    username: link?.username ?? null,

    firstName: link?.first_name ?? null,

    linkedAt: link?.linked_at ?? null,

    notifyEnabled: link?.notify_enabled ?? true,

  });

}

