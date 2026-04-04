import { NextRequest, NextResponse } from "next/server";
import { generateWithKieAi } from "@/lib/services/kie-ai";
import { KieAiContentFilteredError, kieErrorToClient } from "@/lib/services/kie-ai-errors";
import { downloadImage, getPublicUrl } from "@/lib/services/image-processing";
import { createServerClient } from "@/lib/supabase/server";
import { getVisualQuota, incrementVisualQuota } from "@/lib/services/visual-generation-quota";

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

    if (sessionId) {
      const supabase = createServerClient();
      const quota = await getVisualQuota(supabase as any, sessionId);
      if (quota.remaining <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Лимит генераций в Потоке исчерпан (0 из 12).",
            code: "VISUAL_LIMIT_REACHED",
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

    // Подготавливаем изображение для KIE
    let imageForKie: string;
    
    if (imageUrl.startsWith("data:image")) {
      // Уже base64
      imageForKie = imageUrl;
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
          imageForKie = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
          console.log("🔄 [EDIT] Локальный URL преобразован в data URL для KIE");
        } else {
          imageForKie = imageUrl;
          console.log("🔄 [EDIT] Используется публичный URL:", imageUrl);
        }
      } catch {
        imageForKie = imageUrl;
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
        imageForKie = `data:${mimeType};base64,${base64}`;
        
        console.log("🔄 [EDIT] Изображение преобразовано в base64");
      } catch (fileError: any) {
        console.error("❌ [EDIT] Ошибка загрузки локального файла:", fileError);
        // Пробуем использовать как URL
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        imageForKie = imageUrl.startsWith("/") ? `${baseUrl}${imageUrl}` : imageUrl;
        console.log("🔄 [EDIT] Используем fallback URL:", imageForKie);
      }
    }

    // Генерируем отредактированное изображение
    let editedImageUrl: string;
    
    try {
      const result = await generateWithKieAi(
        editPrompt,
        imageForKie,
        finalAspectRatio,
        "png"
      );
      editedImageUrl = result.imageUrl;
      console.log("✅ [EDIT] Редактирование успешно");
    } catch (error: any) {
      console.error("❌ [EDIT] Ошибка в generateWithKieAi:", error);
      console.error("❌ [EDIT] Детали ошибки:", {
        message: error.message,
        status: error.status,
        body: error.body,
        imageUrlType: imageForKie.startsWith("data:") ? "base64" : "url",
      });
      if (error instanceof KieAiContentFilteredError) throw error;
      throw new Error(
        `Модель не смогла отредактировать изображение. Ошибка: ${error.message || "Неизвестная ошибка"}`
      );
    }

    // Скачиваем результат
    const editedPath = await downloadImage(editedImageUrl);
    const editedLocalUrl = getPublicUrl(editedPath);

    console.log(`✅ [EDIT] Карточка отредактирована: ${editedLocalUrl}`);

    let quotaPayload: { generationUsed?: number; generationRemaining?: number; generationLimit?: number } = {};
    if (sessionId) {
      const supabase = createServerClient();
      const quotaAfter = await incrementVisualQuota(supabase as any, sessionId, 1);
      quotaPayload = {
        generationUsed: quotaAfter.used,
        generationRemaining: quotaAfter.remaining,
        generationLimit: quotaAfter.limit,
      };
    }

    return NextResponse.json({
      success: true,
      imageUrl: editedLocalUrl,
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
