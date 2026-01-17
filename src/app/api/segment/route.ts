import { NextRequest, NextResponse } from "next/server";
import { removeBackground } from "@/lib/services/replicate";
import { downloadImage, getPublicUrl } from "@/lib/services/image-processing";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "imageUrl is required" },
        { status: 400 }
      );
    }

    console.log("📷 Сегментация изображения:", imageUrl);

    // Удаляем фон через Replicate API
    const resultUrl = await removeBackground(imageUrl);

    // Скачиваем результат локально
    const localPath = await downloadImage(resultUrl);
    const publicUrl = getPublicUrl(localPath);

    return NextResponse.json({
      success: true,
      originalUrl: imageUrl,
      resultUrl: resultUrl,
      localUrl: publicUrl,
      message: "Фон успешно удален",
    });
  } catch (error) {
    console.error("Ошибка сегментации:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении фона", details: String(error) },
      { status: 500 }
    );
  }
}
