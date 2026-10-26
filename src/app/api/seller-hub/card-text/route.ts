import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { evaluateCardTextCached } from "@/lib/seller-hub/card-text";
import type { TextResult } from "@/lib/seller-hub/card-text-score";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 90;

/** Предохранитель расхода: не больше столько новых оценок текста в час на пользователя. */
const HOURLY_LIMIT = 300;
const usage = new Map<string, number[]>();

function underLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (usage.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  usage.set(userId, recent);
  return recent.length < HOURLY_LIMIT;
}

const cacheKey = (nmId: number) => `card-text:v1:${nmId}`;

/** Только чтение: платный вызов нейросети по названию и описанию карточки. В WB ничего не меняется. */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { nmId?: unknown; title?: unknown; description?: unknown; category?: unknown; brand?: unknown; characteristicNames?: unknown; force?: unknown; saved?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const store = supabaseCacheStore(createServerClient(), auth.user.id);

  // Уже сохранённые оценки списком: бесплатно, нейросеть не вызывается.
  if (Array.isArray(body.saved)) {
    const found: Record<string, unknown> = {};
    await Promise.all(
      body.saved.slice(0, 300).map(async (nm) => {
        if (typeof nm !== "number") return;
        const hit = await store.read(cacheKey(nm)).catch(() => null);
        if (hit) found[String(nm)] = hit.payload;
      }),
    );
    return NextResponse.json({ ok: true, saved: found });
  }

  const nmId = typeof body.nmId === "number" && Number.isInteger(body.nmId) && body.nmId > 0 ? body.nmId : null;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!nmId || !title) {
    return NextResponse.json({ ok: false, error: "Нужны артикул и название карточки" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description : null;

  try {
    const previous = ((await store.read<TextResult>(cacheKey(nmId)).catch(() => null))?.payload ?? null) as TextResult | null;
    if (!underLimit(auth.user.id)) {
      return NextResponse.json({ ok: false, error: "Достигнут часовой лимит оценок. Повторите позже." }, { status: 429 });
    }
    const { result, reused } = await evaluateCardTextCached(
      {
        title,
        description,
        category: typeof body.category === "string" ? body.category : null,
        brand: typeof body.brand === "string" ? body.brand : null,
        characteristicNames: Array.isArray(body.characteristicNames) ? body.characteristicNames.filter((n): n is string => typeof n === "string").slice(0, 60) : null,
      },
      previous,
      body.force === true,
    );
    if (!reused) {
      usage.set(auth.user.id, [...(usage.get(auth.user.id) ?? []), Date.now()]);
      await store.write(cacheKey(nmId), result).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, result, reused });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Оценка не получилась" }, { status: 502 });
  }
}
