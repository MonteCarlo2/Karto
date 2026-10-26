import type { SellerBoxTariffs } from "@/lib/seller-hub/types";

/**
 * Изменение тарифов WB на логистику и хранение: факт «тарифы выросли / снизились», без советов.
 * Сравниваем не отдельные склады, а то, что изменилось по сети: медиана изменения по общим складам. Один склад мог поправить
 * коэффициент ради приёмки, а событие нужно, когда WB поменял тарифы по сети.
 */

/** Склад → [логистика FBW короба 5 л, хранение короба 5 л в день], ₽. */
export type TariffSignals = Record<string, [number | null, number | null]>;

/** Эталонный короб, по которому сравниваем тарифы. */
export const REFERENCE_LITERS = 5;
/** Меньше складов — сравнивать нечего: список мог прийти не целиком. */
export const MIN_COMMON_WAREHOUSES = 10;
/** Изменение медианы меньше этого — шум округления, события нет. */
export const MIN_MEDIAN_CHANGE = 0.015;

const cost = (base: number | null, liter: number | null): number | null => (base == null ? null : Math.round((base + (liter ?? 0) * (REFERENCE_LITERS - 1)) * 100) / 100);

export function tariffSignalsFromSnapshot(tariffs: SellerBoxTariffs | undefined | null): TariffSignals | null {
  if (!tariffs || tariffs.warehouses.length === 0) return null;
  const out: TariffSignals = {};
  for (const w of tariffs.warehouses) out[w.name] = [cost(w.deliveryBase, w.deliveryLiter), cost(w.storageBase, w.storageLiter)];
  return out;
}

export type TariffChange = {
  metric: "logistics" | "storage";
  /** Медианное изменение, доля (0.05 = +5%). */
  median: number;
  compared: number;
  raised: number;
  lowered: number;
  example: { name: string; before: number; after: number };
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function diffTariffs(prev: TariffSignals | null | undefined, next: TariffSignals | null | undefined): TariffChange[] {
  if (!prev || !next) return [];
  const out: TariffChange[] = [];
  for (const [index, metric] of (["logistics", "storage"] as const).entries()) {
    const rows: Array<{ name: string; before: number; after: number; ratio: number }> = [];
    for (const [name, now] of Object.entries(next)) {
      const before = prev[name]?.[index];
      const after = now[index];
      if (before == null || after == null || before <= 0) continue;
      rows.push({ name, before, after, ratio: after / before - 1 });
    }
    if (rows.length < MIN_COMMON_WAREHOUSES) continue;
    const m = median(rows.map((r) => r.ratio));
    if (Math.abs(m) < MIN_MEDIAN_CHANGE) continue;
    const changed = rows.filter((r) => Math.abs(r.ratio) >= 0.005).sort((a, b) => a.ratio - b.ratio);
    // Пример берём из середины тех, что изменились: не самый крайний случай.
    const example = changed[Math.floor(changed.length / 2)] ?? rows[0]!;
    out.push({
      metric,
      median: m,
      compared: rows.length,
      raised: rows.filter((r) => r.ratio >= 0.005).length,
      lowered: rows.filter((r) => r.ratio <= -0.005).length,
      example: { name: example.name, before: example.before, after: example.after },
    });
  }
  return out;
}

const pct = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1).replace(".", ",")}%`;
const rub = (v: number) => `${v.toFixed(2).replace(".", ",")} ₽`;

export function describeTariffChange(change: TariffChange): { title: string; detail: string; up: boolean } {
  const up = change.median > 0;
  const what = change.metric === "logistics" ? "логистики" : "хранения";
  const title = up ? `WB повысил тарифы ${what}` : `WB снизил тарифы ${what}`;
  const side = up ? `подорожало на ${change.raised}` : `подешевело на ${change.lowered}`;
  const detail = `Короб ${REFERENCE_LITERS} л, медиана по ${change.compared} складам: ${pct(change.median)} (${side}). Например, ${change.example.name}: ${rub(change.example.before)} → ${rub(change.example.after)}${change.metric === "storage" ? " в день" : ""}`;
  return { title, detail, up };
}
