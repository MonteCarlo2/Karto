import { NextRequest, NextResponse } from "next/server";
import { enhanceImage } from "@/lib/services/replicate";
import { downloadImage, getPublicUrl } from "@/lib/services/image-processing";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, scale = 2 } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "imageUrl is required" },
        { status: 400 }
      );
    }

    console.log("🔍 Улучшение качества изображения:", imageUrl);

    // Улучшаем качество через Real-ESRGAN
    const resultUrl = await enhanceImage(imageUrl, scale);

    // Скачиваем результат локально
    const localPath = await downloadImage(resultUrl);
    const publicUrl = getPublicUrl(localPath);

    return NextResponse.json({
      success: true,
      originalUrl: imageUrl,
      resultUrl: resultUrl,
      localUrl: publicUrl,
      scale: scale,
      message: "Качество улучшено",
    });
  } catch (error) {
    console.error("Ошибка улучшения:", error);
    return NextResponse.json(
      { error: "Ошибка при улучшении качества", details: String(error) },
      { status: 500 }
    );
  }
}
