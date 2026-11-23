"use client";

import type { ReactNode } from "react";
import { BarChart3, Bell, Bot, ChevronDown, Lightbulb, ListChecks, Megaphone, Pause, Truck } from "lucide-react";
import { ConfirmPanel } from "./hub-confirm-panel";
import { ProductChips } from "./hub-ads-review";
import { hub, HubButton, hubSans } from "./hub-ui";
import { KbDiagram } from "./hub-knowledge-diagrams";

const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;

/** Рамка иллюстрации: чистая карточка, внизу подпись и, если нужно, нумерованные пояснения. Данные в иллюстрациях вымышленные. */
function Frame({ title, children, notes }: { title: string; children: ReactNode; notes?: Array<[string, string]> }) {
  return (
    <figure className="my-2 overflow-hidden rounded-[20px] border bg-white" style={{ borderColor: "rgba(1, 20, 8, 0.14)", boxShadow: "0 22px 44px -34px rgba(1, 20, 8, 0.45)" }}>
      <p className="border-b px-5 py-3 text-[12.5px] font-semibold uppercase tracking-[0.1em]" style={{ ...hubSans, color: "rgba(1, 20, 8, 0.6)", borderColor: "rgba(1, 20, 8, 0.1)" }}>
        {title}
      </p>
      <div className="p-4 sm:p-6" aria-hidden>
        {children}
      </div>
      {notes ? (
        <ol className="space-y-3 border-t px-5 py-5" style={{ borderColor: "rgba(1, 20, 8, 0.1)", backgroundColor: "#F7F3E7" }}>
          {notes.map(([t, d], i) => (
            <li key={t} className="flex gap-3.5">
              <span className="mt-[2px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ ...hubSans, backgroundColor: "#011408" }}>
                {i + 1}
              </span>
              <p className="text-[15.5px] leading-[1.55]" style={{ ...hubSans, color: "#011408" }}>
                <strong className="font-semibold">{t}.</strong> {d}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
      <figcaption className="border-t px-5 py-2.5 text-[13px]" style={{ ...hubSans, color: "rgba(1, 20, 8, 0.6)", borderColor: "rgba(1, 20, 8, 0.1)" }}>
        Иллюстрация интерфейса. Цифры и названия вымышленные.
      </figcaption>
    </figure>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
        {label}
      </p>
      <p className="mt-1.5 text-[24px] font-medium leading-none" style={{ ...MONO, color: hub.text }}>
        {value}
      </p>
      {sub ? (
        <p className="mt-1 text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function ModulesMock() {
  const items = [
    { icon: ListChecks, title: "Задачи", text: "Что сделать сегодня" },
    { icon: Bell, title: "События", text: "Что изменилось" },
    { icon: Megaphone, title: "Продвижение", text: "Реклама, карточки, акции" },
    { icon: BarChart3, title: "Аналитика", text: "Деньги и остатки" },
    { icon: Truck, title: "Заказы и логистика", text: "Склады и поставки" },
    { icon: Bot, title: "Агенты", text: "Помощники по вашим правилам" },
  ];
  return (
    <Frame title="Seller Hub · разделы">
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((m) => (
          <li key={m.title} className="rounded-[18px] p-4" style={{ backgroundColor: "rgba(185, 255, 75, 0.2)", boxShadow: "inset 0 0 0 1px rgba(122, 190, 40, 0.4)" }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px]" style={{ backgroundColor: "#B9FF4B" }}>
              <m.icon className="h-5 w-5" style={{ color: hub.text }} />
            </span>
            <p className="mt-3 text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
              {m.title}
            </p>
            <p className="text-[13.5px]" style={{ ...hubSans, color: hub.textMuted }}>
              {m.text}
            </p>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/** Метка на реальной плитке: цифра, к которой есть пояснение под иллюстрацией. */
function PinWrap({ n, children, className }: { n: number; children: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className ?? ""}`}>
      {children}
      <span className="absolute -left-[26px] top-0.5 z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full text-[12px] font-bold text-white shadow" style={{ ...hubSans, backgroundColor: "#011408" }} aria-hidden>
        {n}
      </span>
    </div>
  );
}

function TileMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0" style={{ containerType: "inline-size" }}>
      <p className="text-[14.5px] leading-tight" style={{ ...hubSans, color: hub.textSubtle }}>
        {label}
      </p>
      <p className="mt-2 whitespace-nowrap font-medium leading-none" style={{ ...MONO, fontSize: "clamp(17px, 17cqw, 28px)", color: hub.text }}>
        {value}
      </p>
      {sub ? (
        <p className="mt-1.5 text-[14px] leading-tight" style={{ ...hubSans, color: hub.textSubtle }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/** Плитка кампании в точности как в «Продвижение → Кампании», с вымышленными цифрами. Кнопки и фишки товаров настоящие. */
function CampaignMock() {
  const color = "#2E9E6B";
  const noop = () => undefined;
  return (
    <Frame
      title="Продвижение · Кампании"
      notes={[
        ["Название и статус", "название кампании, номер, способ оплаты и где показывается реклама; справа состояние: «Активна», «На паузе» или «Завершена»"],
        ["Вывод простыми словами", "один короткий вывод о том, как кампания работает сейчас. Он появляется после автоматического разбора"],
        ["Товары кампании", "фото и названия товаров, которые рекламируются именно в ней"],
        ["Цифры периода", "бюджет и на сколько дней его хватит при текущем расходе, расход, заказы, ДРР и CTR. Считаются только по товарам, которые в кампании сейчас"],
        ["Подсказка", "что сделать и почему. Каждая подсказка опирается на цифры именно этой кампании, а кнопка справа открывает действие с подтверждением"],
        ["Кнопки", "пауза или запуск, пополнение (на кнопке рекомендуемая сумма), добавление товара, зоны показов, «Каждый товар отдельно»"],
      ]}
    >
      <div className="rounded-[24px] border p-5 sm:p-6" style={{ borderColor: `color-mix(in srgb, ${color} 30%, white)`, background: `linear-gradient(160deg, color-mix(in srgb, ${color} 8%, white), ${hub.canvas} 65%)` }}>
        <PinWrap n={1}>
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
            <div className="min-w-0">
              <p className="line-clamp-2 text-[20px] font-semibold leading-[1.25]" style={{ ...hubSans, color: hub.text }}>
                Кашпо для цветов
              </p>
              <p className="mt-1 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                № 40000000 · оплата за показы · показы: поиск и рекомендации
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[14px] font-semibold" style={{ ...hubSans, color, backgroundColor: `color-mix(in srgb, ${color} 13%, white)`, borderColor: `color-mix(in srgb, ${color} 32%, white)` }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
              Активна
            </span>
          </div>
        </PinWrap>
        <PinWrap n={2} className="mt-4">
          <p className="text-[19px] font-semibold leading-[1.35] tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
            Кампания работает хорошо и приносит прибыль.
          </p>
        </PinWrap>
        <PinWrap n={3} className="mt-4">
          <ProductChips
            products={[
              { nmId: "100000001", title: "Кашпо подвесное белое" },
              { nmId: "100000002", title: "Горшок керамический 2 л" },
            ]}
          />
        </PinWrap>
        <PinWrap n={4} className="mt-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            <TileMetric label="Бюджет" value="2 800 ₽" sub="хватит на 24 дн." />
            <TileMetric label="Расход" value="1 650 ₽" />
            <TileMetric label="Заказы" value="12" sub="20 000 ₽" />
            <TileMetric label="ДРР" value="8,3%" />
            <TileMetric label="CTR" value="4,9%" sub="226 кликов" />
          </div>
        </PinWrap>
        <PinWrap n={5} className="mt-6">
          <div className="grid gap-x-5 gap-y-3 border-t py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
            <p className="flex items-start gap-3 text-[16.5px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>
              <span className="mt-[2px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(185, 255, 75, 0.55)" }} aria-hidden>
                <Lightbulb className="h-[18px] w-[18px]" style={{ color: hub.text }} />
              </span>
              <span>Кампания окупается: ДРР 8,3% при марже 29,4%. Можно добавить «Кашпо напольное»: маржа 410 ₽ с каждой продажи, на складе 64 шт.</span>
            </p>
            <HubButton variant="secondary" onClick={noop}>
              Добавить товар
            </HubButton>
          </div>
        </PinWrap>
        <PinWrap n={6} className="mt-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <HubButton variant="secondary" onClick={noop}>
              <Pause className="h-3.5 w-3.5" />
              Поставить на паузу
            </HubButton>
            <HubButton variant="secondary" onClick={noop}>
              Пополнить бюджет
              <span className="ml-1 rounded-full px-2.5 py-0.5 text-[13.5px] font-bold" style={{ backgroundColor: "#B9FF4B", color: hub.text }}>
                1 700 ₽
              </span>
            </HubButton>
            <HubButton variant="secondary" onClick={noop}>
              Добавить товар
            </HubButton>
            <HubButton variant="secondary" onClick={noop}>
              Зоны показов
            </HubButton>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
              Каждый товар отдельно
              <ChevronDown className="h-4 w-4" />
            </span>
          </div>
        </PinWrap>
      </div>
    </Frame>
  );
}

function ReviewMock() {
  return (
    <Frame title="Продвижение · Обзор · Разбор кампаний">
      <div className="rounded-[22px] border p-5" style={{ borderColor: "rgba(200, 69, 63, 0.3)", background: `linear-gradient(160deg, rgba(200, 69, 63, 0.07), ${hub.canvas} 65%)` }}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[17px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Кампания «Органайзер»
          </p>
          <span className="rounded-[12px] border px-3 py-1.5 text-[13.5px] font-semibold" style={{ ...hubSans, color: "#C8453F", backgroundColor: "rgba(200, 69, 63, 0.1)", borderColor: "rgba(200, 69, 63, 0.3)" }}>
            Не окупается
          </span>
        </div>
        <p className="mt-4 text-[19px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
          ДРР значительно выше маржи, а ставка выше конкурентной.
        </p>
        <ul className="mt-2 space-y-1.5 text-[14.5px]" style={{ ...hubSans, color: hub.textMuted }}>
          <li>ДРР 40% при марже 32%: каждый заказ обходится дороже, чем приносит.</li>
          <li>Ставка 314 ₽, конкурентная 237 ₽: часть денег уходит впустую.</li>
        </ul>
        <div className="mt-4 rounded-[18px] p-4" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
          <p className="flex items-center gap-2.5 text-[17px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: "#B9FF4B" }}>
              <ListChecks className="h-[17px] w-[17px]" style={{ color: hub.text }} />
            </span>
            Что можно сделать
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                Снизить ставку
              </p>
              <p className="text-[13.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                ДРР выше маржи, ставка выше конкурентной.
              </p>
            </div>
            <span className="rounded-full px-5 py-2 text-[14px] font-semibold" style={{ ...hubSans, backgroundColor: "#B9FF4B", color: hub.text }}>
              Выполнить
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function PillarsMock() {
  const cells = [
    { label: "Трафик", note: "1 000 переходов, в 10 раз выше типичной карточки", c: "#2E9E6B" },
    { label: "Конверсия", note: "из корзины в заказ 8% против 15% по магазину", c: "#C8453F" },
    { label: "Выкуп", note: "выкуп 100%", c: "#2E9E6B" },
    { label: "Контент", note: "46 из 100: фото 3 → добавьте ещё 4", c: "#D9912B" },
    { label: "Рейтинг", note: "4,6 по 14 отзывам", c: "#2E9E6B" },
  ];
  return (
    <Frame title="Карточки · пять опор">
      <div className="grid gap-px overflow-hidden rounded-[20px] sm:grid-cols-5" style={{ backgroundColor: "rgba(1, 20, 8, 0.1)", boxShadow: "0 0 0 1px rgba(1, 20, 8, 0.1)" }}>
        {cells.map((c) => (
          <div key={c.label} className="px-4 py-4" style={{ backgroundColor: hub.canvas }}>
            <p className="flex items-center gap-2 text-[13px] font-medium" style={{ ...hubSans, color: hub.textSubtle }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.c }} />
              {c.label}
            </p>
            <p className="mt-2 text-[14.5px] font-medium leading-[1.4]" style={{ ...hubSans, color: hub.text }}>
              {c.note}
            </p>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function FunnelMock() {
  const steps = [
    { label: "Перешли в карточку", value: "9 300", w: 100, c: "#4A56DD", rate: "" },
    { label: "Добавили в корзину", value: "1 400", w: 70, c: "#8B4FE0", rate: "15% дошли сюда" },
    { label: "Заказали", value: "200", w: 56, c: "#C44FB8", rate: "14% дошли сюда" },
    { label: "Выкупили", value: "120", w: 52, c: "#E8604F", rate: "60% от заказов" },
  ];
  return (
    <Frame title="Откуда покупки · путь покупателя">
      <ol className="mx-auto max-w-[520px]">
        {steps.map((s) => (
          <li key={s.label} className="flex flex-col items-center">
            {s.rate ? (
              <p className="py-1.5 text-[13.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                {s.rate}
              </p>
            ) : null}
            <div className="flex items-center justify-between rounded-[16px] px-5 py-3 text-white" style={{ width: `${s.w}%`, minWidth: 220, backgroundColor: s.c }}>
              <span className="text-[14.5px] font-medium" style={hubSans}>
                {s.label}
              </span>
              <span className="text-[22px] font-medium" style={MONO}>
                {s.value}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

function ConfirmMock() {
  return (
    <Frame title="Окно подтверждения">
      <div className="rounded-[20px] p-4" style={{ backgroundColor: "rgba(1, 20, 8, 0.03)" }}>
        <p className="text-[15px] font-semibold" style={{ ...hubSans, color: hub.text }}>
          Снизить ставку
        </p>
        <p className="text-[13.5px]" style={{ ...hubSans, color: hub.textMuted }}>
          ДРР выше маржи, ставка выше конкурентной.
        </p>
        <ConfirmPanel onConfirm={() => undefined} onCancel={() => undefined} note="Вернуть прежнюю ставку можно в любой момент той же кнопкой.">
          Поставить ставку 251 ₽ за 1000 показов на товар 100000000 в кампании «Органайзер».
        </ConfirmPanel>
      </div>
    </Frame>
  );
}


const INKC = "#011408";

function OverviewMock() {
  return (
    <Frame title="Обзор магазина">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Metric label="Заказы" value="1 248" sub="+6% к прошлому периоду" />
        <Metric label="Выкуп" value="84%" sub="−1 п.п." />
        <Metric label="Выручка" value="1,92 млн ₽" sub="+4%" />
        <Metric label="ДРР" value="11%" sub="ниже маржи" />
      </div>
      <div className="mt-6 space-y-2.5">
        {[
          ["Критично", "Товар «Органайзер» продаётся в минус"],
          ["Важно", "Остатка по 3 товарам хватит меньше чем на 10 дней"],
          ["Возможность", "Есть выгодная акция для 5 товаров"],
        ].map(([tag, text]) => (
          <div key={text} className="flex items-center gap-3 rounded-[14px] border bg-white px-4 py-3" style={{ borderColor: "rgba(1, 20, 8, 0.12)" }}>
            <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ ...hubSans, backgroundColor: tag === "Критично" ? "rgba(201, 71, 63, 0.14)" : tag === "Важно" ? "rgba(217, 145, 43, 0.18)" : "rgba(46, 125, 79, 0.14)", color: INKC }}>
              {tag}
            </span>
            <span className="text-[14.5px]" style={{ ...hubSans, color: INKC }}>
              {text}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function TaskMock() {
  return (
    <Frame title="Задачи">
      <div className="rounded-[18px] border bg-white p-5" style={{ borderColor: "rgba(1, 20, 8, 0.14)" }}>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ ...hubSans, backgroundColor: "rgba(201, 71, 63, 0.14)", color: INKC }}>
            Критично
          </span>
          <span className="text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
            Органайзер для кухни · арт. 100000000
          </span>
        </div>
        <p className="mt-3 text-[18px] font-semibold" style={{ ...hubSans, color: INKC }}>
          Товар продаётся в минус
        </p>
        <p className="mt-1.5 text-[14.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
          Цена 990 ₽, удержания WB 361 ₽, себестоимость 640 ₽: с каждой продажи теряется 11 ₽.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] px-4 py-3" style={{ backgroundColor: "#F7F3E7" }}>
          <span className="text-[14.5px] font-medium" style={{ ...hubSans, color: INKC }}>
            Что сделать: поднять цену до 1 090 ₽
          </span>
          <span className="rounded-full px-4 py-1.5 text-[13.5px] font-semibold" style={{ ...hubSans, backgroundColor: INKC, color: "#FFFFFF" }}>
            Проверить и применить
          </span>
        </div>
      </div>
    </Frame>
  );
}

function MoneyMock() {
  const rows: Array<[string, number, string]> = [
    ["Комиссия WB", 18, "#B02FC9"],
    ["Логистика и хранение", 8, "#D9912B"],
    ["Реклама", 11, "#3E64A8"],
    ["Себестоимость", 38, "#6B7280"],
    ["Налог", 6, "#A8680C"],
    ["Прибыль", 19, "#2E9E6B"],
  ];
  return (
    <Frame title="Аналитика · Деньги">
      <p className="text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
        Из каждых 100 ₽ выручки
      </p>
      <div className="mt-3 flex h-4 overflow-hidden rounded-full">
        {rows.map(([n, v, c]) => (
          <span key={n} style={{ width: `${v}%`, backgroundColor: c }} />
        ))}
      </div>
      <div className="mt-5 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {rows.map(([n, v, c]) => (
          <div key={n} className="flex items-center justify-between border-b pb-2" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
            <span className="inline-flex items-center gap-2.5 text-[14.5px]" style={{ ...hubSans, color: INKC }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} />
              {n}
            </span>
            <span className="text-[15px] font-medium" style={{ ...MONO, color: INKC }}>
              {v} ₽
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function StocksMock() {
  const cols: Array<[string, string, string[]]> = [
    ["Закончилось", "4", ["Органайзер · упущено 38 продаж", "Чехол · упущено 12 продаж"]],
    ["Заканчивается", "11", ["Кружка · хватит на 6 дней", "Лампа · хватит на 9 дней"]],
    ["Залёживается", "7", ["Плед · 160 дней без продаж", "Фоторамка · 94 дня остаток"]],
  ];
  return (
    <Frame title="Аналитика · Остатки">
      <div className="grid gap-4 sm:grid-cols-3">
        {cols.map(([t, n, items]) => (
          <div key={t} className="rounded-[16px] border bg-white p-4" style={{ borderColor: "rgba(1, 20, 8, 0.12)" }}>
            <p className="text-[13.5px] font-semibold" style={{ ...hubSans, color: hub.textMuted }}>
              {t}
            </p>
            <p className="mt-1 text-[28px] font-medium leading-none" style={{ ...MONO, color: INKC }}>
              {n}
            </p>
            <ul className="mt-3 space-y-1.5">
              {items.map((i) => (
                <li key={i} className="text-[13.5px] leading-[1.4]" style={{ ...hubSans, color: hub.textMuted }}>
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function AgentsMock() {
  const modes: Array<[string, string, boolean]> = [
    ["Предлагать", "Агент находит ситуацию и показывает вариант. Вы подтверждаете каждый шаг.", true],
    ["Автопилот", "Выполняет только безопасные действия в рамках правил. Выключен по умолчанию.", false],
  ];
  return (
    <Frame title="Агенты · режимы">
      <div className="grid gap-4 sm:grid-cols-2">
        {modes.map(([t, d, on]) => (
          <div key={t} className="rounded-[16px] border bg-white p-4" style={{ borderColor: on ? "#2E5A43" : "rgba(1, 20, 8, 0.12)" }}>
            <div className="flex items-center justify-between">
              <p className="text-[16px] font-semibold" style={{ ...hubSans, color: INKC }}>
                {t}
              </p>
              <span className="flex h-6 w-11 items-center rounded-full px-0.5" style={{ backgroundColor: on ? "#2E5A43" : "rgba(1, 20, 8, 0.2)", justifyContent: on ? "flex-end" : "flex-start" }}>
                <span className="h-5 w-5 rounded-full bg-white" />
              </span>
            </div>
            <p className="mt-2 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
              {d}
            </p>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Иллюстрации интерфейса для статей: подставляются по разметке [[mock:имя]]. */
export function KbMock({ name }: { name: string }) {
  switch (name) {
    case "modules":
      return <ModulesMock />;
    case "campaign":
      return <CampaignMock />;
    case "review":
      return <ReviewMock />;
    case "pillars":
      return <PillarsMock />;
    case "funnel":
      return <FunnelMock />;
    case "confirm":
      return <ConfirmMock />;
    case "overview":
      return <OverviewMock />;
    case "task":
      return <TaskMock />;
    case "money":
      return <MoneyMock />;
    case "stocks":
      return <StocksMock />;
    case "agents":
      return <AgentsMock />;
    default:
      return <KbDiagram name={name} />;
  }
}

