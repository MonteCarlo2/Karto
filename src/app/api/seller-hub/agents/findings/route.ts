import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { syncAgentProposals } from "@/lib/seller-hub/agent/repository";
import { composeSnapshot } from "@/lib/seller-hub/sync/derive";
import { SyncStore } from "@/lib/seller-hub/sync/store";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MARKETPLACE = "wildberries";

/** Находки ИИ-наблюдателя (открытые). Только чтение из нашей базы. */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const db = createServerClient();
    // Скрытые находки: список для вкладки «Скрытые», оттуда их можно вернуть.
    if (request.nextUrl.searchParams.get("status") === "dismissed") {
      const hidden = await db
        .from("seller_hub_ai_findings")
        .select("id, nm_id, severity, title, strategy, last_seen_at")
        .eq("user_id", auth.user.id)
        .eq("marketplace_id", MARKETPLACE)
        .eq("status", "dismissed")
        // Планы из чата «поставить задачу ИИ» скрываются в самом чате, в общий список не возвращаем.
        .or("origin.is.null,origin.neq.chat")
        .order("last_seen_at", { ascending: false })
        .limit(100);
      if (hidden.error) throw hidden.error;
      return NextResponse.json({
        ok: true,
        findings: (hidden.data ?? []).map((r) => ({ id: String(r.id), nmId: (r.nm_id as string | null) ?? null, severity: String(r.severity), title: String(r.title), isStrategy: r.strategy != null, lastSeenAt: String(r.last_seen_at ?? "") })),
      });
    }
    const { data, error } = await db
      .from("seller_hub_ai_findings")
      .select("id, nm_id, kind, severity, title, what, why_now, evidence, human_advice, algorithm_view, second_opinion, second_reason, first_seen_at, last_seen_at, owner_accepted")
      .eq("user_id", auth.user.id)
      .eq("marketplace_id", MARKETPLACE)
      .eq("status", "open")
      .order("last_seen_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ ok: true, findings: data ?? [] });
  } catch {
    return NextResponse.json({ ok: false, error: "Находки ИИ не прочитались" }, { status: 502 });
  }
}

/** Скрыть находку или принять/снять принятие её действия. Принятое действие становится предложением «Выполнить» в разделе «Агенты». */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { id?: unknown; ids?: unknown; action?: unknown; stepIndex?: unknown; status?: unknown; on?: unknown; startAt?: unknown } | null;
  // Автопилот плана: включается только у принятого плана с шагами, которые автопилот умеет выполнять; выключить можно всегда.
  if (body && body.action === "autopilot" && typeof body.id === "string" && typeof body.on === "boolean") {
    const db1 = createServerClient();
    let q = db1.from("seller_hub_ai_findings").update({ autopilot: body.on }).eq("id", body.id).eq("user_id", auth.user.id);
    if (body.on) q = q.eq("owner_accepted", true);
    const { error: apError } = await q;
    return apError ? NextResponse.json({ ok: false, error: "Не удалось сохранить" }, { status: 502 }) : NextResponse.json({ ok: true });
  }
  // Пауза и продолжение плана: на паузе шаги не предлагаются, автопилот не работает, итог не подводится. После продолжения срок плана сдвигается на время паузы.
  if (body && (body.action === "pause" || body.action === "resume") && typeof body.id === "string") {
    const dbp = createServerClient();
    const { data: row } = await dbp.from("seller_hub_ai_findings").select("strategy_state").eq("id", body.id).eq("user_id", auth.user.id).eq("owner_accepted", true).maybeSingle();
    const state = (row?.strategy_state ?? null) as { status?: string; pausedAt?: string; acceptedAt?: string } | null;
    if (!row || !state || state.status !== "running") return NextResponse.json({ ok: false, error: "План сейчас не идёт" }, { status: 409 });
    const nowMs = Date.now();
    let next: Record<string, unknown>;
    if (body.action === "pause") {
      if (state.pausedAt) return NextResponse.json({ ok: true });
      next = { ...state, pausedAt: new Date(nowMs).toISOString() };
    } else {
      if (!state.pausedAt) return NextResponse.json({ ok: true });
      const shift = Math.max(0, nowMs - Date.parse(state.pausedAt));
      const { pausedAt: _gone, ...rest } = state;
      void _gone;
      next = { ...rest, ...(state.acceptedAt && Number.isFinite(Date.parse(state.acceptedAt)) ? { acceptedAt: new Date(Date.parse(state.acceptedAt) + shift).toISOString() } : {}) };
    }
    const { error: pauseError } = await dbp.from("seller_hub_ai_findings").update({ strategy_state: next }).eq("id", body.id).eq("user_id", auth.user.id);
    if (pauseError) return NextResponse.json({ ok: false, error: "Не удалось сохранить" }, { status: 502 });
    try {
      const built = await composeSnapshot(new SyncStore(dbp), dbp, { userId: auth.user.id, marketplaceId: MARKETPLACE });
      if (built) await syncAgentProposals(dbp, auth.user.id, built.snapshot);
    } catch (e) {
      console.error("[seller-hub-agent] пересчёт после паузы не удался:", e instanceof Error ? e.message : String(e));
    }
    return NextResponse.json({ ok: true });
  }
  // «Выполнить шаг сейчас»: шаг программы предлагается сразу, не дожидаясь своего дня и условия. Выполняется всё равно кнопкой «Выполнить» с теми же проверками.
  if (body && body.action === "step_now" && typeof body.id === "string" && Number.isInteger(body.stepIndex)) {
    const dbn = createServerClient();
    const { data: row } = await dbn.from("seller_hub_ai_findings").select("strategy_state").eq("id", body.id).eq("user_id", auth.user.id).eq("owner_accepted", true).maybeSingle();
    const state = (row?.strategy_state ?? null) as { status?: string; forcedSteps?: number[] } | null;
    if (!row || !state || state.status !== "running") return NextResponse.json({ ok: false, error: "План сейчас не идёт: сначала примите его" }, { status: 409 });
    const forcedSteps = [...new Set([...(state.forcedSteps ?? []), body.stepIndex as number])];
    await dbn.from("seller_hub_ai_findings").update({ strategy_state: { ...state, forcedSteps } }).eq("id", body.id).eq("user_id", auth.user.id);
    try {
      const built = await composeSnapshot(new SyncStore(dbn), dbn, { userId: auth.user.id, marketplaceId: MARKETPLACE });
      if (built) await syncAgentProposals(dbn, auth.user.id, built.snapshot);
    } catch (e) {
      console.error("[seller-hub-agent] пересчёт после «выполнить сейчас» не удался:", e instanceof Error ? e.message : String(e));
    }
    return NextResponse.json({ ok: true });
  }
  // Отметка шага, который делает человек: «сделал», «пропустил» или сброс. Без этой отметки программа не знает, выполнен ли шаг.
  if (body && body.action === "step" && typeof body.id === "string" && Number.isInteger(body.stepIndex) && (body.status === "done" || body.status === "skipped" || body.status === "reset")) {
    const db0 = createServerClient();
    const { data: row } = await db0.from("seller_hub_ai_findings").select("strategy_state").eq("id", body.id).eq("user_id", auth.user.id).maybeSingle();
    if (!row) return NextResponse.json({ ok: false, error: "План не найден" }, { status: 404 });
    const state = (row.strategy_state ?? {}) as { humanSteps?: Record<string, { status: string; at: string }> };
    const humanSteps = { ...(state.humanSteps ?? {}) };
    if (body.status === "reset") delete humanSteps[String(body.stepIndex)];
    else humanSteps[String(body.stepIndex)] = { status: body.status, at: new Date().toISOString() };
    const { error: stepError } = await db0.from("seller_hub_ai_findings").update({ strategy_state: { ...state, humanSteps } }).eq("id", body.id).eq("user_id", auth.user.id);
    return stepError ? NextResponse.json({ ok: false, error: "Не удалось сохранить отметку" }, { status: 502 }) : NextResponse.json({ ok: true });
  }
  const ids = body && Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 20) : null;
  if (!body || (typeof body.id !== "string" && !(ids && ids.length > 0)) || (body.action !== "dismiss" && body.action !== "accept" && body.action !== "unaccept" && body.action !== "restore")) return NextResponse.json({ ok: false, error: "Неверный запрос" }, { status: 400 });
  const db = createServerClient();
  // Принятие запускает стратегию с этого момента: срок пересмотра и шаги цены отсчитываются от него. Снятие принятия останавливает ведение.
  const startMs = typeof body.startAt === "string" ? Date.parse(body.startAt) : NaN;
  const scheduled = body.action === "accept" && Number.isFinite(startMs) && startMs > Date.now() + 60_000 && startMs < Date.now() + 60 * 86_400_000;
  const patch = body.action === "dismiss" ? { status: "dismissed" } : body.action === "restore" ? { status: "open" } : body.action === "accept" ? { owner_accepted: true, strategy_state: scheduled ? { status: "scheduled", scheduledStartAt: new Date(startMs).toISOString() } : { status: "running", acceptedAt: new Date().toISOString() } } : { owner_accepted: false, autopilot: false, strategy_state: {} };
  const update = db.from("seller_hub_ai_findings").update(patch).in("id", ids && ids.length > 0 ? ids : [body.id as string]).eq("user_id", auth.user.id);
  // Вернуть можно только скрытую находку: открытую или закрытую по другой причине не трогаем.
  const { error } = await (body.action === "restore" ? update.eq("status", "dismissed") : update);
  if (error) return NextResponse.json({ ok: false, error: "Не удалось сохранить" }, { status: 502 });
  // Предложение должно появиться сразу, а не через 15 минут: пересчитываем по свежему снимку (сбой не отменяет принятие).
  let proposalsOpen: number | null = null;
  {
    try {
      const built = await composeSnapshot(new SyncStore(db), db, { userId: auth.user.id, marketplaceId: MARKETPLACE });
      if (built) proposalsOpen = (await syncAgentProposals(db, auth.user.id, built.snapshot)).open;
    } catch (e) {
      console.error("[seller-hub-agent] пересчёт после решения по находке не удался:", e instanceof Error ? e.message : String(e));
    }
  }
  return NextResponse.json({ ok: true, proposalsOpen });
}
