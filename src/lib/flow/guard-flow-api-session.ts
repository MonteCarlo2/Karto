import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { apiUnauthorizedResponse, requireApiUser } from "@/lib/auth/require-api-user";
import {
  flowSessionAccessResponse,
  requireFlowSessionAccess,
} from "@/lib/flow/require-flow-session-access";

export async function guardFlowApiSession(
  request: NextRequest,
  supabase: SupabaseClient,
  rawSessionId: unknown
): Promise<
  | { ok: true; userId: string; sessionId: string }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireApiUser(request);
  if (!auth.user) {
    return { ok: false, response: apiUnauthorizedResponse(auth) };
  }

  const sessionAccess = await requireFlowSessionAccess(supabase, auth.user.id, rawSessionId);
  if (!sessionAccess.ok) {
    return {
      ok: false,
      response: NextResponse.json(flowSessionAccessResponse(sessionAccess), {
        status: sessionAccess.status,
      }),
    };
  }

  return { ok: true, userId: auth.user.id, sessionId: sessionAccess.sessionId };
}
