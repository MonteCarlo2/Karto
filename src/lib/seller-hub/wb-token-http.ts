import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { createServerClient } from "@/lib/supabase/server";
import { openSellerHubWbToken, safeSellerHubMessage } from "./wb-token";
import { supabaseSellerHubSecretDb } from "./wb-token-store";

const MISSING = "Кабинет Wildberries не подключён";
const UNAVAILABLE = "Не удалось прочитать подключение кабинета";

export async function requireSellerHubWbToken(request: NextRequest): Promise<
  | { ok: true; userId: string; token: string }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }),
    };
  }
  const opened = await openSellerHubWbToken(auth.user.id, supabaseSellerHubSecretDb(createServerClient()));
  if (!opened.ok) {
    const missing = opened.reason === "missing";
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: missing ? MISSING : UNAVAILABLE },
        { status: missing ? 409 : 503 },
      ),
    };
  }
  return { ok: true, userId: auth.user.id, token: opened.token };
}

export function wbRouteError(error: unknown, token: string, status = 502): NextResponse {
  const message = error instanceof Error ? error.message : "";
  return NextResponse.json(
    { ok: false, error: safeSellerHubMessage(message, token) },
    { status: status >= 400 ? status : 502 },
  );
}
