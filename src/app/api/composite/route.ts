import { NextRequest, NextResponse } from "next/server";
import { compositeImages, downloadImage } from "@/lib/services/image-processing";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      productUrl, 
      backgroundUrl,
      productScale = 0.7,
      positionX = 0.5,
      positionY = 0.55,
      addShadow = true,
    } = body;

    if (!productUrl || !backgroundUrl) {
      return NextResponse.json(
        { error: "productUrl and backgroundUrl are required" },
        { status: 400 }
      );
    }

    console.log("🖼️ Композитинг изображений");
    console.log("Товар:", productUrl);
    console.log("Фон:", backgroundUrl);

    // Определяем пути к файлам
    let productPath: string;
    let backgroundPath: string;

    // Если URL локальный (/temp/... или /output/...), преобразуем в путь
    if (productUrl.startsWith("/")) {
      productPath = path.join(process.cwd(), "public", productUrl);
    } else {
      productPath = await downloadImage(productUrl);
    }

    if (backgroundUrl.startsWith("/")) {
      backgroundPath = path.join(process.cwd(), "public", backgroundUrl);
    } else {
      backgroundPath = await downloadImage(backgroundUrl);
    }

    // Выполняем композитинг
    const resultUrl = await compositeImages(productPath, backgroundPath, {
      productScale,
      positionX,
      positionY,
      addShadow,
    });

    return NextResponse.json({
      success: true,
      resultUrl: resultUrl,
      options: {
        productScale,
        positionX,
        positionY,
        addShadow,
      },
      message: "Композитинг выполнен",
    });
  } catch (error) {
    console.error("Ошибка композитинга:", error);
    return NextResponse.json(
      { error: "Ошибка при композитинге", details: String(error) },
      { status: 500 }
    );
  }
}
