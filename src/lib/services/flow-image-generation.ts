/**
 * Генерация изображений для Потока (карточки, слайды, правки).
 * WaveSpeed Nano Banana 2; при 401 на WaveSpeed — fallback на EvoLink (тот же ключ может быть в EVOLINK_API_KEY).
 */
import { KieAiContentFilteredError, isKieContentPolicyError } from "@/lib/services/kie-ai-errors";
import { generateWithEvolinkGemini } from "@/lib/services/evolink-images";
import { generateWithWaveSpeedNanoBanana2 } from "@/lib/services/wavespeed-images";
import {
  hasWaveSpeedApiKey,
  isImageGenerationConfigured,
  shouldFallbackWaveSpeedToEvolink,
} from "@/lib/image-provider-keys";

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
  return isImageGenerationConfigured();
}

async function generateWithEvolinkFlow(
  prompt: string,
  imageArray: string[] | undefined,
  aspectRatio: string
): Promise<FlowImageGenerationResult> {
  console.log("🍌 [Flow/EvoLink] Генерация (fallback или основной провайдер)");
  return generateWithEvolinkGemini(prompt, imageArray, aspectRatio);
}

async function generateWithWaveSpeedFlow(
  prompt: string,
  imageArray: string[] | undefined,
  aspectRatio: string
): Promise<FlowImageGenerationResult> {
  return generateWithWaveSpeedNanoBanana2(prompt, imageArray, aspectRatio);
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
      "Не настроен ключ генерации изображений: задайте WAVESPEED_API_KEY или EVOLINK_API_KEY в .env.local"
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

  const runOnce = async (): Promise<FlowImageGenerationResult> => {
    if (hasWaveSpeedApiKey()) {
      try {
        console.log(`🌊 [Flow/WaveSpeed] Генерация, aspect=${aspectRatio}`);
        const result = await generateWithWaveSpeedFlow(prompt, imageArray, aspectRatio);
        console.log("✅ [Flow/WaveSpeed] Готово");
        return result;
      } catch (error: unknown) {
        if (shouldFallbackWaveSpeedToEvolink(error)) {
          console.warn(
            "⚠️ [Flow/WaveSpeed] Ключ отклонён (401), переключаемся на EvoLink API"
          );
          return generateWithEvolinkFlow(prompt, imageArray, aspectRatio);
        }
        throw error;
      }
    }
    return generateWithEvolinkFlow(prompt, imageArray, aspectRatio);
  };

  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await runOnce();
    } catch (error: unknown) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `❌ [Flow/Image] Ошибка (попытка ${attempt + 1}/${maxAttempts}):`,
        errorMessage
      );

      if (isKieContentPolicyError(errorMessage)) {
        throw new KieAiContentFilteredError();
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
      console.log(`🔄 [Flow/Image] Повтор через ${wait} ms…`);
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
