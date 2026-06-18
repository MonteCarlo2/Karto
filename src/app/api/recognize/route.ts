import { NextRequest, NextResponse } from "next/server";
import {
  describeProductFromImageOpenRouter,
  generateProductNamesFromDescriptionOpenRouter,
  getProductNamesFromOpenRouterVision,
  getProductNamesFromOpenRouterVisionFallback,
  isOpenRouterConfigured,
} from "@/lib/services/openrouter-product-vision";

/** Извлечение названий из описания — только как последний резерв, с жёсткой фильтрацией. */
function extractFromDescription(desc: string): string[] {
  if (!desc || desc.length < 5) return [];

  let t = desc
    .replace(/^(Этот|Данный) (товар|продукт|изображение) (представляет собой|является|это)\.?\s*/gi, "")
    .replace(/^На (фото|изображении|картинке) (виден|показан|находится|изображен)\s*/gi, "")
    .replace(/^(На|В) (фото|изображении) (виден|показан|—)\s*/gi, "")
    .trim();
  if (t.length < 4) return [];

  const productWords =
    /(ваза|кружка|кувшин|кубок|чашка|стакан|бутылка|банка|контейнер|коробка|игрушка|фигурка|сувенир|подарок|декор|украшение|аксессуар|предмет|изделие)/i;
  const parts = t
    .split(/[.;]/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 4 && p.length < 120);
  const out: string[] = [];

  for (const p of parts.slice(0, 5)) {
    if (/(имеет|стоит|украшена|украшен|сделан|предназначен|которая|который|примерно|цвет и|— это)/i.test(p)) {
      continue;
    }

    const match = p.match(productWords);
    if (match) {
      const idx = match.index || 0;
      const before = p
        .substring(0, idx)
        .trim()
        .split(/\s+/)
        .slice(-2)
        .join(" ");
      const after = p
        .substring(idx)
        .split(/\s+/)
        .slice(0, 4)
        .join(" ");
      const candidate = (before + " " + after).trim().replace(/\s+/g, " ");
      if (candidate.length >= 4 && candidate.length <= 52 && !/(имеет|стоит|украшена|— это)/i.test(candidate)) {
        out.push(candidate);
      }
    } else {
      const words = p
        .split(/\s+/)
        .slice(0, 5)
        .join(" ")
        .replace(/,+\s*$/, "")
        .trim();
      if (words.length >= 4 && words.length <= 52 && !/(имеет|стоит|украшена|которая|который|— это)/i.test(words)) {
        out.push(words);
      }
    }
  }

  return out.slice(0, 5);
}

const RECOGNIZE_TIMEOUT_MS = 35_000;
const NETWORK_ERROR_PATTERNS = [
  "Connect Timeout",
  "fetch failed",
  "UND_ERR_CONNECT_TIMEOUT",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "AbortError",
  "timeout",
];

function isNetworkError(e: unknown): boolean {
  const msg = String((e as { message?: string; code?: string })?.message ?? (e as { code?: string })?.code ?? "");
  return NETWORK_ERROR_PATTERNS.some((p) => msg.toLowerCase().includes(p.toLowerCase()));
}

export async function POST(request: NextRequest) {
  if (!isOpenRouterConfigured()) {
    return NextResponse.json(
      {
        error: "config",
        message: "OPENROUTER_API_KEY не настроен на сервере. Добавьте ключ в Timeweb и пересоберите приложение.",
      },
      { status: 503 }
    );
  }

  const timeoutId = { current: null as ReturnType<typeof setTimeout> | null };
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId.current = setTimeout(() => {
      reject(new Error("RECOGNIZE_TIMEOUT"));
    }, RECOGNIZE_TIMEOUT_MS);
  });

  const run = async () => {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Изображение не предоставлено" }, { status: 400 });
    }

    console.log("🔄 Определяем товар на изображении (OpenRouter)...");

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    let namesList: string[] = [];
    let description = "";

    let primarySuccess = false;
    try {
      console.log("🔄 Попытка 1: vision primary (OpenRouter)...");
      namesList = await getProductNamesFromOpenRouterVision(dataUrl);
      if (namesList.length > 0) {
        console.log("✅ Названия получены через OpenRouter (primary)");
        primarySuccess = true;
        return NextResponse.json({
          success: true,
          names: namesList,
          description: "",
          message: "Товар успешно определен",
        });
      }
      console.log("⚠️ Primary vision вернул пустой результат, переключаемся на fallback");
    } catch (e) {
      const errorMessage = String((e as Error)?.message || e || "");
      console.error("❌ OpenRouter primary vision:", errorMessage);
      if (isNetworkError(e)) {
        return NextResponse.json(
          {
            error: "network",
            message:
              "Сервис распознавания недоступен: нет связи с OpenRouter. Проверьте исходящий HTTPS к openrouter.ai или введите название вручную.",
          },
          { status: 503 }
        );
      }
    }

    if (!primarySuccess) {
      try {
        console.log("🔄 Попытка 2: vision fallback (OpenRouter)...");
        namesList = await getProductNamesFromOpenRouterVisionFallback(dataUrl);
        if (namesList.length > 0) {
          console.log("✅ Названия получены через OpenRouter (fallback)");
          return NextResponse.json({
            success: true,
            names: namesList,
            description: "",
            message: "Товар успешно определен",
          });
        }
      } catch (e) {
        console.error("❌ OpenRouter fallback vision:", e);
        if (isNetworkError(e)) {
          return NextResponse.json(
            {
              error: "network",
              message: "Сервис распознавания недоступен. Введите название вручную.",
            },
            { status: 503 }
          );
        }
      }
    }

    try {
      description = await describeProductFromImageOpenRouter(dataUrl);
      namesList = await generateProductNamesFromDescriptionOpenRouter(description);
    } catch (e) {
      console.warn("⚠️ Резерв describe+names failed:", e);
    }

    if (namesList.length === 0) {
      namesList = extractFromDescription(description);
    }

    if (namesList.length === 0) {
      namesList = ["Не удалось определить"];
    }

    return NextResponse.json({
      success: true,
      names: namesList,
      description,
      message: "Товар успешно определен",
    });
  };

  try {
    const result = await Promise.race([run(), timeoutPromise]);
    if (timeoutId.current) clearTimeout(timeoutId.current);
    return result;
  } catch (error) {
    if (timeoutId.current) clearTimeout(timeoutId.current);
    const msg = String((error as Error)?.message ?? error);
    if (msg.includes("RECOGNIZE_TIMEOUT")) {
      return NextResponse.json(
        {
          error: "timeout",
          message: "Сервис распознавания не ответил вовремя. Введите название вручную.",
        },
        { status: 503 }
      );
    }
    if (isNetworkError(error)) {
      return NextResponse.json(
        {
          error: "network",
          message: "Сервис распознавания недоступен. Введите название вручную.",
        },
        { status: 503 }
      );
    }
    console.error("❌ Ошибка определения товара:", error);
    return NextResponse.json(
      { error: "Ошибка при определении товара", details: msg },
      { status: 500 }
    );
  }
}
