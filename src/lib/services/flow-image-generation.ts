/**
 * Генерация изображений для Потока (карточки, слайды, правки).
 * Провайдер: WaveSpeed Nano Banana 2 — тот же стек, что в свободном творчестве.
 */
import { KieAiContentFilteredError, isKieContentPolicyError } from "@/lib/services/kie-ai-errors";
import { generateWithWaveSpeedNanoBanana2 } from "@/lib/services/wavespeed-images";

export type FlowImageGenerationResult = { imageUrl: string; referenceUsed: boolean };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeImageInput(imageInput?: string | string[]): string[] | undefined {
  if (!imageInput) return undefined;
  const arr = Array.isArray(imageInput) ? imageInput : [imageInput];
  const filtered = arr.filter((s) => typeof s === "string" && s.trim().length > 0);
  return filtered.length > 0 ? filtered : undefined;
}

export function isFlowImageProviderConfigured(): boolean {
  return Boolean(process.env.WAVESPEED_API_KEY?.trim());
}

/**
 * Генерация изображения для Потока (промпты и логика — как раньше с KIE).
 */
export async function generateFlowImage(
  prompt: string,
  imageInput?: string | string[],
  aspectRatio: string = "3:4"
): Promise<FlowImageGenerationResult> {
  if (!isFlowImageProviderConfigured()) {
    throw new Error(
      "WAVESPEED_API_KEY не установлен в .env.local (генерация Потока на WaveSpeed)"
    );
  }

  const imageArray = normalizeImageInput(imageInput);
  const maxAttempts = parseInt(
    process.env.FLOW_GENERATION_ATTEMPTS ??
      process.env.KIE_GENERATION_ATTEMPTS ??
      "2",
    10
  );
  const retryBackoffMs = parseInt(
    process.env.FLOW_GENERATION_RETRY_BACKOFF_MS ??
      process.env.KIE_GENERATION_RETRY_BACKOFF_MS ??
      "2500",
    10
  );

  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log(
        `🌊 [Flow/WaveSpeed] Генерация (попытка ${attempt + 1}/${maxAttempts}), aspect=${aspectRatio}`
      );
      const result = await generateWithWaveSpeedNanoBanana2(
        prompt.trim(),
        imageArray,
        aspectRatio
      );
      console.log("✅ [Flow/WaveSpeed] Готово");
      return result;
    } catch (error: unknown) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `❌ [Flow/WaveSpeed] Ошибка (попытка ${attempt + 1}/${maxAttempts}):`,
        errorMessage
      );

      if (isKieContentPolicyError(errorMessage)) {
        throw new KieAiContentFilteredError();
      }

      if (errorMessage.includes("401") || errorMessage.toLowerCase().includes("unauthorized")) {
        throw new Error(
          "Ошибка авторизации WaveSpeed. Проверьте WAVESPEED_API_KEY в .env.local"
        );
      }
      if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("rate limit")) {
        throw new Error("Превышен лимит запросов WaveSpeed. Подождите и попробуйте снова.");
      }

      const isRetryable =
        errorMessage.includes("Internal Error") ||
        errorMessage.includes("Please try again later") ||
        errorMessage.includes("превышено время ожидания") ||
        errorMessage.includes("Превышено время ожидания") ||
        errorMessage.toLowerCase().includes("timeout") ||
        errorMessage.toLowerCase().includes("timed out") ||
        errorMessage.toLowerCase().includes("fetch failed") ||
        errorMessage.toLowerCase().includes("econnreset");

      if (!isRetryable || attempt >= maxAttempts - 1) {
        break;
      }

      const wait = retryBackoffMs * (attempt + 1);
      console.log(`🔄 [Flow/WaveSpeed] Повтор через ${wait} ms…`);
      await sleep(wait);
    }
  }

  const msg =
    lastError instanceof Error ? lastError.message : String(lastError ?? "unknown");
  if (isKieContentPolicyError(msg)) {
    throw new KieAiContentFilteredError();
  }
  throw lastError instanceof Error ? lastError : new Error(msg);
}
