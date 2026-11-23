"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Star } from "lucide-react";

const ratingColor = (r: number | null) => (r == null ? "#9AA0A6" : r >= 4.7 ? "#2E9E6B" : r >= 4.3 ? "#D9912B" : "#C8453F");
import { buildReputation, MIN_REVIEWS_FOR_TREND } from "@/lib/seller-hub/reputation";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { Card } from "./hub-analytics-ui";
import { Thumb } from "./hub-fulfillment-ui";
import { HelpTip } from "./hub-help-tip";
import { formatInt, hub, HubButton, HubEmptyState, hubSans } from "./hub-ui";
import { usePagedLimit } from "./use-paged-limit";

const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;
const LINE = "rgba(1, 20, 8, 0.1)";
const GRID = "md:grid-cols-[minmax(0,2fr)_repeat(5,minmax(70px,0.7fr))_minmax(150px,1.2fr)]";

const pct = (value: number | null) => (value == null ? "—" : `${value.toLocaleString("ru-RU")}%`);

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="min-w-0" style={{ containerType: "inline-size" }}>
      <p className="text-[15px]" style={{ ...hubSans, color: hub.textSubtle }}>
        {label}
      </p>
      <p className="mt-2 whitespace-nowrap font-medium leading-none" style={{ ...MONO, fontSize: "clamp(20px, 15cqw, 32px)", color: color ?? hub.text }}>
        {value}
      </p>
      <p className="mt-2 text-[14.5px] leading-[1.4]" style={{ ...hubSans, color: hub.textMuted }}>
        {sub}
      </p>
    </div>
  );
}

export function HubAdsReputation({ snapshot, titles, photos }: { snapshot?: SellerCatalogSnapshot; titles: Map<string, string>; photos?: Map<string, string | undefined> }) {
  const feedbacks = snapshot?.feedbacks;
  const rep = useMemo(() => buildReputation(feedbacks), [feedbacks]);
  const paged = usePagedLimit("rep", 10, 10);

  if (!rep) {
    return (
      <Card title="Репутация">
        <HubEmptyState
          icon={<Star className="h-7 w-7" />}
          title="Отзывы пока не загружены"
          description={feedbacks?.error ?? "Нажмите «Обновить данные» в шапке. Для чтения отзывов в API-токене нужна категория «Вопросы и отзывы»."}
        />
      </Card>
    );
  }

  const titleOf = (nmId: string) => titles.get(nmId) ?? `Артикул ${nmId}`;
  const shown = rep.rows.slice(0, paged.limit);
  const hidden = rep.rows.length - shown.length;

  return (
    <div className="space-y-6">
      <Card
        title="Репутация магазина"
        hint="Отзывы и вопросы покупателей за полгода."
        action={
          <HelpTip title="Зачем это" align="right">
            <p>Отзыв без ответа снижает доверие, а вопрос без ответа часто означает потерянного покупателя. Отвечайте сначала на негатив.</p>
          </HelpTip>
        }
      >
        <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Рейтинг магазина" value={rep.rating != null ? rep.rating.toLocaleString("ru-RU") : "—"} sub={`по ${formatInt(rep.reviews)} отзывам`} />
          <Stat label="Негатив без ответа" value={formatInt(rep.unansweredNegative)} sub="отзывы 1–3★" color={rep.unansweredNegative > 0 ? "#C8453F" : "#2E9E6B"} />
          <Stat label="Вопросов без ответа" value={formatInt(rep.unansweredQuestions)} sub="каждый — возможный покупатель" color={rep.unansweredQuestions > 0 ? "#B8741A" : "#2E9E6B"} />
          <Stat label="Отзывов без ответа" value={formatInt(rep.unanswered)} sub={`позитивных 4–5★: ${formatInt(rep.unansweredPositive)}`} />
        </div>
        {rep.risingProducts > 0 ? (
          <p className="mt-6 rounded-[16px] px-4 py-3.5 text-[16px] leading-[1.5]" style={{ ...hubSans, color: "#7A4A06", backgroundColor: "rgba(217, 145, 43, 0.14)" }}>
            У {rep.risingProducts} {rep.risingProducts === 1 ? "товара" : "товаров"} доля негатива за последние 28 дней выше, чем раньше. Загляните в тексты отзывов: обычно это размер, качество или расхождение с фото.
          </p>
        ) : null}
      </Card>

      <Card
        title="По товарам"
        hint={`Сверху те, где есть негатив без ответа или он растёт. Динамику считаем, когда отзывов не меньше ${MIN_REVIEWS_FOR_TREND} в каждом периоде.`}
      >
        <div className={`hidden gap-x-4 border-b pb-3 text-[14px] md:grid ${GRID}`} style={{ ...hubSans, color: hub.textSubtle, borderColor: "rgba(1, 20, 8, 0.14)" }}>
          <span>Товар</span>
          <span className="text-right">Рейтинг</span>
          <span className="text-right">Отзывов</span>
          <span className="text-right">Без ответа</span>
          <span className="text-right">Негатив</span>
          <span className="text-right">Вопросов</span>
          <span>Негатив: 28 дн. / раньше</span>
        </div>
        <ul className="divide-y" style={{ borderColor: LINE }}>
          {shown.map((row) => (
            <li key={row.nmId} className={`grid items-center gap-x-4 gap-y-2 py-4 ${GRID}`} style={{ borderColor: LINE }}>
              <div className="flex min-w-0 items-center gap-3.5">
                <Thumb src={photos?.get(row.nmId)} className="h-[56px] w-[42px]" />
                <p className="line-clamp-2 text-[16px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
                  {titleOf(row.nmId)}
                </p>
              </div>
              <p className="flex items-center justify-between gap-3 md:justify-end">
                <span className="text-[13.5px] md:hidden" style={{ ...hubSans, color: hub.textSubtle }}>
                  Рейтинг
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[16px] font-medium" style={{ ...MONO, color: ratingColor(row.rating), backgroundColor: `color-mix(in srgb, ${ratingColor(row.rating)} 12%, white)` }}>
                  <Star className="h-3.5 w-3.5" fill="currentColor" aria-hidden />
                  {row.rating != null ? row.rating.toLocaleString("ru-RU") : "—"}
                </span>
              </p>
              {[
                ["Отзывов", formatInt(row.reviews), undefined],
                ["Без ответа", formatInt(row.unanswered), row.unanswered > 0 ? "#B8741A" : undefined],
                ["Негатив", formatInt(row.unansweredNegative), row.unansweredNegative > 0 ? "#C8453F" : undefined],
                ["Вопросов", formatInt(row.unansweredQuestions), row.unansweredQuestions > 0 ? "#B8741A" : undefined],
              ].map(([label, value, color]) => (
                <p key={String(label)} className="flex items-baseline justify-between gap-3 md:justify-end" style={MONO}>
                  <span className="text-[13.5px] md:hidden" style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>
                    {String(label)}
                  </span>
                  <span className="text-[19px] font-medium" style={{ color: (color as string | undefined) ?? hub.text }}>
                    {String(value)}
                  </span>
                </p>
              ))}
              <p className="text-[15px]" style={{ ...hubSans, color: row.negativeRising ? "#B8741A" : hub.textMuted, fontWeight: row.negativeRising ? 600 : 400 }}>
                {row.negativeShareWindow != null || row.negativeShareBase != null
                  ? `${pct(row.negativeShareWindow)} / ${pct(row.negativeShareBase)}${row.negativeRising ? " ↑" : ""}`
                  : "мало отзывов"}
              </p>
            </li>
          ))}
        </ul>
        {hidden > 0 ? (
          <div className="mt-3 flex justify-center">
            <HubButton size="sm" variant="secondary" onClick={paged.more}>
              Показать ещё {Math.min(paged.step, hidden)} из {hidden}
            </HubButton>
          </div>
        ) : null}
      </Card>

      <p className="text-[15px]" style={{ ...hubSans, color: hub.textMuted }}>
        Отвечать на отзывы и вопросы удобнее в модуле автоотзывов:{" "}
        <Link href="/studio/auto-replies/workspace" className="font-semibold underline underline-offset-2" style={{ color: hub.text }}>
          открыть автоотзывы
        </Link>
        . Здесь только чтение данных WB.
      </p>
    </div>
  );
}
