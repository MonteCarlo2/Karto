import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { formatWbCategoryDisplayName, searchWbCategories, wbTariffMeta } from "@/lib/unit-economics/wb/tariffs";

export const dynamic = "force-dynamic";

const MAX_QUERIES = 60;
const MATCHES_PER_QUERY = 4;

/**
 * Комиссии WB для категорий магазина по официальной таблице (КВВ). Нужна только авторизация в KARTO: к WB запрос не идёт.
 * Совпадение по названию категории приблизительное, поэтому возвращаем несколько ближайших строк таблицы: пользователь видит, какая именно строка найдена.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { categories?: unknown } | null;
  const raw = Array.isArray(body?.categories) ? body!.categories : [];
  const categories = [...new Set(raw.filter((c): c is string => typeof c === "string").map((c) => c.trim()).filter((c) => c.length > 0 && c.length <= 120))].slice(0, MAX_QUERIES);
  if (categories.length === 0) return NextResponse.json({ ok: false, error: "Укажите категории" }, { status: 400 });

  const results = categories.map((query) => ({
    query,
    matches: searchWbCategories(query, MATCHES_PER_QUERY).map((item) => ({
      name: formatWbCategoryDisplayName(item.name),
      commissionFbw: item.commissionFbw,
      commissionFbs: item.commissionFbs,
    })),
  }));
  return NextResponse.json({ ok: true, effectiveFrom: wbTariffMeta.commissionsEffectiveFrom, source: wbTariffMeta.commissionSource, results });
}
