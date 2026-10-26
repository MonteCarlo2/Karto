"use client";

import { useEffect, useMemo, useState } from "react";
import { lastFullDaysRange, snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import { loadSellerHubSearchTexts } from "@/lib/seller-hub/client-api";
import { analyzeSearchTexts, type SeoRow } from "@/lib/seller-hub/seo";
import type { SellerCatalogSnapshot, SellerSearchTexts } from "@/lib/seller-hub/types";
import { formatInt, hub, HubButton, hubNumeric, hubSans } from "./hub-ui";

function shiftDate(iso: string, deltaDays: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

const POSITION_STYLE: Record<SeoRow["positionClass"], { label: string; color: string }> = {
  top10: { label: "в топ-10", color: hub.greenDark },
  mid: { label: "11–40", color: hub.warn },
  low: { label: "ниже 40", color: hub.danger },
};

/** Поиск и SEO: по каким запросам находят товар, где вы в выдаче и каких слов не хватает карточке. Только чтение, данные WB. */
export function HubSeo({ snapshot, connected }: { snapshot?: SellerCatalogSnapshot; connected?: boolean }) {
  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);
  /** Товары в порядке спроса: сначала те, что чаще заказывают. */
  const options = useMemo(() => {
    const orders = (nm: string) => snapshot?.funnel?.byNm?.[nm]?.orders ?? 0;
    return [...items].sort((a, b) => orders(b.externalId) - orders(a.externalId)).slice(0, 60);
  }, [items, snapshot?.funnel]);
  const [nmId, setNmId] = useState<string>("");
  const selectedNm = nmId || options[0]?.externalId || "";
  const selected = items.find((item) => item.externalId === selectedNm) ?? null;
  const [data, setData] = useState<{ nmId: string; texts: SellerSearchTexts; stale?: boolean } | null>(null);
  const [error, setError] = useState<{ nmId: string; message: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const nowMs = snapshotTimeMs(snapshot);
  const range = useMemo(() => lastFullDaysRange(nowMs || Date.parse("2026-01-01"), 7), [nowMs]);

  useEffect(() => {
    if (!connected || !selectedNm || !nowMs) return;
    let cancelled = false;
    void loadSellerHubSearchTexts({
      nmId: Number(selectedNm),
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      pastDateFrom: shiftDate(range.dateFrom, -7),
      pastDateTo: shiftDate(range.dateTo, -7),
      refresh: refreshKey > 0,
    })
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.texts) {
          setData({ nmId: selectedNm, texts: result.texts, stale: result.stale });
          setError(null);
        } else {
          setError({ nmId: selectedNm, message: result.error ?? "Не удалось загрузить поисковые запросы" });
        }
      })
      .catch(() => !cancelled && setError({ nmId: selectedNm, message: "Не удалось загрузить поисковые запросы" }));
    return () => {
      cancelled = true;
    };
  }, [connected, selectedNm, nowMs, range, refreshKey]);

  const shown = data && data.nmId === selectedNm ? data : null;
  const analysis = useMemo(
    () =>
      shown && selected
        ? analyzeSearchTexts(shown.texts.rows, { title: selected.title ?? "", description: selected.description ?? null })
        : null,
    [shown, selected],
  );
  const loading = connected === true && !shown && !(error && error.nmId === selectedNm);
  const [copied, setCopied] = useState(false);

  if (!connected || options.length === 0) {
    return (
      <p className="rounded-2xl px-5 py-6 text-[13px]" style={{ ...hubSans, color: hub.textMuted, backgroundColor: hub.surface }}>
        Подключите кабинет и выгрузите каталог: поисковые запросы строятся по вашим товарам.
      </p>
    );
  }

  async function copyKeywords() {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(analysis.missingKeywords.map((k) => k.word).join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* буфер обмена недоступен */
    }
  }

  const topCount = analysis?.rows.filter((row) => row.positionClass === "top10").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
        <label className="min-w-0 flex-1 text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
          Товар
          <select
            value={selectedNm}
            onChange={(event) => setNmId(event.target.value)}
            className="mt-1 w-full rounded-[11px] border px-3 py-2 text-[14px] outline-none"
            style={{ ...hubSans, backgroundColor: hub.inputBg, borderColor: hub.inputBorder, color: hub.text }}
          >
            {options.map((item) => (
              <option key={item.externalId} value={item.externalId}>
                {item.title || item.vendorCode || item.externalId}
              </option>
            ))}
          </select>
        </label>
        <HubButton variant="secondary" size="sm" onClick={() => setRefreshKey((n) => n + 1)}>
          Обновить
        </HubButton>
        <p className="w-full text-[12px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
          Запросы покупателей в поиске WB за {range.dateFrom} — {range.dateTo} (до 30 самых результативных по заказам).
          WB обновляет отчёт раз в 2 часа.
        </p>
      </div>

      <p className="rounded-xl px-4 py-2.5 text-[12.5px] leading-5" style={{ ...hubSans, backgroundColor: hub.surfaceMuted, color: hub.textMuted }}>
        Позиции товара в поиске по запросам покупателей WB отдаёт только в отчёте для подписки Джем. Без подписки Джем собрать эти данные не получится. Для запросов, по которым идёт ваша реклама,
        средняя позиция видна на вкладке «Запросы и ставки», и она доступна без Джем.
      </p>
      {error && error.nmId === selectedNm ? (
        <p className="rounded-2xl px-5 py-4 text-[13px]" style={{ ...hubSans, color: hub.danger, backgroundColor: hub.surface }}>
          {error.message}
        </p>
      ) : null}
      {loading ? (
        <p className="rounded-2xl px-5 py-6 text-[13px]" style={{ ...hubSans, color: hub.textMuted, backgroundColor: hub.surface }}>
          Загружаю поисковые запросы…
        </p>
      ) : null}
      {shown?.stale ? (
        <p className="text-[12.5px]" style={{ ...hubSans, color: hub.warn }}>
          WB сейчас не ответил, показаны последние сохранённые данные.
        </p>
      ) : null}

      {analysis && analysis.rows.length === 0 ? (
        <p className="rounded-2xl px-5 py-6 text-[13px]" style={{ ...hubSans, color: hub.textMuted, backgroundColor: hub.surface }}>
          По этому товару WB не вернул поисковых запросов за период: нет показов в поиске или мало данных.
        </p>
      ) : null}

      {analysis && analysis.rows.length > 0 ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
              <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                Чего не хватает карточке
              </p>
              {analysis.missingKeywords.length > 0 ? (
                <>
                  <p className="mb-2 mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                    Слова из запросов, по которым вас ищут, но которых нет ни в названии, ни в описании. Добавьте самые
                    частые в описание и название.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.missingKeywords.map((k) => (
                      <span
                        key={k.word}
                        className="rounded-full px-2.5 py-1 text-[12.5px]"
                        style={{ ...hubSans, backgroundColor: hub.canvas, color: hub.text }}
                        title={`Встречается в запросах с общей частотой ${formatInt(k.frequency)}`}
                      >
                        {k.word}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3">
                    <HubButton size="sm" variant="secondary" onClick={() => void copyKeywords()}>
                      {copied ? "Скопировано" : "Скопировать слова"}
                    </HubButton>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
                  Все слова из ваших топ-запросов уже есть в названии или описании.
                </p>
              )}
            </section>

            <section className="rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
              <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                Куда расти
              </p>
              <p className="mb-2 mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                В топ-10 по {formatInt(topCount)} из {formatInt(analysis.rows.length)} запросов. Ниже самые частые запросы, где
                вы пока не в топ-10: туда стоит двигаться через описание, ставку в рекламе или цену.
              </p>
              {analysis.growth.length > 0 ? (
                <ul className="space-y-1.5">
                  {analysis.growth.map((row) => (
                    <li key={row.text} className="flex items-baseline justify-between gap-3 text-[13px]" style={hubSans}>
                      <span style={{ color: hub.text }}>{row.text}</span>
                      <span style={{ ...hubNumeric, color: hub.textMuted }}>
                        {formatInt(row.frequency ?? 0)} раз · позиция {row.avgPosition ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px]" style={{ ...hubSans, color: hub.greenDark }}>
                  По частым запросам вы уже в топ-10.
                </p>
              )}
            </section>
          </div>

          <div className="overflow-x-auto rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
            <table className="min-w-full border-collapse text-left">
              <thead style={{ backgroundColor: hub.surfaceMuted }}>
                <tr>
                  {["Запрос", "Вводили", "Позиция", "Переходы", "В корзину, %", "Заказы", "Видимость, %"].map((label) => (
                    <th
                      key={label}
                      className="border-b px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em]"
                      style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analysis.rows.map((row) => {
                  const style = POSITION_STYLE[row.positionClass];
                  return (
                    <tr key={row.text} className="border-b" style={{ borderColor: hub.borderSoft }}>
                      <td className="px-3 py-2.5 text-[13px] font-medium" style={hubSans}>
                        {row.text}
                        {row.missingWords.length > 0 ? (
                          <span className="ml-1.5 text-[11.5px]" style={{ color: hub.warn }}>
                            нет в карточке: {row.missingWords.join(", ")}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[13px]" style={{ ...hubSans, ...hubNumeric }}>
                        {row.frequency != null ? formatInt(row.frequency) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: style.color }}>
                        {row.avgPosition != null ? row.avgPosition : "—"} <span className="font-normal">({style.label})</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[13px]" style={{ ...hubSans, ...hubNumeric }}>
                        {row.openCard != null ? formatInt(row.openCard) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[13px]" style={{ ...hubSans, ...hubNumeric }}>
                        {row.openToCart != null ? row.openToCart : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[13px]" style={{ ...hubSans, ...hubNumeric }}>
                        {row.orders != null ? formatInt(row.orders) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[13px]" style={{ ...hubSans, ...hubNumeric }}>
                        {row.visibility != null ? row.visibility : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
