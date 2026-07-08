/**
 * Генерация изображений для Потока (карточки, слайды, правки).
 * Провайдер: FLOW_IMAGE_PROVIDER / FLOW_IMAGE_PREFER_KIE (см. image-provider-keys).
 */
import { KieAiContentFilteredError, isKieContentPolicyError } from "@/lib/services/kie-ai-errors";
import { generateWithKieAi } from "@/lib/services/kie-ai";
import { generateWithEvolinkGemini } from "@/lib/services/evolink-images";
import { generateWithWaveSpeedNanoBanana2 } from "@/lib/services/wavespeed-images";
import {
  getFlowImageProvider,
  isImageGenerationConfigured,
  shouldFallbackWaveSpeedToEvolink,
  type FlowImageProvider,
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
  console.log("🍌 [Flow/EvoLink] Генерация");
  return generateWithEvolinkGemini(prompt, imageArray, aspectRatio);
}

async function generateWithKieFlow(
  prompt: string,
  imageArray: string[] | undefined,
  aspectRatio: string
): Promise<FlowImageGenerationResult> {
  console.log("🍌 [Flow/KIE] Генерация nano-banana-2");
  return generateWithKieAi(prompt, imageArray, aspectRatio, "png", "4K");
}

async function generateWithWaveSpeedFlow(
  prompt: string,
  imageArray: string[] | undefined,
  aspectRatio: string
): Promise<FlowImageGenerationResult> {
  return generateWithWaveSpeedNanoBanana2(prompt, imageArray, aspectRatio);
}

async function runProvider(
  provider: FlowImageProvider,
  prompt: string,
  imageArray: string[] | undefined,
  aspectRatio: string
): Promise<FlowImageGenerationResult> {
  if (provider === "kie") {
    return generateWithKieFlow(prompt, imageArray, aspectRatio);
  }
  if (provider === "wavespeed") {
    try {
      return await generateWithWaveSpeedFlow(prompt, imageArray, aspectRatio);
    } catch (error: unknown) {
      if (shouldFallbackWaveSpeedToEvolink(error)) {
        console.warn("⚠️ [Flow/WaveSpeed] 401 → EvoLink");
        return generateWithEvolinkFlow(prompt, imageArray, aspectRatio);
      }
      throw error;
    }
  }
  return generateWithEvolinkFlow(prompt, imageArray, aspectRatio);
}

/**
 * Генерация изображения для Потока.
 */
export async function generateFlowImage(
  prompt: string,
  imageInput?: string | string[],
  aspectRatio: string = "3:4"
): Promise<FlowImageGenerationResult> {
  if (!isFlowImageProviderConfigured()) {
    throw new Error(
      "Не настроен ключ генерации изображений: задайте KIE_AI_API_KEY, WAVESPEED_API_KEY или EVOLINK_API_KEY"
    );
  }

  const imageArray = normalizeImageInput(imageInput);
  const provider = getFlowImageProvider();
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

  console.log(`🎨 [Flow/Image] provider=${provider}, aspect=${aspectRatio}`);

  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await runProvider(provider, prompt, imageArray, aspectRatio);
    } catch (error: unknown) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `❌ [Flow/Image] Ошибка (попытка ${attempt + 1}/${maxAttempts}, ${provider}):`,
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
