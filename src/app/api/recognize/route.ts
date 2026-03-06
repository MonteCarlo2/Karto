import { NextRequest, NextResponse } from "next/server";
import { 
  recognizeProduct, 
  generateProductNamesFromDescription,
  getProductNamesFromReplicateGPT4oMini,
  getProductNamesFromReplicateClaude
} from "@/lib/services/replicate";

// Приоритет моделей:
// 1. Replicate → GPT-4o-mini (vision через Replicate) — основная модель
// 2. Replicate → Claude 3.7 Sonnet (vision через Replicate) — вторая попытка

/** Извлечение названий из описания — только как последний резерв, с жёсткой фильтрацией. */
function extractFromDescription(desc: string): string[] {
  if (!desc || desc.length < 5) return [];
  
  // Удаляем типичные начала предложений
  let t = desc
    .replace(/^(Этот|Данный) (товар|продукт|изображение) (представляет собой|является|это)\.?\s*/gi, "")
    .replace(/^На (фото|изображении|картинке) (виден|показан|находится|изображен)\s*/gi, "")
    .replace(/^(На|В) (фото|изображении) (виден|показан|—)\s*/gi, "")
    .trim();
  if (t.length < 4) return [];
  
  // Ищем существительные-товары и прилагательные рядом
  const productWords = /(ваза|кружка|кувшин|кубок|чашка|стакан|бутылка|банка|контейнер|коробка|игрушка|фигурка|сувенир|подарок|декор|украшение|аксессуар|предмет|изделие)/i;
  const parts = t.split(/[.;]/).map((p) => p.trim()).filter((p) => p.length >= 4 && p.length < 120);
  const out: string[] = [];
  
  for (const p of parts.slice(0, 5)) {
    // Пропускаем, если это предложение (содержит глаголы/описания)
    if (/(имеет|стоит|украшена|украшен|сделан|предназначен|которая|который|примерно|цвет и|— это)/i.test(p)) continue;
    
    // Если есть слово-товар, пытаемся извлечь его с прилагательными
    const match = p.match(productWords);
    if (match) {
      const idx = match.index || 0;
      const before = p.substring(0, idx).trim().split(/\s+/).slice(-2).join(" "); // 2 слова до
      const after = p.substring(idx).split(/\s+/).slice(0, 4).join(" "); // до 4 слов после
      const candidate = (before + " " + after).trim().replace(/\s+/g, " ");
      if (candidate.length >= 4 && candidate.length <= 52 && !/(имеет|стоит|украшена|— это)/i.test(candidate)) {
        out.push(candidate);
      }
    } else {
      // Нет явного слова-товара — берём первые 5 слов, если не предложение
      const words = p.split(/\s+/).slice(0, 5).join(" ").replace(/,+\s*$/, "").trim();
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
];

function isNetworkError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? (e as any)?.code ?? "");
  return NETWORK_ERROR_PATTERNS.some((p) => msg.includes(p));
}

export async function POST(request: NextRequest) {
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
      return NextResponse.json(
        { error: "Изображение не предоставлено" },
        { status: 400 }
      );
    }

    console.log("🔄 Определяем товар на изображении...");

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    let namesList: string[] = [];
    let description = "";

    // 1) GPT-4o-mini через Replicate — основная модель
    let gpt4oMiniSuccess = false;
    try {
      console.log("🔄 Попытка 1: GPT-4o-mini (Replicate)...");
      namesList = await getProductNamesFromReplicateGPT4oMini(dataUrl);
      if (namesList.length > 0) {
        console.log("✅ Названия получены через GPT-4o-mini (Replicate)");
        gpt4oMiniSuccess = true;
        return NextResponse.json({
          success: true,
          names: namesList,
          description: "",
          message: "Товар успешно определен",
        });
      } else {
        console.log("⚠️ GPT-4o-mini (Replicate) вернул пустой результат, переключаемся на Claude 4 Sonnet");
      }
    } catch (e: any) {
      const errorMessage = String(e?.message || e || "");
      console.error("❌ GPT-4o-mini (Replicate) упал с ошибкой:", errorMessage);
      if (isNetworkError(e)) {
        console.error("❌ Ошибка сети до Replicate — с хостинга нет доступа к api.replicate.com");
        return NextResponse.json(
          {
            error: "network",
            message: "Сервис распознавания недоступен: с сервера не удаётся связаться с Replicate. Проверьте, что хостинг не блокирует исходящие запросы к api.replicate.com, или введите название вручную.",
          },
          { status: 503 }
        );
      }
      if (errorMessage.includes("insufficient_quota") || errorMessage.includes("quota")) {
        console.warn("⚠️ GPT-4o-mini (Replicate): закончилась квота, переключаемся на Claude 4 Sonnet");
      } else {
        console.warn("⚠️ GPT-4o-mini (Replicate) failed, переключаемся на Claude 4 Sonnet");
      }
    }
    
    // Если GPT-4o-mini не сработал, обязательно вызываем Claude
    if (!gpt4oMiniSuccess) {

      // 2) Claude 4 Sonnet через Replicate — вторая попытка после GPT-4o-mini
      console.log("🔄 Попытка 2: Переключаемся на Claude 4 Sonnet (Replicate)...");
      try {
        namesList = await getProductNamesFromReplicateClaude(dataUrl);
        console.log("📊 Claude вернул результатов:", namesList.length);
        if (namesList.length > 0) {
          console.log("✅ Названия получены через Claude 4 Sonnet (Replicate)");
          return NextResponse.json({
            success: true,
            names: namesList,
            description: "",
            message: "Товар успешно определен",
          });
        } else {
          console.log("⚠️ Claude 4 Sonnet (Replicate) вернул пустой результат, переключаемся на альтернативные модели");
        }
      } catch (e: any) {
        console.error("❌ Claude 4 Sonnet (Replicate) failed:", e);
        if (isNetworkError(e)) {
          return NextResponse.json(
            {
              error: "network",
              message: "Сервис распознавания недоступен: с сервера не удаётся связаться с Replicate. Введите название вручную.",
            },
            { status: 503 }
          );
        }
      }
    }

    // 3) Replicate: описание (LLaVA) + названия из описания (Mistral) — последний резерв
    description = await recognizeProduct(dataUrl);
    namesList = await generateProductNamesFromDescription(description);

    // 3) Fallback: извлечь короткие фразы из описания
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
  } catch (error: any) {
    if (timeoutId.current) clearTimeout(timeoutId.current);
    const msg = String(error?.message ?? error);
    if (msg.includes("RECOGNIZE_TIMEOUT")) {
      console.error("❌ Таймаут распознавания (35 с)");
      return NextResponse.json(
        {
          error: "timeout",
          message: "Сервис распознавания не ответил вовремя. С хостинга может не быть доступа к Replicate. Введите название вручную.",
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
