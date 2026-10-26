import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { shortHash, supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { evaluateCardPhotosCached, isAllowedWbImageUrl } from "@/lib/seller-hub/card-vision";
import type { VisionResult } from "@/lib/seller-hub/card-vision-score";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 120;

/** Предохранитель расхода: не больше столько новых оценок в час на пользователя (повторное использование не считается). */
const HOURLY_LIMIT = 150;
const usage = new Map<string, number[]>();

function underLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (usage.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  usage.set(userId, recent);
  return recent.length < HOURLY_LIMIT;
}

/** Ключ оценки. v3 — протокол p2: оценки прежнего протокола не смешиваются с новыми. */
const cacheKey = (nmId: number, urls: string[]) => `card-vision:v3:${nmId}:${shortHash(urls.join("|"))}`;

const photoUrls = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((u): u is string => typeof u === "string" && isAllowedWbImageUrl(u)).slice(0, 2) : [];

/** Только чтение: платный вызов нейросети по двум фото карточки. В WB ничего не меняется. */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { nmId?: unknown; imageUrls?: unknown; title?: unknown; category?: unknown; brand?: unknown; force?: unknown; saved?: unknown };
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
      body.saved.slice(0, 300).map(async (item) => {
        const nm = (item as { nmId?: unknown })?.nmId;
        const urls = photoUrls((item as { imageUrls?: unknown })?.imageUrls);
        if (typeof nm !== "number" || urls.length === 0) return;
        const hit = await store.read(cacheKey(nm, urls)).catch(() => null);
        if (hit) found[String(nm)] = hit.payload;
      }),
    );
    return NextResponse.json({ ok: true, saved: found });
  }

  const nmId = typeof body.nmId === "number" && Number.isInteger(body.nmId) && body.nmId > 0 ? body.nmId : null;
  const imageUrls = photoUrls(body.imageUrls);
  if (!nmId || imageUrls.length === 0) {
    return NextResponse.json({ ok: false, error: "Нужны артикул и ссылки на фото Wildberries" }, { status: 400 });
  }

  try {
    const key = cacheKey(nmId, imageUrls);
    const previous = ((await store.read<VisionResult>(key).catch(() => null))?.payload ?? null) as VisionResult | null;
    const force = body.force === true;
    if (!underLimit(auth.user.id)) {
      return NextResponse.json({ ok: false, error: "Достигнут часовой лимит оценок. Повторите позже." }, { status: 429 });
    }
    // Платный вызов только если фото или протокол изменились (или это явная перепроверка).
    const { result, reused } = await evaluateCardPhotosCached(
      {
        title: typeof body.title === "string" ? body.title : "",
        category: typeof body.category === "string" ? body.category : null,
        brand: typeof body.brand === "string" ? body.brand : null,
        imageUrls,
      },
      previous,
      force,
    );
    if (!reused) {
      usage.set(auth.user.id, [...(usage.get(auth.user.id) ?? []), Date.now()]);
      await store.write(key, result).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, result, reused });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Оценка не получилась" }, { status: 502 });
  }
}
