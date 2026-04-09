import { NextResponse } from "next/server";
import { analyzePriceWithPerplexity } from "@/lib/services/price-analyzer";
import type { PriceAnalysis } from "@/lib/services/price-analyzer";

function fallbackAnalysis(productName: string, reason: string): PriceAnalysis {
  const q = encodeURIComponent(productName || "");
  const ozon = `https://www.ozon.ru/search/?text=${q}`;
  const wb = `https://www.wildberries.ru/catalog/0/search.aspx?search=${q}`;
  const yandex = `https://market.yandex.ru/search?text=${q}`;
  return {
    trends: [
      "Автоанализ цены временно недоступен; показаны ссылки для ручной проверки.",
    ],
    audience: "Недостаточно данных от источника анализа.",
    demandLevel: "Средний",
    recommendedPrice: 0,
    marginLevel: "Средняя",
    nicheSummary: "Отобразили резервный результат, чтобы этап не прерывался ошибкой.",
    priceExplanation: reason.slice(0, 300),
    competitors: [
      { platform: "Ozon", averagePrice: 0, link: ozon },
      { platform: "WB", averagePrice: 0, link: wb },
      { platform: "Yandex Market", averagePrice: 0, link: yandex },
    ],
    verdict:
      "Используйте ссылки маркетплейсов для быстрой ручной проверки диапазона цен. После этого можно повторить автоанализ.",
    sources: [
      { platform: "Ozon", title: "Поиск Ozon", url: ozon },
      { platform: "WB", title: "Поиск Wildberries", url: wb },
      { platform: "Yandex Market", title: "Поиск Яндекс Маркет", url: yandex },
    ],
  };
}

export async function POST(req: Request) {
  let productName = "";
  try {
    const body = await req.json();
    productName = String(body.productName || "");
    const photoUrl: string | undefined = body.photoUrl;

    const analysis = await analyzePriceWithPerplexity({
      productName,
      photoUrl,
    });

    return NextResponse.json({ success: true, data: analysis });
  } catch (error: any) {
    console.error("❌ Ошибка анализа цены:", error);
    return NextResponse.json(
      {
        success: true,
        data: fallbackAnalysis(
          productName,
          String(error?.message || "Ошибка анализа цены")
        ),
        degraded: true,
      },
      { status: 200 }
    );
  }
}

