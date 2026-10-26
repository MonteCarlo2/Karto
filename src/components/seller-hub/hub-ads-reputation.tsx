"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { buildReputation, MIN_REVIEWS_FOR_TREND } from "@/lib/seller-hub/reputation";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { formatInt, hub, HubEmptyState, HubPanel, HubPanelHeader, hubSans } from "./hub-ui";

const pct = (value: number | null) => (value == null ? "—" : `${value.toLocaleString("ru-RU")}%`);

function Card({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "warn" | "good" }) {
  const color = tone === "warn" ? hub.warn : tone === "good" ? hub.green : hub.text;
  return (
    <div className="rounded-2xl border px-4 py-3.5" style={{ borderColor: hub.border, backgroundColor: hub.surface }}>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
        {label}
      </p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums" style={{ ...hubSans, color }}>
        {value}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-4" style={{ ...hubSans, color: hub.textMuted }}>
        {sub}
      </p>
    </div>
  );
}

export function HubAdsReputation({ snapshot, titles }: { snapshot?: SellerCatalogSnapshot; titles: Map<string, string> }) {
  const feedbacks = snapshot?.feedbacks;
  const rep = useMemo(() => buildReputation(feedbacks), [feedbacks]);

  if (!rep) {
    return (
      <HubPanel>
        <HubEmptyState
          icon={<Star className="h-7 w-7" />}
          title="Отзывы пока не загружены"
          description={feedbacks?.error ?? "Нажмите «Обновить данные» в шапке. Для чтения отзывов в API-токене нужна категория «Вопросы и отзывы»."}
        />
      </HubPanel>
    );
  }

  const titleOf = (nmId: string) => titles.get(nmId) ?? `Артикул ${nmId}`;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Рейтинг магазина" value={rep.rating != null ? rep.rating.toLocaleString("ru-RU") : "—"} sub={`по ${formatInt(rep.reviews)} отзывам за полгода`} />
        <Card
          label="Негатив без ответа"
          value={formatInt(rep.unansweredNegative)}
          sub="отзывы 1–3★: отвечать стоит первыми"
          tone={rep.unansweredNegative > 0 ? "warn" : "good"}
        />
        <Card
          label="Вопросов без ответа"
          value={formatInt(rep.unansweredQuestions)}
          sub="непрочитанный вопрос — потерянный покупатель"
          tone={rep.unansweredQuestions > 0 ? "warn" : "good"}
        />
        <Card label="Всего отзывов без ответа" value={formatInt(rep.unanswered)} sub={`из них позитивных 4–5★: ${formatInt(rep.unansweredPositive)}`} />
      </div>

      {rep.risingProducts > 0 ? (
        <p className="rounded-xl px-4 py-2.5 text-[13px] leading-5" style={{ ...hubSans, color: hub.warn, backgroundColor: hub.warnSoft }}>
          У {rep.risingProducts} {rep.risingProducts === 1 ? "товара" : "товаров"} доля негатива за последние 28 дней выше, чем за предыдущие месяцы. Посмотрите причины в тексте отзывов:
          обычно это размер, качество или расхождение с фото.
        </p>
      ) : null}

      <HubPanel>
        <HubPanelHeader
          title="По товарам"
          hint={`Сверху те, где есть негатив без ответа или он растёт. Динамику считаем, когда отзывов не меньше ${MIN_REVIEWS_FOR_TREND} в каждом периоде.`}
        />
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead style={{ backgroundColor: hub.surfaceMuted }}>
              <tr>
                {["Товар", "Рейтинг", "Отзывов", "Без ответа", "Негатив без ответа", "Вопросов", "Доля негатива: 28 дн. / раньше"].map((label) => (
                  <th key={label} className="border-b px-4 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ borderColor: hub.border, color: hub.textMuted }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rep.rows.slice(0, 40).map((row) => (
                <tr key={row.nmId} className="border-b" style={{ borderColor: hub.borderSoft }}>
                  <td className="max-w-[260px] px-4 py-3 text-[13.5px]" style={{ color: hub.text }}>
                    <div className="truncate font-semibold">{titleOf(row.nmId)}</div>
                    <div className="text-[12px]" style={{ color: hub.textMuted }}>{row.nmId}</div>
                  </td>
                  <td className="px-4 py-3 text-[13.5px] tabular-nums">{row.rating != null ? row.rating.toLocaleString("ru-RU") : "—"}</td>
                  <td className="px-4 py-3 text-[13.5px] tabular-nums">{formatInt(row.reviews)}</td>
                  <td className="px-4 py-3 text-[13.5px] tabular-nums">{formatInt(row.unanswered)}</td>
                  <td className="px-4 py-3 text-[13.5px] font-semibold tabular-nums" style={{ color: row.unansweredNegative > 0 ? hub.danger : hub.textMuted }}>
                    {formatInt(row.unansweredNegative)}
                  </td>
                  <td className="px-4 py-3 text-[13.5px] tabular-nums">{formatInt(row.unansweredQuestions)}</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums" style={{ color: row.negativeRising ? hub.warn : hub.textMuted }}>
                    {row.negativeShareWindow != null || row.negativeShareBase != null
                      ? `${pct(row.negativeShareWindow)} / ${pct(row.negativeShareBase)}${row.negativeRising ? " ↑" : ""}`
                      : "мало отзывов"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HubPanel>

      <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
        Отвечать на отзывы и вопросы удобнее в модуле автоотзывов:{" "}
        <Link href="/studio/auto-replies/workspace" className="font-semibold underline" style={{ color: hub.text }}>
          открыть автоотзывы
        </Link>
        . Здесь только чтение данных WB.
      </p>
    </div>
  );
}
