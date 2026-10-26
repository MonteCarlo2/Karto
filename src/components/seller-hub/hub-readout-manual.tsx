"use client";

import type { ReactNode } from "react";
import type { ReadoutSectionId } from "@/lib/seller-hub/product-signal";
import { hub, hubNumeric, hubSans } from "./hub-ui";

function Fraction({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span className="inline-flex min-w-[7.5rem] flex-col items-center px-1 text-center text-[15px] font-semibold leading-tight" style={{ ...hubSans, color: hub.text }}>
      <span>{top}</span>
      <span className="my-1 h-px w-full" style={{ backgroundColor: hub.ink }} />
      <span>{bottom}</span>
    </span>
  );
}

function Formula({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[16px] px-4 py-4" style={{ backgroundColor: hub.canvas }}>
      <span className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        {name}
      </span>
      <span className="text-[22px] font-semibold leading-none" style={{ color: hub.blue }}>
        =
      </span>
      <div className="flex flex-wrap items-center gap-2 text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        {children}
      </div>
    </div>
  );
}

function Ladder({ title, cap, rows }: { title: string; cap: string; rows: Array<{ when: string; points: string }> }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
          {title}
        </p>
        <p className="text-[13px] font-semibold" style={{ ...hubNumeric, color: hub.blue }}>
          {cap}
        </p>
      </div>
      <ul className="mt-2">
        {rows.map((row) => (
          <li
            key={row.when}
            className="flex items-baseline justify-between gap-4 border-t py-2.5 first:border-t-0"
            style={{ borderColor: hub.borderSoft }}
          >
            <span className="text-[15px] leading-[1.45]" style={{ ...hubSans, color: hub.text }}>
              {row.when}
            </span>
            <span className="shrink-0 text-[15px] font-semibold" style={{ ...hubNumeric, color: hub.ink }}>
              {row.points}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-[15px] leading-[1.55]" style={{ ...hubSans, color: hub.text }}>
      {children}
    </p>
  );
}

function ManualTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: hub.textSubtle }}>
      {children}
    </p>
  );
}

export function ReadoutManual({ id }: { id: ReadoutSectionId }) {
  switch (id) {
    case "index":
      return <IndexManual />;
    case "card":
      return <CardManual />;
    case "stock":
      return <StockManual />;
    case "capital":
      return <CapitalManual />;
    case "margin":
      return <MarginManual />;
    case "status":
      return <StatusManual />;
    default: {
      const unexpected: never = id;
      return unexpected;
    }
  }
}

function IndexManual() {
  return (
    <div className="space-y-5">
      <ManualTitle>Как считается индекс SKU</ManualTitle>
      <Formula name="Индекс">
        <span>Спрос</span>
        <span style={{ color: hub.blue }}>+</span>
        <span>Склад</span>
        <span style={{ color: hub.blue }}>+</span>
        <span>Контент</span>
        <span style={{ color: hub.blue }}>+</span>
        <span>Отзывы</span>
      </Formula>
      <Note>
        Себестоимость в эти 100 не входит. Если воронка ещё не прочитана, недостающие столпы не растягиваются до сотни: индекса просто нет, пока все четыре не посчитаны.
      </Note>
      <div className="grid gap-6 sm:grid-cols-2">
        <Ladder
          title="Спрос. Факт заказов"
          cap="до 20 из 35"
          rows={[
            { when: "28 и больше за 28 дней", points: "20" },
            { when: "от 5 до 27", points: "14" },
            { when: "от 1 до 4", points: "7" },
            { when: "ноль заказов", points: "0" },
          ]}
        />
        <Ladder
          title="Спрос. К прошлым 28 дням"
          cap="до 15 из 35"
          rows={[
            { when: "рост больше 5%", points: "15" },
            { when: "от −5% до +5%", points: "10" },
            { when: "падение до −25%", points: "5" },
            { when: "глубже −25%", points: "0" },
          ]}
        />
      </div>
      <Note>
        Это заказы воронки, не продажи из отчёта. Ноль к нулю — стабильность, 10 баллов. Рост с нуля — 15. Карточка младше 14 дней получает за факт не меньше 12, если дата создания пришла из кабинета.
      </Note>
      <div className="grid gap-6 sm:grid-cols-2">
        <Ladder
          title="Склад FBS, штуки"
          cap="до 25"
          rows={[
            { when: "10 и больше", points: "25" },
            { when: "от 1 до 9", points: "15" },
            { when: "ноль", points: "0" },
          ]}
        />
        <Ladder
          title="Склад FBO, дни запаса"
          cap="до 25"
          rows={[
            { when: "15–60 дней", points: "25" },
            { when: "61–90", points: "18" },
            { when: "5–14 и 91–120", points: "12" },
            { when: "меньше 5", points: "6" },
            { when: "дольше 120 или нет заказов при остатке", points: "8" },
            { when: "ноль на складе", points: "0" },
          ]}
        />
      </div>
      <Note>
        Если оба канала с остатком, балл склада — среднее по штукам. Канал с нулём вес не тянет. Ровно 10 штук FBS стоит вместе с безопасным остатком.
      </Note>
      <Formula name="Контент в индексе">
        <span>контент-скор</span>
        <span style={{ color: hub.blue }}>×</span>
        <span>0,2</span>
        <span className="text-[14px] font-medium" style={{ color: hub.textMuted }}>
          максимум 20
        </span>
      </Formula>
      <Ladder
        title="Отзывы, звёзды воронки"
        cap="до 20"
        rows={[
          { when: "4,8 и выше", points: "20" },
          { when: "от 4,5 до 4,8", points: "15" },
          { when: "от 4,0 до 4,5", points: "8" },
          { when: "ниже 4", points: "2" },
          { when: "отзывов нет", points: "14" },
        ]}
      />
      <Note>
        Число негатива без ответа воронка не отдаёт, поэтому его здесь нет. Реклама в индекс не входит. Буква: A от 85, B от 70, C от 50, ниже — D. Цена ниже порога убытка режет индекс до 25.
      </Note>
    </div>
  );
}

function CardManual() {
  return (
    <div className="space-y-5">
      <ManualTitle>Как считается контент</ManualTitle>
      <Formula name="Контент">
        <span>Медиа 40</span>
        <span style={{ color: hub.blue }}>+</span>
        <span>Характеристики 35</span>
        <span style={{ color: hub.blue }}>+</span>
        <span>Текст 25</span>
      </Formula>
      <Ladder
        title="Фото"
        cap="до 25 из 40"
        rows={[
          { when: "7 и больше", points: "25" },
          { when: "5–6", points: "20" },
          { when: "3–4", points: "14" },
          { when: "1–2", points: "6" },
          { when: "нет фото", points: "0" },
        ]}
      />
      <Note>Видео даёт 10. Обложка — ещё 5, и эти 5 остаются нулём, пока кадр не измерен: по ссылке резкость и плашки не снять.</Note>
      <Ladder
        title="Характеристики"
        cap="до 35"
        rows={[
          { when: "Габариты упаковки", points: "5" },
          { when: "Вес", points: "5" },
          { when: "Ключевой фильтр ниши", points: "8" },
          { when: "Цвет", points: "3" },
          { when: "Материал", points: "2" },
          { when: "Комплектация", points: "2" },
          { when: "Три других поля категории", points: "10" },
          { when: "Одно или два других поля", points: "5" },
        ]}
      />
      <Note>Если такого поля в категории нет, за его отсутствие баллы не снимаются. Весь справочник заполнять не требуется.</Note>
      <Ladder
        title="Описание"
        cap="до 25"
        rows={[
          { when: "от 800 знаков", points: "10" },
          { when: "400–799", points: "6" },
          { when: "150–399", points: "3" },
          { when: "Абзацы", points: "5" },
          { when: "Без сплошных заглавных", points: "2" },
          { when: "Естественные ключи", points: "8" },
        ]}
      />
      <Note>
        Текст длиннее 2 500 знаков балл за объём не теряет. Повтор корня 3–4 раза на 1 000 знаков не режет. Если один корень занимает больше 5% слов или в тексте список ключей через запятую, из 8 за ключи остаётся 2. Буква та же: A от 85, B от 70, C от 50.
      </Note>
    </div>
  );
}

function StockManual() {
  return (
    <div className="space-y-5">
      <ManualTitle>Как считается запас</ManualTitle>
      <Formula name="Дни">
        <Fraction top="остаток" bottom="продажи в день" />
      </Formula>
      <Formula name="Продажи в день">
        <Fraction top="штуки за 7 дней" bottom="7" />
        <span className="text-[14px] font-medium" style={{ color: hub.textMuted }}>
          если в эти 7 дней продажи были
        </span>
      </Formula>
      <Formula name="Иначе">
        <Fraction top="штуки за 28 дней" bottom="28" />
      </Formula>
      <Note>
        Если продаж не было, дни не выводим: делить остаток не на что. Дольше 180 дней в ячейке пишется «&gt; 180 дн.», темп при этом остаётся в разборе. Это темп уже прошедших продаж, не обещание следующей отгрузки.
      </Note>
    </div>
  );
}

function CapitalManual() {
  return (
    <div className="space-y-5">
      <ManualTitle>Как считается зависший капитал</ManualTitle>
      <Formula name="Лишние штуки">
        <span>остаток</span>
        <span style={{ color: hub.blue }}>−</span>
        <span>продажи в день × 28</span>
      </Formula>
      <Formula name="Сумма">
        <span>лишние штуки</span>
        <span style={{ color: hub.blue }}>×</span>
        <span>закупка</span>
      </Formula>
      <Note>
        Если остаток меньше того, что уйдёт за 28 дней, лишних штук нет и сумма ноль. Будущую плату за хранение и упущенную выручку из-за нуля сюда не кладём: день обнуления и тариф на лежащий остаток отчёт не отдаёт. Хранение, уже списанное с этих продаж, показывается отдельно, если оно было.
      </Note>
    </div>
  );
}

function MarginManual() {
  return (
    <div className="space-y-5">
      <ManualTitle>Как считается маржа</ManualTitle>
      <Formula name="Доля WB">
        <span className="inline-flex flex-col items-center text-center text-[15px] font-semibold leading-tight">
          <span>к перечислению − доставка − хранение − приёмка − штрафы − удержания</span>
          <span className="my-1.5 h-px w-full" style={{ backgroundColor: hub.ink }} />
          <span>сумма реализации</span>
        </span>
      </Formula>
      <Formula name="Маржа">
        <Fraction top="цена × доля − закупка" bottom="цена" />
      </Formula>
      <Formula name="Порог убытка">
        <Fraction top="закупка" bottom="доля" />
        <span className="text-[14px] font-medium" style={{ color: hub.textMuted }}>
          вверх до рубля
        </span>
      </Formula>
      <Note>
        На пороге прибыль после списаний ноль. Если у артикула продаж не было, доля берётся по всем продажам кабинета за тот же отчёт. Комиссия категории и фиксированная логистика сюда не подставляются. Стрелка у маржи сравнивает вторую половину этих 28 дней с первой, на текущую цену.
      </Note>
    </div>
  );
}

function StatusManual() {
  return (
    <div className="space-y-4">
      <ManualTitle>Как выбирается статус</ManualTitle>
      <Note>Плашка — самый острый факт. Индекс и контент она не заменяет. Смотрим сверху вниз и останавливаемся на первом, что сбылось.</Note>
      <ol className="space-y-2">
        {[
          "Нет отчёта или нет закупки",
          "Цена ниже порога убытка",
          "Минус на штуку после списаний",
          "Остатка нет",
          "Акция уводит в минус",
          "Запаса меньше, чем на 28 дней",
          "Продаж за 28 дней не было",
          "Иначе — «В норме»",
        ].map((step, index) => (
          <li key={step} className="flex items-start gap-3">
            <span
              className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
              style={{ backgroundColor: index === 7 ? hub.lime : hub.blueSoft, color: hub.ink, ...hubNumeric }}
            >
              {index + 1}
            </span>
            <span className="pt-1 text-[15px] leading-[1.45]" style={{ ...hubSans, color: hub.text }}>
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
