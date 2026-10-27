import { NextRequest, NextResponse } from "next/server";
import { listAgentProposals, resolveAgentProposal } from "@/lib/seller-hub/agent/repository";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Предложения агента, которые сервер насчитал по снимку кабинета (только чтение из нашей базы, WB не трогается). */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const proposals = await listAgentProposals(createServerClient(), auth.user.id);
    return NextResponse.json({ ok: true, proposals });
  } catch {
    return NextResponse.json({ ok: false, error: "Предложения агента не прочитались" }, { status: 502 });
  }
}

/**
 * Решение человека по предложению: отклонить, отметить выполненным или сорвавшимся.
 * Само действие в кабинете выполняют отдельные маршруты (цены, реклама) с их проверками; здесь только отметка в очереди.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  let body: { id?: unknown; decision?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const decision = body.decision;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (decision !== "done" && decision !== "dismissed" && decision !== "failed")) {
    return NextResponse.json({ ok: false, error: "Укажите предложение и решение" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 300) : null;
  try {
    const changed = await resolveAgentProposal(createServerClient(), auth.user.id, id, decision, note);
    return NextResponse.json({ ok: true, changed });
  } catch {
    return NextResponse.json({ ok: false, error: "Решение не записалось" }, { status: 502 });
  }
}
