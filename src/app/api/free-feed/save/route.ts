import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Сохранение изображения в ленту свободной генерации
 * Скачивает изображение с временного URL и сохраняет в Supabase Storage для постоянного доступа
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      imageUrl,
      prompt,
      aspectRatio,
      generationMode = "free",
      scenario = null,
      isFavorite = false,
      userId = null,
    } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId обязателен" },
        { status: 400 }
      );
    }

    if (!imageUrl) {
      return NextResponse.json(
        { success: false, error: "imageUrl обязателен" },
        { status: 400 }
      );
    }

    if (!aspectRatio || !["3:4", "4:3", "9:16", "1:1"].includes(aspectRatio)) {
      return NextResponse.json(
        { success: false, error: "Некорректное соотношение сторон" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    
    // Скачиваем изображение с временного URL и загружаем в Supabase Storage
    let permanentImageUrl = imageUrl;
    
    try {
      // Скачиваем изображение
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Не удалось скачать изображение: ${imageResponse.statusText}`);
      }
      
      const imageBlob = await imageResponse.blob();
      
      // Генерируем уникальное имя файла
      const fileName = `generated-images/${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
      
      // Загружаем в Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("generated-images")
        .upload(fileName, imageBlob, {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadError) {
        // Если bucket не существует, используем исходный URL (fallback)
      } else {
        // Получаем публичный URL из Storage
        const { data: urlData } = supabase.storage
          .from("generated-images")
          .getPublicUrl(fileName);

        if (urlData?.publicUrl) {
          permanentImageUrl = urlData.publicUrl;
        }
      }
    } catch (storageError: any) {
      // Если ошибка при загрузке в Storage, используем исходный URL (fallback)
    }
    
    // Сохраняем в базу данных с постоянным URL
    const { data, error } = await supabase
      .from("free_generation_feed")
      .insert({
        user_id: userId,
        image_url: permanentImageUrl, // Используем постоянный URL из Storage
        prompt: prompt || null,
        aspect_ratio: aspectRatio,
        generation_mode: generationMode,
        scenario: scenario || null,
        is_favorite: isFavorite,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Ошибка сохранения в базу данных",
          details: error.message,
          code: error.code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        success: false, 
        error: "Внутренняя ошибка сервера",
        details: error?.message,
      },
      { status: 500 }
    );
  }
}
