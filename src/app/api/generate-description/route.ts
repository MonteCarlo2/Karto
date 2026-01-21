import { NextRequest, NextResponse } from "next/server";
import { generateProductDescription } from "@/lib/services/replicate";

/**
 * Генерация 4 вариантов описания товара через GPT-4o-mini
 * ВАЖНО: Все операции через серверный API route для безопасности
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      product_name,
      photo_url,
      user_preferences = "",
      selected_blocks = [],
      wants_stickers = false,
    } = body;

    // Валидация
    if (!product_name) {
      return NextResponse.json(
        { error: "product_name обязателен" },
        { status: 400 }
      );
    }

    console.log("🔄 Генерируем 4 варианта описания для:", product_name);

    // Генерируем 4 варианта параллельно
    const descriptions = await Promise.all([
      generateProductDescription(
        product_name,
        user_preferences,
        selected_blocks,
        photo_url,
        1, // Официальный
        wants_stickers,
        undefined
      ).catch((e) => {
        console.error("Ошибка генерации варианта 1:", e);
        return `Описание товара "${product_name}". Официальный стиль с акцентом на характеристики и технические детали.`;
      }),
      generateProductDescription(
        product_name,
        user_preferences,
        selected_blocks,
        photo_url,
        2, // Продающий
        wants_stickers,
        undefined
      ).catch((e) => {
        console.error("Ошибка генерации варианта 2:", e);
        return `Описание товара "${product_name}". Продающий стиль с акцентом на преимущества и выгоды для покупателя.`;
      }),
      generateProductDescription(
        product_name,
        user_preferences,
        selected_blocks,
        photo_url,
        3, // Структурированный
        wants_stickers,
        undefined
      ).catch((e) => {
        console.error("Ошибка генерации варианта 3:", e);
        return `Описание товара "${product_name}". Структурированный стиль с четкой организацией информации.`;
      }),
      generateProductDescription(
        product_name,
        user_preferences,
        selected_blocks,
        photo_url,
        4, // Сбалансированный
        wants_stickers,
        undefined
      ).catch((e) => {
        console.error("Ошибка генерации варианта 4:", e);
        return `Описание товара "${product_name}". Сбалансированный стиль, сочетающий все элементы описания.`;
      }),
    ]);

    const variants = [
      {
        id: 1,
        style: "Официальный",
        description: descriptions[0],
        preview: descriptions[0].substring(0, 150) + "...",
      },
      {
        id: 2,
        style: "Продающий",
        description: descriptions[1],
        preview: descriptions[1].substring(0, 150) + "...",
      },
      {
        id: 3,
        style: "Структурированный",
        description: descriptions[2],
        preview: descriptions[2].substring(0, 150) + "...",
      },
      {
        id: 4,
        style: "Сбалансированный",
        description: descriptions[3],
        preview: descriptions[3].substring(0, 150) + "...",
      },
    ];

    console.log("✅ Все 4 варианта описания сгенерированы");

    return NextResponse.json({
      success: true,
      variants,
    });
  } catch (error: any) {
    console.error("Ошибка API:", error);
    console.error("Детали ошибки:", error?.message, error?.stack);
    return NextResponse.json(
      { 
        error: "Ошибка генерации описаний",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * Перегенерация одного варианта описания с учетом правок
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      product_name,
      photo_url,
      user_preferences = "",
      selected_blocks = [],
      current_description,
      edit_instructions,
      wants_stickers = false,
      selected_style = 4, // Стиль выбранного варианта
    } = body;

    if (!product_name || !current_description || !edit_instructions) {
      return NextResponse.json(
        { error: "product_name, current_description и edit_instructions обязательны" },
        { status: 400 }
      );
    }

    console.log("🔄 Перегенерируем описание с учетом правок");

    // Объединяем текущие пожелания с новыми правками и даём модели исходный текст
    const editsBlock = `Конкретные правки: ${edit_instructions}. Если нужно сократить, сделай текст заметно короче.`;
    const combinedPreferences = user_preferences
      ? `${user_preferences}. ${editsBlock}`
      : editsBlock;

    // Генерируем улучшенное описание (используем стиль выбранного варианта + исходный текст)
    const improvedDescription = await generateProductDescription(
      product_name,
      combinedPreferences,
      selected_blocks,
      photo_url,
      selected_style as 1 | 2 | 3 | 4, // Используем стиль выбранного варианта
      wants_stickers,
      current_description
    ).catch((e) => {
      console.error("Ошибка перегенерации:", e);
      return current_description; // Возвращаем исходное при ошибке
    });

    return NextResponse.json({
      success: true,
      description: improvedDescription,
    });
  } catch (error: any) {
    console.error("Ошибка API:", error);
    console.error("Детали ошибки:", error?.message, error?.stack);
    return NextResponse.json(
      { 
        error: "Ошибка перегенерации описания",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      },
      { status: 500 }
    );
  }
}
