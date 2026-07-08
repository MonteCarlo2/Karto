import { createServerClient } from "@/lib/supabase/server";
import type { DesignConcept } from "@/lib/services/style-concept-generator";

/** 3 мин — чекпоинт: сколько карточек ещё нет, столько доп. запросов (без отмены старых). */
export const CARD_SLOT_CHECKPOINT_MS =
  Number(process.env.WAVESPEED_BATCH_CARD_TIMEOUT_MS) ||
  Number(process.env.KIE_BATCH_CARD_TIMEOUT_MS) ||
  180_000;

/** Общий потолок ожидания батча после доп. запросов (не обрываем in-flight). */
export const CARD_BATCH_MAX_WAIT_MS =
  Number(process.env.WAVESPEED_BATCH_MAX_WAIT_MS) || 420_000;

/** Пауза между стартом слотов (снижает «2 из 4 брак» при burst на WaveSpeed). */
export const CARD_BATCH_STAGGER_MS = (() => {
  const v = process.env.WAVESPEED_BATCH_STAGGER_MS;
  if (v === undefined || v === "") return 2_500;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 2_500;
})();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type CardGenAttemptResult = {
  url: string | null;
  error?: string;
  code?: string;
};

export type BatchRaceOptions = {
  slotCount: number;
  concepts: DesignConcept[];
  checkpointMs: number;
  maxWaitMs: number;
  staggerMs?: number;
  generateOne: (conceptIndex: number, attemptLabel: string) => Promise<CardGenAttemptResult>;
  onSlotFilled?: (slots: (string | null)[], filledCount: number) => void | Promise<void>;
};

function countFilled(slots: (string | null)[]): number {
  return slots.filter((s): s is string => Boolean(s)).length;
}

/**
 * Собираем N карточек «гонкой»: старые запросы не отменяем, через checkpointMs
 * дозапускаем ровно столько, сколько слотов ещё пусто.
 * Если уже есть хотя бы 1 URL — не вычитаем in-flight (3 готово + 1 висит → 1 retry).
 */
export async function runVisualBatchRace(
  options: BatchRaceOptions
): Promise<{
  slots: (string | null)[];
  errors: CardGenAttemptResult[];
}> {
  const { slotCount, concepts, checkpointMs, maxWaitMs, generateOne, onSlotFilled } = options;
  const slots: (string | null)[] = Array(slotCount).fill(null);
  const seenUrls = new Set<string>();
  const errors: CardGenAttemptResult[] = [];
  let inFlight = 0;
  let acceptChain = Promise.resolve();
  let raceDone = false;

  const notifySlotFilled = (filled: number) => {
    void onSlotFilled?.([...slots], filled);
  };

  const tryAcceptUrl = (url: string | null): Promise<void> => {
    if (!url || seenUrls.has(url)) return Promise.resolve();
    acceptChain = acceptChain.then(() => {
      if (!url || seenUrls.has(url) || countFilled(slots) >= slotCount) return;
      seenUrls.add(url);
      const emptyIdx = slots.findIndex((s) => s === null);
      if (emptyIdx < 0) return;
      slots[emptyIdx] = url;
      const filled = countFilled(slots);
      if (filled >= slotCount) raceDone = true;
      console.log(`✅ [BATCH/RACE] Карточка ${filled}/${slotCount} (слот ${emptyIdx + 1})`);
      notifySlotFilled(filled);
    });
    return acceptChain;
  };

  const launch = (conceptIndex: number, label: string) => {
    if (raceDone || countFilled(slots) >= slotCount) return;
    const idx = conceptIndex % concepts.length;
    inFlight++;
    void generateOne(idx, label)
      .then(async (result) => {
        if (result.url) {
          await tryAcceptUrl(result.url);
        } else if (result.error || result.code) {
          errors.push(result);
        }
      })
      .finally(() => {
        inFlight--;
      });
  };

  const startedAt = Date.now();
  console.log(`🏁 [BATCH/RACE] Старт ${slotCount} параллельных запросов`);

  const staggerMs = Math.max(0, options.staggerMs ?? CARD_BATCH_STAGGER_MS);
  for (let i = 0; i < slotCount; i++) {
    if (i > 0 && staggerMs > 0) {
      await sleep(staggerMs);
    }
    launch(i, `initial-${i + 1}`);
  }

  await sleep(checkpointMs);
  await acceptChain;

  let filledAtCheckpoint = countFilled(slots);

  // Запросы ещё в полёте — ждём, не шлём дубли (иначе 8 запросов в WaveSpeed)
  if (filledAtCheckpoint < slotCount && inFlight > 0) {
    console.log(
      `⏳ [BATCH/RACE] Чекпоинт ${checkpointMs / 1000}s: готово ${filledAtCheckpoint}, in-flight ${inFlight} — ждём завершения`
    );
    const graceUntil = Date.now() + 120_000;
    while (inFlight > 0 && countFilled(slots) < slotCount && Date.now() < graceUntil) {
      await sleep(500);
    }
    await acceptChain;
    filledAtCheckpoint = countFilled(slots);
  }

  let missingAtCheckpoint = 0;
  if (filledAtCheckpoint >= slotCount || raceDone) {
    missingAtCheckpoint = 0;
  } else if (filledAtCheckpoint > 0) {
    missingAtCheckpoint = slotCount - filledAtCheckpoint;
  } else if (inFlight > 0) {
    missingAtCheckpoint = 0;
  } else {
    missingAtCheckpoint = slotCount;
  }

  if (missingAtCheckpoint > 0) {
    console.log(
      `🔄 [BATCH/RACE] Через ${checkpointMs / 1000}s: готово ${filledAtCheckpoint}, in-flight ${inFlight} — доп. запросов: ${missingAtCheckpoint}`
    );
    for (let r = 0; r < missingAtCheckpoint; r++) {
      const conceptIdx = (slotCount + r) % concepts.length;
      launch(conceptIdx, `retry-${r + 1}`);
    }
  } else {
    console.log(
      `✅ [BATCH/RACE] Через ${checkpointMs / 1000}s доп. запросы не нужны (готово ${filledAtCheckpoint}, in-flight ${inFlight})`
    );
  }

  while (countFilled(slots) < slotCount && Date.now() - startedAt < maxWaitMs) {
    await sleep(500);
  }

  const finalFilled = countFilled(slots);
  if (finalFilled < slotCount) {
    console.warn(
      `⚠️ [BATCH/RACE] Таймаут батча: ${finalFilled}/${slotCount} за ${maxWaitMs / 1000}s`
    );
  }

  return { slots, errors };
}

export async function persistVisualGeneratedCards(
  sessionId: string,
  slots: (string | null)[],
  extraState?: Record<string, unknown>
): Promise<void> {
  const supabase = createServerClient();
  const padded = [...slots];
  while (padded.length < 4) padded.push(null);

  const { data: existingVisualRow } = await supabase
    .from("visual_data")
    .select("visual_state")
    .eq("session_id", sessionId)
    .maybeSingle();

  const existingState = (existingVisualRow?.visual_state || {}) as Record<string, unknown>;
  const nextState = {
    ...existingState,
    ...extraState,
    generatedCards: padded,
    lastGeneratedAt: new Date().toISOString(),
  };

  const { error: saveErr } = await supabase.from("visual_data").upsert(
    {
      session_id: sessionId,
      visual_state: nextState,
    },
    { onConflict: "session_id" }
  );
  if (saveErr) console.error("❌ [BATCH] Не удалось сохранить generatedCards:", saveErr);
}

/** Флаг «батч в работе» в Supabase — для сброса зависшей блокировки после F5/обрыва клиента. */
export async function persistVisualBatchFlag(
  sessionId: string,
  inProgress: boolean
): Promise<void> {
  const supabase = createServerClient();
  const { data: existingVisualRow } = await supabase
    .from("visual_data")
    .select("visual_state")
    .eq("session_id", sessionId)
    .maybeSingle();

  const existingState = (existingVisualRow?.visual_state || {}) as Record<string, unknown>;
  const nextState: Record<string, unknown> = {
    ...existingState,
    batchInProgress: inProgress,
  };
  if (inProgress) {
    nextState.batchStartedAt = new Date().toISOString();
  } else {
    delete nextState.batchStartedAt;
  }

  const { error: saveErr } = await supabase.from("visual_data").upsert(
    {
      session_id: sessionId,
      visual_state: nextState,
    },
    { onConflict: "session_id" }
  );
  if (saveErr) console.error("❌ [BATCH] Не удалось сохранить batchInProgress:", saveErr);
}
