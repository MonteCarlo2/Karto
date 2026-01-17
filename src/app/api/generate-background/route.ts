import { NextRequest, NextResponse } from "next/server";
import { generateBackground } from "@/lib/services/replicate";
import { downloadImage, getPublicUrl } from "@/lib/services/image-processing";

// Предустановленные промпты для разных стилей фона
const BACKGROUND_PRESETS: Record<string, string> = {
  studio: "Professional product photography studio background, soft gradient lighting, clean white and light gray surface, subtle shadows, minimalist, high-end commercial photography style",
  gradient: "Smooth gradient background, professional product showcase, soft blue to white gradient, clean and modern, studio lighting",
  lifestyle: "Elegant lifestyle setting, wooden surface, soft natural lighting, cozy atmosphere, professional product photography",
  modern: "Modern abstract background, geometric shapes, soft pastel colors, professional product showcase, minimalist design",
  nature: "Natural setting background, soft bokeh effect, green plants out of focus, wooden elements, organic feel, professional product photography",
  premium: "Luxury premium background, dark elegant surface, gold accents, soft spotlight, high-end product showcase, professional studio lighting",
  colorful: "Vibrant colorful background, professional product photography, bold gradients, modern and eye-catching, clean composition",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      preset = "studio", 
      customPrompt,
      width = 1024, 
      height = 1024 
    } = body;

    // Используем кастомный промпт или предустановленный
    const prompt = customPrompt || BACKGROUND_PRESETS[preset] || BACKGROUND_PRESETS.studio;

    console.log("🎨 Генерация фона:", preset);
    console.log("Промпт:", prompt);

    // Генерируем фон через SDXL
    const resultUrl = await generateBackground(prompt, width, height);

    // Скачиваем результат локально
    const localPath = await downloadImage(resultUrl);
    const publicUrl = getPublicUrl(localPath);

    return NextResponse.json({
      success: true,
      resultUrl: resultUrl,
      localUrl: publicUrl,
      preset: preset,
      prompt: prompt,
      width: width,
      height: height,
      message: "Фон сгенерирован",
    });
  } catch (error) {
    console.error("Ошибка генерации фона:", error);
    return NextResponse.json(
      { error: "Ошибка при генерации фона", details: String(error) },
      { status: 500 }
    );
  }
}

// Возвращаем список доступных пресетов
export async function GET() {
  return NextResponse.json({
    presets: Object.keys(BACKGROUND_PRESETS),
    descriptions: {
      studio: "Студийный белый фон",
      gradient: "Градиентный фон",
      lifestyle: "Лайфстайл (деревянная поверхность)",
      modern: "Современный абстрактный",
      nature: "Природный с размытием",
      premium: "Премиальный темный",
      colorful: "Яркий цветной",
    },
  });
}
