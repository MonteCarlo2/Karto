"use client";

import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Search, X } from "lucide-react";
import { createSellerHubOrder, patchSellerHubOrder } from "@/lib/seller-hub/client-api";
import { upcomingRuns } from "@/lib/seller-hub/orders/preview";
import { inputFromForm, scheduleFromForm, type OrderForm } from "@/lib/seller-hub/orders/form";
import { KIND_LABEL, WEEKDAY_SHORT, parseSchedule } from "@/lib/seller-hub/orders/types";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { hub, HubButton, hubSans } from "./hub-ui";
import { PanelNumber, PanelRow, PanelSegmented } from "./hub-agents-panel";
import { TimePicker } from "./hub-time-picker";

/**
 * Редактор поручения: название, что делать, когда (время, дни, повторы), рамки и режим.
 * Внизу всегда видно, когда поручение сработает в ближайший раз. Открывается поверх страницы «Поручения».
 */

/** Ближайшие запуски по расписанию из формы: то, что человек увидит на деле. */
function upcoming(f: OrderForm, count = 3): string[] {
  const parsed = parseSchedule(scheduleFromForm(f));
  return parsed.ok ? upcomingRuns(parsed.value, Date.now(), count) : [];
}

/** Текущее время в Москве «ЧЧ:ММ» для подсказки в редакторе. */
const mskNow = () => {
  const d = new Date(Date.now() + 3 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
/** Выбор дня: ближайшие две недели кнопками («Сегодня», «Завтра», «пт 21.11»), плюс своя дата. */
function DayPicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [base] = useState(() => Date.now());
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(base + 3 * 3_600_000 + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    return { iso, label: i === 0 ? "Сегодня" : i === 1 ? "Завтра" : `${WD[d.getUTCDay()]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}` };
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {days.map((d) => (
        <button key={d.iso} type="button" aria-pressed={d.iso === value} onClick={() => onChange(d.iso)} className="h-10 rounded-full px-4 text-[14px] font-medium outline-none transition-[background-color,transform] duration-150 active:scale-95 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: d.iso === value ? "#2E5A43" : "rgba(1,20,8,0.05)", color: d.iso === value ? "#fff" : hub.text }}>
          {d.label}
        </button>
      ))}
      <input type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Другая дата" className="h-10 rounded-full bg-transparent px-4 text-[14px] outline-none focus:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, color: hub.text, boxShadow: "inset 0 0 0 1px rgba(1,20,8,0.16)" }} />
    </div>
  );
}

const inputCls = "h-10 w-full rounded-[10px] bg-transparent px-3 text-[15px] outline-none transition-shadow duration-150 focus:shadow-[0_0_0_2px_var(--hub-lime-ring)]";
const inputStyle = { ...hubSans, color: hub.text, boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.16)" } as const;

function Chip({ on, onClick, children }: { on?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="h-9 rounded-full px-3.5 text-[14px] font-medium outline-none transition-colors duration-150 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: on ? "#2E5A43" : "rgba(1,20,8,0.06)", color: on ? "#fff" : hub.textMuted }}>
      {children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="py-5">
      <p className="text-[15px] font-semibold leading-5" style={{ ...hubSans, color: hub.text }}>
        {label}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[13.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textMuted }}>
          {hint}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function OrderEditor({ initial, snapshot, sandbox, onClose, onSaved }: { initial: OrderForm; snapshot?: SellerCatalogSnapshot; sandbox: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<OrderForm>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<OrderForm>) => setForm((f) => ({ ...f, ...patch }));
  const campaigns = useMemo(() => snapshot?.ads?.campaigns ?? [], [snapshot?.ads]);
  const items = useMemo(() => snapshot?.items ?? [], [snapshot?.items]);
  const picked = new Set(form.nmIds);
  const next = useMemo(() => upcoming(form), [form]);

  async function save() {
    setBusy(true);
    setError(null);
    const input = inputFromForm(form);
    const res = form.id ? await patchSellerHubOrder(form.id, { input }) : await createSellerHubOrder(input);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Не получилось сохранить");
      return;
    }
    onSaved();
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Поручение">
      <div className="hub-fade-in absolute inset-0" style={{ backgroundColor: "rgba(1, 20, 8, 0.38)", backdropFilter: "blur(3px)" }} onMouseDown={onClose} aria-hidden />
      <div className="hub-fade-in relative flex max-h-[min(92vh,860px)] w-full max-w-[760px] flex-col overflow-hidden rounded-[26px]" style={{ backgroundColor: hub.canvas, boxShadow: "0 36px 100px -30px rgba(1, 20, 8, 0.6), 0 0 0 1px rgba(1, 20, 8, 0.08)" }}>
        <div className="flex items-start justify-between gap-4 border-b px-7 pb-4 pt-6" style={{ borderColor: "rgba(1,20,8,0.08)" }}>
          <div>
            <h3 className="text-[22px] font-semibold tracking-[-0.015em]" style={{ ...hubSans, color: hub.text }}>
              {form.id ? "Изменить поручение" : KIND_LABEL[form.kind]}
            </h3>
            <p className="mt-0.5 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
              Что сделать, когда и в каких рамках. Время везде московское: сейчас в Москве {mskNow()}.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full outline-none transition-colors hover:bg-[rgba(1,20,8,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ color: hub.textSubtle }}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 divide-y overflow-y-auto px-7" style={{ borderColor: "rgba(1,20,8,0.08)" }}>
          <Field label="Название">
            <input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={160} className={inputCls} style={inputStyle} />
          </Field>

          {form.kind === "remind" ? (
            <Field label="О чём напомнить" hint="Можно написать подробно: текст раскроется на несколько строк.">
              <textarea value={form.text} onChange={(e) => set({ text: e.target.value })} maxLength={400} rows={3} className="min-h-[88px] w-full resize-y rounded-[12px] bg-transparent px-3.5 py-3 text-[15px] leading-[1.5] outline-none transition-shadow duration-150 focus:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={inputStyle} />
            </Field>
          ) : null}

          {form.kind === "ads_deposit" ? (
            <>
              <Field label="Кампания" hint="За остатком какой кампании следить.">
                {campaigns.length === 0 ? (
                  <p className="text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
                    Рекламные кампании ещё не загрузились.
                  </p>
                ) : (
                  <select value={form.campaignId} onChange={(e) => set({ campaignId: e.target.value })} className={inputCls} style={inputStyle}>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {`${c.name || "Кампания"} · №${c.id}`}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <div>
                <PanelRow title="Пополнять, когда остаток ниже" control={<PanelNumber label="Порог остатка" unit="₽" value={form.belowRub} min={100} max={100000} step={100} onCommit={(v) => set({ belowRub: v })} />} />
                <PanelRow title="Пополнять на" control={<PanelNumber label="Сумма пополнения" unit="₽" value={form.topUpRub} min={100} max={100000} step={100} onCommit={(v) => set({ topUpRub: v })} />} />
                <PanelRow title="Не больше за сутки" hint="Рамка: больше этой суммы поручение не потратит." control={<PanelNumber label="Лимит за сутки" unit="₽" value={form.maxPerDayRub} min={100} max={200000} step={500} onCommit={(v) => set({ maxPerDayRub: v })} />} />
                <PanelRow title="Проверять каждые" hint="Как часто смотреть остаток." control={<PanelNumber label="Проверка, минут" unit="мин" value={form.checkMinutes} min={15} max={1440} step={15} onCommit={(v) => set({ checkMinutes: v })} />} />
              </div>
            </>
          ) : null}

          {form.kind === "when_orders" ? (
            <>
              <div>
                <PanelRow title="Если заказов за сутки меньше" hint="Считаются полные сутки, без отменённых." control={<PanelNumber label="Порог заказов" unit="шт." value={form.belowOrders} min={1} max={10000} onCommit={(v) => set({ belowOrders: v })} />} />
                <PanelRow title="Столько дней подряд" control={<PanelNumber label="Дней подряд" unit="дн." value={form.orderDays} min={1} max={14} onCommit={(v) => set({ orderDays: v })} />} />
              </div>
              <Field label="Когда проверять" hint="Срабатывает не чаще раза в сутки.">
                <PanelSegmented label="Когда проверять" value={form.checkAt} onChange={(v) => set({ checkAt: v })} options={[{ id: "time", label: "Каждый день в выбранное время" }, { id: "interval", label: "Несколько раз в день" }]} />
                {form.checkAt === "time" ? (
                  <div className="mt-5">
                    <TimePicker value={form.time} onChange={(t) => set({ time: t })} />
                  </div>
                ) : (
                  <div className="mt-4">
                    <PanelRow title="Проверять каждые" control={<PanelNumber label="Проверка, минут" unit="мин" value={form.checkMinutes} min={15} max={1440} step={15} onCommit={(v) => set({ checkMinutes: v })} />} />
                  </div>
                )}
              </Field>
              <Field label="Что сделать">
                <PanelSegmented label="Действие" value={form.then} onChange={(t) => set({ then: t })} options={[{ id: "notify", label: "Сообщить мне" }, { id: "deposit", label: "Пополнить рекламу" }]} />
                {form.then === "notify" ? (
                  <input value={form.thenText} onChange={(e) => set({ thenText: e.target.value })} maxLength={400} placeholder="Что написать в напоминании (необязательно)" className={`${inputCls} mt-3`} style={inputStyle} />
                ) : null}
              </Field>
              {form.then === "deposit" ? (
                <>
                  <Field label="Кампания">
                    {campaigns.length === 0 ? (
                      <p className="text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
                        Рекламные кампании ещё не загрузились.
                      </p>
                    ) : (
                      <select value={form.campaignId} onChange={(e) => set({ campaignId: e.target.value })} className={inputCls} style={inputStyle}>
                        {campaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {`${c.name || "Кампания"} · №${c.id}`}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <div>
                    <PanelRow title="Пополнить на" control={<PanelNumber label="Сумма пополнения" unit="₽" value={form.topUpRub} min={100} max={100000} step={100} onCommit={(v) => set({ topUpRub: v })} />} />
                    <PanelRow title="Не больше за сутки" hint="Рамка: больше этой суммы поручение не потратит." control={<PanelNumber label="Лимит за сутки" unit="₽" value={form.maxPerDayRub} min={100} max={200000} step={500} onCommit={(v) => set({ maxPerDayRub: v })} />} />
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {form.kind === "price_step" ? (
            <>
              <Field label="Товары" hint={form.nmIds.length > 0 ? `Выбрано: ${form.nmIds.length}` : "Выберите один или несколько товаров."}>
                <ProductPicker items={items} picked={picked} onToggle={(id) => {
                    const nmIds = picked.has(id) ? form.nmIds.filter((x) => x !== id) : [...form.nmIds, id].slice(0, 50);
                    // Граница цены подставляется от цены выбранного товара (на 10% ниже или выше), её можно поправить.
                    const first = items.find((i) => String(i.externalId) === nmIds[0]);
                    const price = first ? first.discountedPrice ?? first.price : null;
                    const guess = price && form.boundRub === 0 ? Math.round((price * (form.direction === "down" ? 0.9 : 1.1)) / 10) * 10 : form.boundRub;
                    set({ nmIds, boundRub: guess });
                  }} />
              </Field>
              <div>
                <PanelRow title="Что делать" control={<PanelSegmented label="Направление" value={form.direction} onChange={(d) => set({ direction: d })} options={[{ id: "down", label: "Снижать" }, { id: "up", label: "Повышать" }]} />} />
                <PanelRow title="Шаг за раз" hint="На сколько процентов менять цену при каждом запуске." control={<PanelNumber label="Шаг цены" unit="%" value={form.pct} min={1} max={20} onCommit={(v) => set({ pct: v })} />} />
                <PanelRow title={form.direction === "down" ? "Не ниже" : "Не выше"} hint={form.direction === "down" ? "Рамка: ниже этой цены для покупателя агент не опустит." : "Рамка: выше этой цены для покупателя агент не поднимет."} control={<PanelNumber label="Граница цены" unit="₽" value={form.boundRub} min={0} max={10000000} step={10} onCommit={(v) => set({ boundRub: v })} />} />
              </div>
            </>
          ) : null}

          {form.kind !== "ads_deposit" && form.kind !== "when_orders" ? (
            <Field label="Когда выполнять">
              <PanelSegmented
                label="Расписание"
                value={form.schedType}
                onChange={(t) => set({ schedType: t })}
                options={[{ id: "once", label: "Один раз" }, { id: "daily", label: "Каждый день" }, { id: "weekly", label: "По дням недели" }, { id: "every", label: "Через интервал" }]}
              />

              {form.schedType === "once" ? (
                <div className="mt-5 space-y-5">
                  <div>
                    <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
                      День
                    </p>
                    <DayPicker value={form.onceAt.slice(0, 10)} onChange={(d) => set({ onceAt: `${d}T${form.onceAt.slice(11, 16) || "10:00"}` })} />
                  </div>
                  <div>
                    <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
                      Время
                    </p>
                    <TimePicker value={form.onceAt.slice(11, 16) || "10:00"} onChange={(t) => set({ onceAt: `${form.onceAt.slice(0, 10)}T${t}` })} />
                  </div>
                </div>
              ) : null}

              {form.schedType === "daily" || form.schedType === "weekly" ? (
                <div className="mt-5 space-y-5">
                  {form.schedType === "weekly" ? (
                    <div>
                      <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
                        Дни недели
                      </p>
                      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Дни недели">
                        {WEEKDAY_SHORT.map((d, i) => {
                          const on = form.weekdays.includes(i + 1);
                          return (
                            <button key={d} type="button" aria-pressed={on} onClick={() => set({ weekdays: on ? form.weekdays.filter((x) => x !== i + 1) : [...form.weekdays, i + 1] })} className="flex h-11 w-11 items-center justify-center rounded-full text-[14px] font-semibold uppercase outline-none transition-[background-color,transform] duration-150 active:scale-95 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: on ? "#2E5A43" : "rgba(1,20,8,0.06)", color: on ? "#fff" : hub.textMuted }}>
                              {d}
                            </button>
                          );
                        })}
                        <span className="mx-1 h-6 w-px" style={{ backgroundColor: "rgba(1,20,8,0.14)" }} aria-hidden />
                        <Chip onClick={() => set({ weekdays: [1, 2, 3, 4, 5] })}>Будни</Chip>
                        <Chip onClick={() => set({ weekdays: [6, 7] })}>Выходные</Chip>
                        <Chip onClick={() => set({ weekdays: [1, 2, 3, 4, 5, 6, 7] })}>Все дни</Chip>
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
                      Время
                    </p>
                    <TimePicker value={form.time} onChange={(t) => set({ time: t })} />
                  </div>
                </div>
              ) : null}

              {form.schedType === "every" ? (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {[3, 6, 12, 24, 48, 72].map((h) => (
                    <Chip key={h} on={form.everyHours === h} onClick={() => set({ everyHours: h })}>
                      {h >= 24 ? `Каждые ${h / 24} дн.` : `Каждые ${h} ч`}
                    </Chip>
                  ))}
                  <PanelNumber label="Интервал, часов" unit="ч" value={form.everyHours} min={1} max={720} onCommit={(v) => set({ everyHours: v })} />
                </div>
              ) : null}

              {form.schedType !== "once" ? (
                <div className="mt-6">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
                    Сколько раз повторить
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {[[0, "Пока не отключу"], [1, "1 раз"], [3, "3 раза"], [7, "7 раз"], [14, "14 раз"], [30, "30 раз"]].map(([n, l]) => (
                      <Chip key={n} on={form.maxRuns === n} onClick={() => set({ maxRuns: n as number })}>
                        {l}
                      </Chip>
                    ))}
                  </div>
                  <p className="mt-2.5 text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                    {form.maxRuns === 0 ? "Поручение будет работать, пока вы сами не поставите его на паузу или не удалите." : `Поручение выполнится ${form.maxRuns} ${form.maxRuns === 1 ? "раз" : form.maxRuns < 5 ? "раза" : "раз"} и завершится само.`}
                  </p>
                </div>
              ) : null}
              <p className="mt-5 text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>
                Время везде московское (МСК).
              </p>
            </Field>
          ) : null}

          {form.kind === "ads_deposit" || form.kind === "when_orders" ? (
            <Field label="Сколько работать">
              <div className="flex flex-wrap items-center gap-2">
                {[[0, "Пока не отключу"], [7, "7 дней"], [14, "14 дней"], [30, "30 дней"]].map(([n, l]) => (
                  <Chip key={n} on={form.workDays === n} onClick={() => set({ workDays: n as number })}>
                    {l}
                  </Chip>
                ))}
              </div>
              <p className="mt-2.5 text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                {form.workDays === 0 ? "Поручение будет работать, пока вы сами не поставите его на паузу или не удалите." : `Поручение проработает ${form.workDays} дней от сегодняшнего дня и завершится само.`}
              </p>
            </Field>
          ) : null}

          {form.kind !== "remind" && !(form.kind === "when_orders" && form.then === "notify") ? (
            <Field label="Как действовать">
              <PanelSegmented label="Режим" value={form.mode} onChange={(m) => set({ mode: m })} options={[{ id: "act", label: "Сделать самому" }, { id: "ask", label: "Только напомнить" }]} />
              <p className="mt-3 text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                {form.mode === "act" ? (sandbox ? "Сейчас включён тестовый режим: агент проверит всё, но в Wildberries ничего не отправит. Рамки соблюдаются всегда." : "Агент выполнит действие сам в ваших рамках. Каждый запуск попадёт в журнал.") : "Агент ничего не меняет, а пришлёт напоминание, когда пора действовать."}
              </p>
            </Field>
          ) : null}
        </div>

        <div className="border-t px-7 py-4" style={{ borderColor: "rgba(1,20,8,0.08)" }}>
          <p className="mb-3 text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
            {form.kind === "ads_deposit" || (form.kind === "when_orders" && form.checkAt === "interval") ? `Проверка каждые ${form.checkMinutes} мин.` : next.length > 0 ? <>Ближайшие запуски: <strong style={{ color: hub.text, fontWeight: 600 }}>{next.join(" · ")}</strong></> : "Укажите время, и здесь появятся ближайшие запуски."}
          </p>
          {error ? (
            <p className="mb-3 rounded-[12px] px-3.5 py-2.5 text-[14px]" style={{ ...hubSans, backgroundColor: hub.dangerSoft, color: hub.text }} role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <HubButton variant="dark" loading={busy} onClick={() => void save()}>
              {form.id ? "Сохранить" : "Создать поручение"}
            </HubButton>
            <HubButton variant="secondary" onClick={onClose}>
              Отмена
            </HubButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProductPicker({ items, picked, onToggle }: { items: NonNullable<SellerCatalogSnapshot["items"]>; picked: Set<string>; onToggle: (id: string) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((i) => !s || `${i.title} ${i.vendorCode} ${i.externalId}`.toLowerCase().includes(s)).slice(0, 40);
  }, [items, q]);
  return (
    <div>
      <label className="mb-2 flex h-10 items-center gap-2 rounded-[10px] px-3" style={{ boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.16)" }}>
        <Search className="h-4 w-4 shrink-0" style={{ color: hub.textSubtle }} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или артикул" aria-label="Поиск товара" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" style={{ ...hubSans, color: hub.text }} />
      </label>
      <ul className="max-h-[230px] overflow-y-auto rounded-[12px] [scrollbar-width:thin]" style={{ boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.1)" }}>
        {list.length === 0 ? (
          <li className="px-4 py-5 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
            Ничего не нашлось.
          </li>
        ) : (
          list.map((i) => {
            const id = String(i.externalId);
            const on = picked.has(id);
            const price = i.discountedPrice ?? i.price;
            return (
              <li key={i.id} className="border-t first:border-t-0" style={{ borderColor: "rgba(1,20,8,0.07)" }}>
                <button type="button" onClick={() => onToggle(id)} aria-pressed={on} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left outline-none transition-colors hover:bg-[rgba(1,20,8,0.035)] focus-visible:shadow-[inset_0_0_0_2px_var(--hub-lime-ring)]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] transition-colors" style={{ backgroundColor: on ? "#2E5A43" : "transparent", boxShadow: on ? "none" : "inset 0 0 0 1.5px rgba(1,20,8,0.25)" }} aria-hidden>
                    {on ? <Check className="h-3.5 w-3.5" style={{ color: "#B9FF4B" }} strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px]" style={{ ...hubSans, color: hub.text }}>
                    {i.title}
                  </span>
                  {price != null ? (
                    <span className="shrink-0 text-[13.5px] tabular-nums" style={{ ...hubSans, color: hub.textMuted }}>
                      {Math.round(price)} ₽
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
