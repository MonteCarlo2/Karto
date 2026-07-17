import { NextRequest, NextResponse } from "next/server";
import { generateDesignConcepts } from "@/lib/services/style-concept-generator";
import {
  getProductNamesWithVisionFallback,
  isOpenRouterConfigured,
  productNamesMatch,
} from "@/lib/services/openrouter-product-vision";
import { isFlowImageProviderConfigured } from "@/lib/services/flow-image-generation";
import { classifyFlowImageError, type FlowImageErrorCode } from "@/lib/flow-image-errors";
import { createServerClient } from "@/lib/supabase/server";
import { getVisualQuota } from "@/lib/services/visual-generation-quota";
import {
  consumeFlowSessionCredits,
  getFlowSessionCredits,
} from "@/lib/flow/flow-session-credits";
import { photoCreditCost } from "@/lib/credits-pricing";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";
import { ensurePublicProductPhotoUrl } from "@/lib/flow/upload-flow-product-photo";
import {
  getFlowSessionPhoto,
  setFlowSessionPhoto,
} from "@/lib/flow/flow-session-photo-store";
import {
  CARD_BATCH_MAX_WAIT_MS,
  CARD_SLOT_CHECKPOINT_MS,
  persistVisualGeneratedCards,
  runVisualBatchRace,
} from "@/lib/flow/visual-batch-race";
import { setVisualBatchProgress } from "@/lib/flow/visual-batch-progress";
import { runFlowGenerateCardForBatch } from "@/app/api/generate-card/route";
import { getSessionImageResolution } from "@/lib/demo-flow-server";

export const maxDuration = 600;

/**
 * Генерация 4 карточек одновременно с уникальными концепциями
 */
export async function POST(request: NextRequest) {
  let sessionIdForLog: string | null = null;

  try {
    const body = await request.json();

    const {
      sessionId,
      productName,
      photoUrl,
      customPrompt,
      addText,
      title,
      bullets,
      aspectRatio,
      count = 4,
    } = body;

    if (!productName) {
      return NextResponse.json(
        { success: false, error: "Требуется название товара" },
        { status: 400 }
      );
    }
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId обязателен для генерации визуала" },
        { status: 400 }
      );
    }

    if (!isFlowImageProviderConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Не настроен ключ генерации изображений. Добавьте WAVESPEED_API_KEY или EVOLINK_API_KEY в .env.local.",
          code: "IMAGE_PROVIDER_NOT_CONFIGURED",
        },
        { status: 500 }
      );
    }

    sessionIdForLog = sessionId;
    const supabase = createServerClient();
    const imageResolution = await getSessionImageResolution(supabase as any, sessionId);
    const photoCost = photoCreditCost(imageResolution);
    const creditsBefore = await getFlowSessionCredits(supabase as any, sessionId);
    if (!creditsBefore || creditsBefore.credits_remaining < photoCost) {
      const quotaBefore = await getVisualQuota(supabase as any, sessionId);
      return NextResponse.json(
        {
          success: false,
          error: `Недостаточно кредитов Потока (нужно ${photoCost}, осталось ${creditsBefore?.credits_remaining ?? 0}).`,
          code: "insufficient_flow_credits",
          credits_remaining: creditsBefore?.credits_remaining ?? 0,
          credits_total: creditsBefore?.credits_total ?? 0,
          generationUsed: quotaBefore.used,
          generationRemaining: quotaBefore.remaining,
          generationLimit: quotaBefore.limit,
        },
        { status: 403 }
      );
    }

    if (photoUrl && isOpenRouterConfigured()) {
      try {
        console.log("🔍 [BATCH] Проверяю соответствие товара на фото и названия через OpenRouter...");
        const recognizedNames = await getProductNamesWithVisionFallback(photoUrl);

        if (recognizedNames.length > 0) {
          if (!productNamesMatch(productName, recognizedNames)) {
            console.warn("⚠️ [BATCH] Товар на фото не соответствует названию!");
            console.warn("⚠️ [BATCH] Название:", productName);
            console.warn("⚠️ [BATCH] Распознано на фото:", recognizedNames.slice(0, 3).join(", "));

            return NextResponse.json(
              {
                success: false,
                error: "Товар на фотографии не соответствует указанному названию",
                details: `На фотографии распознан товар: "${recognizedNames[0] || "неизвестно"}", а указано название: "${productName}". Пожалуйста, загрузите фотографию соответствующего товара или измените название товара.`,
              },
              { status: 400 }
            );
          }

          console.log("✅ [BATCH] Соответствие товара подтверждено");
        }
      } catch (error) {
        console.warn("⚠️ [BATCH] Не удалось проверить соответствие товара:", (error as Error).message);
        console.warn("⚠️ [BATCH] Продолжаем генерацию без проверки...");
      }
    } else if (photoUrl) {
      console.log("ℹ️ [BATCH] Проверка соответствия пропущена: OPENROUTER_API_KEY не настроен");
    }

    console.log("🎨 [BATCH] Генерация 4 дизайн-концепций через OpenRouter...");
    console.log("🎨 [BATCH] Товар:", productName);
    console.log("🎨 [BATCH] Пожелания:", customPrompt || "нет");

    let concepts;
    try {
      concepts = await generateDesignConcepts(productName, customPrompt);
      console.log("✅ [BATCH] Получено концепций:", concepts.length);
      console.log("📋 [BATCH] ========== ПОЛНЫЕ КОНЦЕПЦИИ ОТ GPT ==========");
      concepts.forEach((concept, index) => {
        console.log(`\n📋 [BATCH] КОНЦЕПЦИЯ ${index + 1}:`);
        console.log(`  Style: ${concept.style}`);
        console.log(`  Composition: ${concept.composition}`);
        console.log(`  Colors: ${concept.colors}`);
        console.log(`  Mood: ${concept.mood}`);
        console.log(`  TextPresentation: ${concept.textPresentation}`);
      });
      console.log("📋 [BATCH] ============================================\n");
    } catch (error: any) {
      console.error("❌ [BATCH] ОШИБКА генерации концепций!");
      console.error("❌ [BATCH] Error:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Ошибка генерации концепций через OpenRouter",
          details: error.message || String(error),
        },
        { status: 500 }
      );
    }

    const maxByCredits = Math.floor(creditsBefore.credits_remaining / photoCost);
    const cardsToGenerate = Math.min(count, 4, concepts.length, maxByCredits);
    if (cardsToGenerate <= 0) {
      const quotaBefore = await getVisualQuota(supabase as any, sessionId);
      return NextResponse.json(
        {
          success: false,
          error: "Недостаточно кредитов Потока для генерации карточек.",
          code: "insufficient_flow_credits",
          credits_remaining: creditsBefore.credits_remaining,
          credits_total: creditsBefore.credits_total,
          generationUsed: quotaBefore.used,
          generationRemaining: quotaBefore.remaining,
          generationLimit: quotaBefore.limit,
        },
        { status: 403 }
      );
    }
    console.log(`🎯 [BATCH] Генерируем ${cardsToGenerate} карточек`);

    let rawPhoto = getFlowSessionPhoto(sessionId) || "";
    if (!rawPhoto && typeof photoUrl === "string" && photoUrl.trim()) {
      rawPhoto = photoUrl.trim();
      if (rawPhoto.startsWith("data:")) {
        setFlowSessionPhoto(sessionId, rawPhoto);
      }
    }
    if (!rawPhoto) {
      try {
        const { data } = await supabase
          .from("understanding_data")
          .select("photo_url")
          .eq("session_id", sessionId)
          .maybeSingle();
        const fromDb = typeof data?.photo_url === "string" ? data.photo_url.trim() : "";
        if (fromDb) rawPhoto = fromDb;
      } catch {
        /* ignore */
      }
    }

    if (!rawPhoto) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Фото товара не найдено. Вернитесь на этап «Понимание» и загрузите фото.",
          code: "PHOTO_REQUIRED",
        },
        { status: 400 }
      );
    }

    let effectivePhotoUrl = rawPhoto;
    try {
      const uploaded = await ensurePublicProductPhotoUrl(rawPhoto, sessionId);
      if (uploaded) effectivePhotoUrl = uploaded;
    } catch (e) {
      console.warn("⚠️ [BATCH] Публичный URL не получен, generate-card загрузит в WaveSpeed:", e);
    }

    if (!effectivePhotoUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "Фото товара не передано.",
          code: "PHOTO_REQUIRED",
        },
        { status: 400 }
      );
    }

    console.log(
      `📷 [BATCH] Референс для WaveSpeed: ${effectivePhotoUrl.slice(0, 96)}… (источник: ${rawPhoto.startsWith("data:") ? "data-url" : "url"})`
    );

    const cardRequestBase = {
      productName,
      photoUrl: effectivePhotoUrl,
      customPrompt,
      addText,
      title,
      bullets,
      aspectRatio,
      returnRemoteUrl: true,
      imageResolution,
    };

    const generateOne = async (
      conceptIndex: number,
      attemptLabel: string
    ): Promise<{ url: string | null; error?: string; code?: string }> => {
      const concept = concepts[conceptIndex];
      try {
        console.log(`🎴 [BATCH] Запрос ${attemptLabel} (концепция ${conceptIndex + 1})`);
        const result = await runFlowGenerateCardForBatch({
          ...cardRequestBase,
          variation: conceptIndex,
          designConcept: concept,
        });
        if (!result.url) {
          return {
            url: null,
            error: result.error || `Ошибка карточки (${attemptLabel})`,
            code: result.code,
          };
        }
        return { url: result.url };
      } catch (error: unknown) {
        const msg = (error as { message?: string })?.message ?? String(error);
        console.error(`❌ [BATCH] ${attemptLabel}:`, msg);
        const classified = classifyFlowImageError(msg);
        return { url: null, error: classified.userMessage, code: classified.code };
      }
    };

    const emptySlots = Array(cardsToGenerate).fill(null) as (string | null)[];
    setVisualBatchProgress(sessionId, emptySlots, true);

    const { slots: cardUrls, errors: cardErrors } = await runVisualBatchRace({
      slotCount: cardsToGenerate,
      concepts,
      checkpointMs: CARD_SLOT_CHECKPOINT_MS,
      maxWaitMs: CARD_BATCH_MAX_WAIT_MS,
      generateOne,
      onSlotFilled: (slots) => {
        setVisualBatchProgress(sessionId, slots, true);
        // Промежуточный persist — клиент восстановит карточки даже при обрыве HTTP
        void persistVisualGeneratedCards(sessionId, slots);
      },
    });

    const cardResults = cardErrors;
    const successfulCards = cardUrls.filter((url): url is string => url !== null);

    function pickBatchFailure(
      failures: Array<{ error?: string; code?: string }>
    ): { error: string; code: FlowImageErrorCode; status: number } {
      const codes = failures.map((f) => f.code).filter(Boolean) as FlowImageErrorCode[];
      if (codes.length > 0 && codes.every((c) => c === "IMAGE_PROVIDER_AUTH")) {
        return {
          error:
            "Неверный ключ WaveSpeed. Ключ в WAVESPEED_API_KEY отклонён; проверьте ключ в кабинете WaveSpeed или используйте рабочий EVOLINK_API_KEY.",
          code: "IMAGE_PROVIDER_AUTH",
          status: 401,
        };
      }
      if (codes.some((c) => c === "INSUFFICIENT_CREDITS")) {
        return {
          error:
            "Недостаточно кредитов на счёте EvoLink/WaveSpeed для генерации карточек. Пополните баланс и повторите.",
          code: "INSUFFICIENT_CREDITS",
          status: 402,
        };
      }
      const first = failures.find((f) => f.error)?.error;
      return {
        error:
          first ||
          "Сервис генерации временно недоступен. Попробуйте позже или проверьте подключение.",
        code: "SERVICE_UNAVAILABLE",
        status: 503,
      };
    }

    while (cardUrls.length < 4) {
      cardUrls.push(null);
    }

    if (successfulCards.length === 0) {
      setVisualBatchProgress(sessionId, cardUrls, false);
      const failure = pickBatchFailure(cardResults);
      console.error("❌ [BATCH] Все слоты пустые:", failure);
      return NextResponse.json(
        {
          success: false,
          error: failure.error,
          code: failure.code,
        },
        { status: failure.status }
      );
    }

    console.log(`✅ Успешно сгенерировано ${successfulCards.length}/${cardsToGenerate} карточек`);
    const batchCreditCost = successfulCards.length * photoCost;
    const consumed = await consumeFlowSessionCredits(
      supabase as any,
      sessionId,
      batchCreditCost
    );
    if (!consumed.ok) {
      console.warn("[BATCH] consume credits after success failed:", consumed.error);
    }
    const quotaAfter = await getVisualQuota(supabase as any, sessionId);

    setVisualBatchProgress(sessionId, cardUrls, false, {
      generationUsed: quotaAfter.used,
      generationRemaining: quotaAfter.remaining,
      generationLimit: quotaAfter.limit,
    });

    try {
      await persistVisualGeneratedCards(sessionId, cardUrls, {
        selectedCardIndex: null,
        isSeriesMode: false,
        generation_used: quotaAfter.used,
        generation_limit: quotaAfter.limit,
      });
      console.log("💾 [BATCH] generatedCards сохранены в Supabase");
    } catch (e) {
      console.error("❌ [BATCH] Ошибка сохранения generatedCards:", e);
    }

    return NextResponse.json({
      success: true,
      imageUrls: cardUrls,
      concepts: concepts.slice(0, cardsToGenerate).map((c) => ({
        style: c.style,
        composition: c.composition,
        colors: c.colors,
        mood: c.mood,
      })),
      message: `Сгенерировано ${successfulCards.length} карточек`,
      credits_remaining:
        consumed.state?.credits_remaining ??
        creditsBefore.credits_remaining - batchCreditCost,
      credits_total: consumed.state?.credits_total ?? creditsBefore.credits_total,
      generationUsed: quotaAfter.used,
      generationRemaining: quotaAfter.remaining,
      generationLimit: quotaAfter.limit,
    });
  } catch (error: unknown) {
    if (isSupabaseNetworkError(error)) {
      console.warn("⚠️ [BATCH] Supabase/сеть недоступны при генерации карточек");
      return NextResponse.json(
        {
          success: false,
          error: "Сервис генерации временно недоступен. Попробуйте позже.",
          code: "SERVICE_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    console.error("❌ Ошибка batch генерации:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Ошибка генерации карточек",
        details: (error as { message?: string })?.message || String(error),
      },
      { status: 500 }
    );
  } finally {
    if (sessionIdForLog) {
      console.log("🔓 [BATCH] Завершено для сессии:", sessionIdForLog);
    }
  }
}
