/** 3 мин — если успеха ещё нет, параллельный доп. запрос (первый не отменяем). */
export const SLIDE_GENERATION_CHECKPOINT_MS =
  Number(process.env.WAVESPEED_SLIDE_CHECKPOINT_MS) ||
  Number(process.env.WAVESPEED_BATCH_CARD_TIMEOUT_MS) ||
  Number(process.env.KIE_BATCH_CARD_TIMEOUT_MS) ||
  180_000;

/** Общий потолок ожидания слайда (оба запроса in-flight). */
export const SLIDE_GENERATION_MAX_WAIT_MS =
  Number(process.env.WAVESPEED_SLIDE_MAX_WAIT_MS) ||
  Number(process.env.WAVESPEED_BATCH_MAX_WAIT_MS) ||
  420_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SlideGenAttemptResult = {
  url: string | null;
  error?: string;
  code?: string;
};

/**
 * Один слайд «гонкой»: через checkpointMs без URL — второй запрос параллельно;
 * побеждает тот, кто раньше вернул успешный результат.
 */
export async function runSlideGenerationRace(
  generateOne: (attemptLabel: string) => Promise<SlideGenAttemptResult>
): Promise<{ url: string | null; errors: SlideGenAttemptResult[] }> {
  let url: string | null = null;
  let done = false;
  const errors: SlideGenAttemptResult[] = [];
  let inFlight = 0;
  let acceptChain = Promise.resolve();

  const tryAccept = (candidate: string | null): Promise<void> => {
    if (!candidate || done) return Promise.resolve();
    acceptChain = acceptChain.then(() => {
      if (done || !candidate) return;
      done = true;
      url = candidate;
      console.log("✅ [SLIDE/RACE] Слайд готов (первый успешный ответ)");
    });
    return acceptChain;
  };

  const launch = (label: string) => {
    if (done) return;
    inFlight++;
    void generateOne(label)
      .then(async (result) => {
        if (result.url) {
          await tryAccept(result.url);
        } else if (result.error || result.code) {
          errors.push(result);
        }
      })
      .finally(() => {
        inFlight--;
      });
  };

  const startedAt = Date.now();
  console.log("🏁 [SLIDE/RACE] Старт генерации слайда");
  launch("initial");

  await sleep(SLIDE_GENERATION_CHECKPOINT_MS);
  await acceptChain;

  if (!done && !url) {
    console.log(
      `🔄 [SLIDE/RACE] Через ${SLIDE_GENERATION_CHECKPOINT_MS / 1000}s без успеха (in-flight ${inFlight}) — доп. запрос`
    );
    launch("retry-1");
  }

  while (!done && !url && Date.now() - startedAt < SLIDE_GENERATION_MAX_WAIT_MS) {
    await sleep(500);
  }

  await acceptChain;

  if (!url) {
    console.warn(
      `⚠️ [SLIDE/RACE] Таймаут: нет URL за ${SLIDE_GENERATION_MAX_WAIT_MS / 1000}s`
    );
  }

  return { url, errors };
}
