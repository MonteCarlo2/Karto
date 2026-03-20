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
      videoUrl = null,          // URL видео (для media_type = "video")
      mediaType = "image",      // "image" | "video"
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

    // Для видео imageUrl опционален, для изображений — обязателен
    if (mediaType !== "video" && !imageUrl) {
      return NextResponse.json(
        { success: false, error: "imageUrl обязателен" },
        { status: 400 }
      );
    }

    if (mediaType === "video" && !videoUrl && !imageUrl) {
      return NextResponse.json(
        { success: false, error: "videoUrl обязателен для видео" },
        { status: 400 }
      );
    }

    const VALID_ASPECT_RATIOS = ["3:4", "4:3", "9:16", "1:1", "16:9", "21:9"];
    if (!aspectRatio || !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
      return NextResponse.json(
        { success: false, error: "Некорректное соотношение сторон" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    
    let permanentImageUrl = imageUrl || null;
    let permanentVideoUrl = videoUrl || null;

    if (mediaType === "image" && imageUrl) {
      // Скачиваем изображение с временного URL и сохраняем в Supabase Storage
      try {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) throw new Error(`HTTP ${imageResponse.status}`);
        
        const imageBlob = await imageResponse.blob();
        const fileName = `generated-images/${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
        
        const { error: uploadError } = await supabase.storage
          .from("generated-images")
          .upload(fileName, imageBlob, { contentType: "image/png", upsert: false });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("generated-images")
            .getPublicUrl(fileName);
          if (urlData?.publicUrl) permanentImageUrl = urlData.publicUrl;
        }
      } catch {
        // fallback: используем исходный URL
      }
    }

    // Сохраняем в базу данных (с поддержкой видео, если колонки уже добавлены)
    const insertPayload: Record<string, any> = {
      user_id: userId,
      image_url: permanentImageUrl,
      prompt: prompt || null,
      aspect_ratio: aspectRatio,
      generation_mode: generationMode,
      scenario: scenario || null,
      is_favorite: isFavorite,
    };

    // Добавляем поля видео только если они переданы
    if (mediaType === "video") {
      insertPayload.media_type = "video";
      insertPayload.video_url = permanentVideoUrl;
      // image_url имеет NOT NULL constraint — кладём туда же видео-URL
      // (при загрузке используем video_url, image_url служит fallback)
      insertPayload.image_url = permanentVideoUrl;
    }

    let { data, error } = await supabase
      .from("free_generation_feed")
      .insert(insertPayload)
      .select()
      .single();

    // Если INSERT не удался для видео — попробуем fallback без media_type/video_url.
    // Это защищает от ситуации, когда миграции/ограничения отличаются между окружениями.
    if (error && mediaType === "video") {
      const fallbackPayload = {
        user_id: userId,
        image_url: permanentVideoUrl || permanentImageUrl, // для видео храним URL в image_url
        prompt: prompt || null,
        aspect_ratio: aspectRatio,
        generation_mode: generationMode,
        scenario: scenario || null,
        is_favorite: isFavorite,
      };
      const fallback = await supabase
        .from("free_generation_feed")
        .insert(fallbackPayload)
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }

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
