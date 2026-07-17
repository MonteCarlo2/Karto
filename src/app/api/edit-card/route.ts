import { NextRequest, NextResponse } from "next/server";
import { generateFlowImage, isFlowImageProviderConfigured } from "@/lib/services/flow-image-generation";
import { KieAiContentFilteredError, kieErrorToClient } from "@/lib/services/kie-ai-errors";
import { createServerClient } from "@/lib/supabase/server";
import { getVisualQuota } from "@/lib/services/visual-generation-quota";
import {
  consumeFlowSessionCredits,
  getFlowSessionCredits,
} from "@/lib/flow/flow-session-credits";
import { photoCreditCost } from "@/lib/credits-pricing";
import { getSessionImageResolution } from "@/lib/demo-flow-server";

/**
 * API endpoint для редактирования карточки товара
 * При вызове из Потока (sessionId передан) — списывает 1 генерацию из квоты.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, editRequest, productName, aspectRatio, sessionId } = body;

    if (!imageUrl || !editRequest) {
      return NextResponse.json({
        success: false,
        error: "Требуется URL изображения и запрос на редактирование",
      }, { status: 400 });
    }

    console.log("🔄 [EDIT] Начало редактирования карточки");
    console.log("🔄 [EDIT] Запрос пользователя:", editRequest);
    console.log("🔄 [EDIT] Товар:", productName);
    console.log("🔄 [EDIT] Исходный imageUrl:", imageUrl);

    let imageResolution: "2k" | "4k" | undefined;
    let photoCost = 0;
    if (sessionId) {
      const supabase = createServerClient();
      imageResolution = await getSessionImageResolution(supabase as any, sessionId);
      photoCost = photoCreditCost(imageResolution);
      const credits = await getFlowSessionCredits(supabase as any, sessionId);
      if (!credits || credits.credits_remaining < photoCost) {
        const quota = await getVisualQuota(supabase as any, sessionId);
        return NextResponse.json(
          {
            success: false,
            error: `Недостаточно кредитов Потока (нужно ${photoCost}, осталось ${credits?.credits_remaining ?? 0}).`,
            code: "insufficient_flow_credits",
            credits_remaining: credits?.credits_remaining ?? 0,
            credits_total: credits?.credits_total ?? 0,
            generationUsed: quota.used,
            generationRemaining: quota.remaining,
            generationLimit: quota.limit,
          },
          { status: 403 }
        );
      }
    }

    // Строим промпт для редактирования с строгими правилами
    const editPrompt = `Отредактируй эту карточку товара согласно запросу пользователя.

=== ЗАПРОС ПОЛЬЗОВАТЕЛЯ ===
${editRequest}

=== КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА РЕДАКТИРОВАНИЯ ===

🚫 АБСОЛЮТНО ЗАПРЕЩЕНО:
- НЕ изменяй то, что пользователь НЕ просил изменить
- НЕ удаляй элементы, которые пользователь НЕ просил удалить
- НЕ добавляй элементы, которые пользователь НЕ просил добавить
- НЕ изменяй товар "${productName}" - он должен остаться ТОЧНО ТАКИМ ЖЕ
- НЕ изменяй текст, который уже есть на карточке (если пользователь не просил его изменить)
- НЕ добавляй новый текст, если пользователь не просил его добавить
- НЕ добавляй текст на английском языке - ВСЕГДА используй русский язык (кириллицу)
- НЕ изменяй размер, форму, пропорции или ориентацию товара
- НЕ изменяй ракурс съемки товара
- НЕ добавляй логотипы, бренды или любые надписи, которые не были запрошены

✅ РАЗРЕШЕНО ТОЛЬКО:
- Изменить ТОЛЬКО то, что указал пользователь в запросе
- Если пользователь просит убрать элемент - убрать ТОЛЬКО этот элемент, ничего больше
- Если пользователь просит добавить элемент - добавить ТОЛЬКО этот элемент, ничего больше
- Если пользователь просит изменить фон - изменить ТОЛЬКО фон, ничего больше
- Если пользователь просит добавить текст - добавить ТОЛЬКО этот текст на русском языке (кириллицей)

=== ПРИМЕРЫ ПРАВИЛЬНОГО РЕДАКТИРОВАНИЯ ===

Запрос: "убрать корзину"
✅ Правильно: Убрать только корзину, товар и все остальное оставить без изменений
❌ Неправильно: Убрать корзину и изменить товар, или убрать корзину и добавить что-то еще

Запрос: "добавить текст 'Премиум качество'"
✅ Правильно: Добавить только этот текст на русском языке, все остальное оставить без изменений
❌ Неправильно: Добавить текст на английском, или изменить существующий текст

Запрос: "изменить фон на белый"
✅ Правильно: Изменить только фон, товар и текст оставить без изменений
❌ Неправильно: Изменить фон и товар, или изменить фон и текст

=== ИНСТРУКЦИЯ ===
1. Внимательно прочитай запрос пользователя
2. Определи, ЧТО ИМЕННО нужно изменить
3. Измени ТОЛЬКО то, что указано в запросе
4. ВСЁ ОСТАЛЬНОЕ оставь БЕЗ ИЗМЕНЕНИЙ
5. Если пользователь просит добавить текст - используй ТОЛЬКО русский язык (кириллицу)

Выполни редактирование согласно запросу пользователя, строго следуя правилам выше.`;

    console.log("🔄 [EDIT] Промпт для редактирования сформирован");

    // Определяем aspect ratio
    const finalAspectRatio = aspectRatio === "1:1" ? "1:1" : "3:4";

    // Подготавливаем изображение для WaveSpeed
    let imageForApi: string;
    
    if (imageUrl.startsWith("data:image")) {
      // Уже base64
      imageForApi = imageUrl;
      console.log("🔄 [EDIT] Используется base64 изображение");
    } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      // localhost — читаем с диска и отдаём data URL (KIE не дергает localhost)
      try {
        const u = new URL(imageUrl);
        if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
          const path = await import("path");
          const fs = await import("fs/promises");
          const localPath = path.join(process.cwd(), "public", u.pathname);
          await fs.access(localPath);
          const fileBuffer = await fs.readFile(localPath);
          const ext = path.extname(u.pathname).toLowerCase();
          const mimeTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
          const mimeType = mimeTypes[ext] || 'image/jpeg';
          imageForApi = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
          console.log("🔄 [EDIT] Локальный URL преобразован в data URL для KIE");
        } else {
          imageForApi = imageUrl;
          console.log("🔄 [EDIT] Используется публичный URL:", imageUrl);
        }
      } catch {
        imageForApi = imageUrl;
        console.log("🔄 [EDIT] Используется публичный URL:", imageUrl);
      }
    } else {
      // Локальный путь - загружаем и преобразуем в base64
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        
        // Определяем полный путь к файлу
        let filePath: string;
        if (imageUrl.startsWith("/")) {
          // Относительный путь от public
          filePath = path.join(process.cwd(), "public", imageUrl);
        } else {
          // Абсолютный путь или путь от public
          filePath = imageUrl.startsWith(process.cwd()) 
            ? imageUrl 
            : path.join(process.cwd(), "public", imageUrl);
        }
        
        console.log("🔄 [EDIT] Загружаем локальный файл:", filePath);
        
        // Читаем файл
        const fileBuffer = await fs.readFile(filePath);
        
        // Определяем MIME тип по расширению
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
        };
        const mimeType = mimeTypes[ext] || 'image/png';
        
        // Преобразуем в base64
        const base64 = fileBuffer.toString('base64');
        imageForApi = `data:${mimeType};base64,${base64}`;
        
        console.log("🔄 [EDIT] Изображение преобразовано в base64");
      } catch (fileError: any) {
        console.error("❌ [EDIT] Ошибка загрузки локального файла:", fileError);
        // Пробуем использовать как URL
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        imageForApi = imageUrl.startsWith("/") ? `${baseUrl}${imageUrl}` : imageUrl;
        console.log("🔄 [EDIT] Используем fallback URL:", imageForApi);
      }
    }

    // Генерируем отредактированное изображение
    let editedImageUrl: string;
    
    try {
      const result = await generateFlowImage(editPrompt, imageForApi, finalAspectRatio, {
        resolution: imageResolution,
      });
      editedImageUrl = result.imageUrl;
      console.log("✅ [EDIT] Редактирование успешно");
    } catch (error: unknown) {
      console.error("❌ [EDIT] Ошибка в generateFlowImage:", error);
      console.error("❌ [EDIT] Детали ошибки:", {
        message: error instanceof Error ? error.message : String(error),
        imageUrlType: imageForApi.startsWith("data:") ? "base64" : "url",
      });
      if (error instanceof KieAiContentFilteredError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Модель не смогла отредактировать изображение. Ошибка: ${msg || "Неизвестная ошибка"}`
      );
    }

    console.log(`✅ [EDIT] Карточка отредактирована (CDN): ${editedImageUrl}`);

    let quotaPayload: {
      generationUsed?: number;
      generationRemaining?: number;
      generationLimit?: number;
      credits_remaining?: number;
      credits_total?: number;
    } = {};
    if (sessionId) {
      const supabase = createServerClient();
      const consumed = await consumeFlowSessionCredits(supabase as any, sessionId, photoCost);
      if (!consumed.ok) {
        console.warn("[EDIT] consume credits after success failed:", consumed.error);
      }
      const quotaAfter = await getVisualQuota(supabase as any, sessionId);
      quotaPayload = {
        generationUsed: quotaAfter.used,
        generationRemaining: quotaAfter.remaining,
        generationLimit: quotaAfter.limit,
        credits_remaining: consumed.state?.credits_remaining,
        credits_total: consumed.state?.credits_total,
      };
    }

    return NextResponse.json({
      success: true,
      imageUrl: editedImageUrl,
      message: "Карточка успешно отредактирована!",
      ...quotaPayload,
    });

  } catch (error: any) {
    console.error("❌ [EDIT] Ошибка редактирования:", error);
    const payload = kieErrorToClient(error);
    const status = payload.code === "CONTENT_FILTER" ? 422 : 500;
    return NextResponse.json(
      {
        success: false,
        error: payload.message,
        ...(payload.code ? { code: payload.code } : {}),
      },
      { status }
    );
  }
}
