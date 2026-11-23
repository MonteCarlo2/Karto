"use client";

import type { ReactNode } from "react";
import { hubSans } from "./hub-ui";

const INK = "#011408";
const MUTED = "rgba(1, 20, 8, 0.62)";
const LINE = "rgba(1, 20, 8, 0.14)";
const SAND = "#F7F3E7";

/** Рамка схемы: заголовок, схема, подпись с источником. Схемы объясняют правила Wildberries и сделаны нами, это не скриншоты. */
function Frame({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <figure className="my-2 overflow-hidden rounded-[20px] border bg-white" style={{ borderColor: LINE, boxShadow: "0 22px 44px -34px rgba(1, 20, 8, 0.45)" }}>
      <p className="border-b px-5 py-3 text-[12.5px] font-semibold uppercase tracking-[0.1em]" style={{ ...hubSans, color: MUTED, borderColor: "rgba(1, 20, 8, 0.1)" }}>
        {title}
      </p>
      <div className="p-4 sm:p-6">{children}</div>
      <figcaption className="border-t px-5 py-2.5 text-[13px]" style={{ ...hubSans, color: MUTED, borderColor: "rgba(1, 20, 8, 0.1)" }}>
        {note ?? "Схема по справке Wildberries. Правила меняются: сверяйтесь с кабинетом."}
      </figcaption>
    </figure>
  );
}

/** Цепочка шагов: пронумерованные блоки, на узком экране идут столбиком. */
function Steps({ title, steps, note }: { title: string; steps: Array<[string, string]>; note?: string }) {
  return (
    <Frame title={title} note={note}>
      <ol className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        {steps.map(([t, d], i) => (
          <li key={t} className="relative rounded-[14px] border px-4 py-4" style={{ borderColor: LINE, backgroundColor: i % 2 ? "#fff" : SAND }}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ ...hubSans, backgroundColor: INK }}>
              {i + 1}
            </span>
            <p className="mt-3 text-[16.5px] font-semibold leading-snug" style={{ ...hubSans, color: INK }}>
              {t}
            </p>
            <p className="mt-1.5 text-[14.5px] leading-[1.5]" style={{ ...hubSans, color: MUTED }}>
              {d}
            </p>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

const WHO = { you: "Вы", wb: "Wildberries", buyer: "Покупатель", none: "не нужно" } as const;
type Who = keyof typeof WHO;

function Cell({ who }: { who: Who }) {
  const you = who === "you";
  return (
    <td className="px-3 py-3 text-center align-middle">
      <span
        className="inline-block rounded-full border px-3 py-1 text-[13.5px] font-medium"
        style={{ ...hubSans, color: you ? "#fff" : INK, backgroundColor: you ? INK : who === "wb" ? SAND : "#fff", borderColor: you ? INK : LINE, opacity: who === "none" ? 0.55 : 1 }}
      >
        {WHO[who]}
      </span>
    </td>
  );
}

function ModelsDiagram() {
  const rows: Array<[string, string, Who, Who, Who, Who]> = [
    ["FBW", "Склад WB", "wb", "wb", "you", "wb"],
    ["FBS", "Маркетплейс", "you", "you", "you", "wb"],
    ["DBW", "Деливери WB", "you", "you", "wb", "wb"],
    ["DBS", "Витрина", "you", "you", "none", "you"],
    ["EDBS", "Витрина экспресс", "you", "you", "none", "you"],
    ["C&C", "Самовывоз", "you", "you", "none", "buyer"],
  ];
  const heads = ["Модель", "Хранит", "Собирает", "Привозит в WB", "Доставляет покупателю"];
  return (
    <Frame title="Кто что делает в каждой модели" note="Схема по справке Wildberries. В FBW вы привозите партию на склад, в FBS привозите собранный заказ на пункт приёма в установленный срок. В DBW заказ забирает у вас курьер WB. В C&C покупатель приходит в вашу точку сам.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left">
          <thead>
            <tr>
              {heads.map((h, i) => (
                <th key={h} className={`px-3 pb-3 text-[12.5px] font-semibold uppercase tracking-[0.08em] ${i ? "text-center" : ""}`} style={{ ...hubSans, color: MUTED }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([code, name, a, b, c, d]) => (
              <tr key={code} className="border-t" style={{ borderColor: LINE }}>
                <td className="px-3 py-3">
                  <p className="text-[17px] font-semibold" style={{ ...hubSans, color: INK }}>
                    {code}
                  </p>
                  <p className="text-[13.5px]" style={{ ...hubSans, color: MUTED }}>
                    {name}
                  </p>
                </td>
                <Cell who={a} />
                <Cell who={b} />
                <Cell who={c} />
                <Cell who={d} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

function SizesDiagram() {
  /** Шкала по сумме трёх сторон: 0–200 МГТ, 201–280 КГТ+, 281–1200 СГТ. Ширина секций условная, не в масштабе. */
  const zones = [
    { name: "МГТ", range: "до 200 см", w: "34%", bg: SAND, fg: INK },
    { name: "КГТ+", range: "201–280 см", w: "26%", bg: "#E9E1CC", fg: INK },
    { name: "СГТ", range: "281–1 200 см", w: "40%", bg: INK, fg: "#fff" },
  ];
  const rows = [
    ["МГТ", "до 25 кг", "до 120 см"],
    ["КГТ+", "до 25 кг", "121–200 см"],
    ["СГТ", "25–100 кг (коробка), до 200 кг (в стяжке)", "121–400 см"],
  ];
  return (
    <Frame title="Тип товара по размеру упаковки" note="Сумма трёх сторон = длина + ширина + высота упаковки. Ширина секций условная. Для МГТ нужно выполнить все условия, для СГТ достаточно одного.">
      <p className="mb-2 text-[13.5px]" style={{ ...hubSans, color: MUTED }}>
        Сумма трёх сторон упаковки
      </p>
      <div className="flex overflow-hidden rounded-[14px] border" style={{ borderColor: LINE }}>
        {zones.map((z) => (
          <div key={z.name} className="px-4 py-4" style={{ width: z.w, backgroundColor: z.bg, color: z.fg }}>
            <p className="text-[20px] font-semibold leading-none" style={hubSans}>
              {z.name}
            </p>
            <p className="mt-2 text-[13.5px] leading-snug opacity-80" style={hubSans}>
              {z.range}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-2">
        {rows.map(([n, w, l]) => (
          <div key={n} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t pt-3" style={{ borderColor: LINE }}>
            <span className="w-14 text-[16px] font-semibold" style={{ ...hubSans, color: INK }}>
              {n}
            </span>
            <span className="text-[15px]" style={{ ...hubSans, color: MUTED }}>
              вес {w}
            </span>
            <span className="text-[15px]" style={{ ...hubSans, color: MUTED }}>
              длинная сторона {l}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function RankBox({ t, d, dark }: { t: string; d: string; dark?: boolean }) {
  return (
    <div className="flex-1 rounded-[14px] border px-4 py-4 text-center" style={{ borderColor: dark ? INK : LINE, backgroundColor: dark ? INK : SAND, color: dark ? "#fff" : INK }}>
      <p className="text-[16.5px] font-semibold leading-snug" style={hubSans}>
        {t}
      </p>
      <p className="mt-1.5 text-[14px] leading-[1.45] opacity-80" style={hubSans}>
        {d}
      </p>
    </div>
  );
}

function RankOp({ c }: { c: string }) {
  return (
    <span className="flex items-center justify-center text-[26px] font-light sm:px-1" style={{ ...hubSans, color: MUTED }} aria-hidden>
      {c}
    </span>
  );
}

function RankingDiagram() {
  return (
    <Frame title="Как карточка попадает в блок продвижения" note="По справке WB: платное продвижение усиливает органическую позицию, но не заменяет её. Точные веса Wildberries не раскрывает.">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <RankBox t="Органика" d="доставка, продажи, акции, качество карточки, рейтинг, отзывы" />
        <RankOp c="×" />
        <RankBox t="Ставка" d="сколько вы платите за показ или клик" />
        <RankOp c="=" />
        <RankBox t="Позиция в продвижении" d="слабая карточка не поднимется одной ставкой" dark />
      </div>
    </Frame>
  );
}

export function KbDiagram({ name }: { name: string }) {
  switch (name) {
    case "wb-models":
      return <ModelsDiagram />;
    case "wb-sizes":
      return <SizesDiagram />;
    case "wb-ranking":
      return <RankingDiagram />;
    case "wb-money":
      return (
        <Steps
          title="Путь денег: от выкупа до счёта"
          steps={[
            ["Выкуп", "покупатель забрал товар"],
            ["Отчёт реализации", "формируется до среды за прошлую неделю"],
            ["+2 недели", "в понедельник сумма появляется «к выводу»"],
            ["Кнопка «Вывести»", "реквизиты проверены, не меньше 500 ₽"],
            ["До 7 рабочих дней", "перевод на ваш счёт, срок зависит и от банка"],
          ]}
          note="Схема по справке Wildberries на сентябрь 2026. Опции быстрого вывода временно недоступны."
        />
      );
    case "wb-supply":
      return (
        <Steps
          title="Поставка на склад FBW: четыре этапа"
          steps={[
            ["Создать", "товары, тип поставки, пункт отгрузки и дата"],
            ["Наполнить", "короба или паллеты, штрихкоды, сроки годности"],
            ["Упаковать", "на коробе только его ШК, без лишней маркировки"],
            ["Довезти", "зазор до борта 10 см, у каждой поставки свой ШК ТТН"],
            ["Приёмка", "после неё товар появляется в вашем магазине"],
          ]}
        />
      );
    case "wb-block":
      return (
        <Steps
          title="Блокировка карточки: что происходит и когда"
          steps={[
            ["Предупреждение", "в «колокольчик» за 3 календарных дня до блокировки"],
            ["Блокировка", "причина в отчёте «Скрытые товары»"],
            ["Правка", "если есть кнопка, редактировать можно один раз"],
            ["Проверка", "обычно до 3 рабочих дней"],
            ["Решение", "разблокировка или обращение в поддержку"],
          ]}
          note="Исключение: блокировка по решению суда или закону приходит без предупреждения. Схема по справке Wildberries."
        />
      );
    case "wb-first-sale":
      return (
        <Steps
          title="Первая продажа: порядок действий"
          steps={[
            ["Тарифы", "калькулятор и комиссия по категории"],
            ["Карточки", "в кабинете или по API"],
            ["Цены", "цены и скидки"],
            ["Склад", "поставка (FBW) или свой склад продавца"],
            ["Остатки", "загрузить в кабинете или по API"],
          ]}
        />
      );
    default:
      return null;
  }
}
