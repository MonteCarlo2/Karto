"use client";

import { useCallback, useEffect, useState } from "react";
import { acceptSellerHubAiFinding, dismissSellerHubAiFinding, loadSellerHubAiFeed, markSellerHubPlanStep, setSellerHubPlanAutopilot, type AiFeedItem } from "@/lib/seller-hub/client-api";
import { describeCondition, describePlanAction, effectReport, evidenceLabel, stepCompliance, stepProgress } from "@/lib/seller-hub/agent/strategy";
import { writeHubCardSeed } from "@/lib/seller-hub/card-seed";
import { HubBadge, HubButton, HubPanel, hub } from "./hub-ui";

/**
 * Решения ИИ в «Задачах»: по каждому товару одна стратегия на все сигналы алгоритмов (цель, шаги по срокам, программа цены, проверки, запасной план).
 * Принятая стратегия ведётся автоматически: программа сверяет цифры по контрольным точкам и предлагает очередной шаг цены, когда подойдёт срок.
 * Цены в кабинете меняются только после кнопки «Выполнить» в разделе «Агенты».
 */

const SECOND_LABEL: Record<string, { text: string; tone: "ok" | "warn" | "muted" }> = {
  agree: { text: "второй ИИ согласен", tone: "ok" },
  dispute: { text: "второй ИИ сомневается", tone: "warn" },
  not_checked: { text: "второй ИИ не проверял", tone: "muted" },
};

const SEVERITY_TONE = { critical: "danger", important: "warn", watch: "muted" } as const;
const SEVERITY_TEXT = { critical: "Критично", important: "Важно", watch: "Присмотреться" } as const;

const METRIC_LABEL: Record<string, string> = {
  orders_28d: "заказы за 28 дней",
  cart_pct: "конверсия в корзину, %",
  cart_to_order_pct: "конверсия корзина→заказ, %",
  turnover_days: "оборачиваемость, дней",
  margin_pct: "маржа, %",
  stock: "остаток, шт.",
  opens_28d: "просмотры за 28 дней",
  rating: "рейтинг",
  oos_days: "дней до нулевого остатка",
  price_buyer: "цена для покупателя, ₽",
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "");

function Label({ children }: { children: string }) {
  return <p className="mt-2 text-[12px] font-semibold" style={{ color: hub.text }}>{children}</p>;
}

export function HubAiFindings({ titleByNm, cardByNm, chatId, reloadKey }: { titleByNm?: Map<string, string>; /** Данные карточек для кнопок «Открыть в Потоке». */ cardByNm?: Map<string, { title: string; vendorCode: string; description: string }>; /** Показать только планы одного диалога «поставить задачу». */ chatId?: string; /** Меняется, когда нужно перечитать ленту (например, после нового ответа ИИ). */ reloadKey?: number }) {
  const [items, setItems] = useState<AiFeedItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const res = await loadSellerHubAiFeed();
    if (res.ok) setItems(res.items.filter((item) => item.finding && (!chatId || item.finding.taskKey?.startsWith(`chat:${chatId}:`))));
  }, [chatId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function markStep(id: string, stepIndex: number, status: "done" | "skipped" | "reset") {
    setBusy(id);
    const res = await markSellerHubPlanStep(id, stepIndex, status);
    if (res.ok) await load();
    setBusy(null);
  }

  if (items.length === 0) return null;

  return (
    <HubPanel className="px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <HubBadge tone="accent">ИИ</HubBadge>
        <p className="text-[13px] font-semibold" style={{ color: hub.text }}>{chatId ? "Планы по вашей задаче" : "Что заметил ИИ и как предлагает решать"}</p>
      </div>
      <ul className="space-y-3">
        {(showAll || chatId ? items : items.slice(0, 3)).map((item) => {
          const f = item.finding!;
          const st = f.strategy ?? null;
          const state = f.strategyState ?? null;
          const second = SECOND_LABEL[f.second] ?? SECOND_LABEL.not_checked!;
          const signalCount = item.taskTitles.length;
          const running = f.ownerAccepted && state?.status === "running";
          return (
            <li key={item.key} className="rounded-lg border px-3 py-2.5" style={{ borderColor: hub.borderSoft }}>
              <div className="flex flex-wrap items-center gap-2">
                <HubBadge tone="accent">ИИ</HubBadge>
                <HubBadge tone={SEVERITY_TONE[item.severity]}>{SEVERITY_TEXT[item.severity]}</HubBadge>
                {item.kindLabel ? <span className="text-[12px]" style={{ color: hub.textMuted }}>{item.kindLabel}</span> : null}
                <HubBadge tone={signalCount > 0 || f.origin === "chat" ? "ok" : "muted"} title={item.taskTitles.join("; ")}>
                  {f.origin === "chat" ? "по вашей задаче" : signalCount > 1 ? `${signalCount} сигнала алгоритмов, одно решение` : signalCount === 1 ? "сигнал алгоритма, решён ИИ" : "алгоритм не видит"}
                </HubBadge>
              </div>
              <p className="mt-1.5 text-[14px] font-semibold" style={{ color: hub.text }}>
                {f.title}
                {f.nmId ? <span className="ml-2 text-[12px] font-normal" style={{ color: hub.textMuted }}>{titleByNm?.get(f.nmId) ?? `арт. ${f.nmId}`}</span> : null}
              </p>
              {f.what ? <p className="mt-1 text-[13px] leading-5" style={{ color: hub.textMuted }}>{f.what}</p> : null}
              {f.problems && f.problems.length > 1 ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] leading-4" style={{ color: hub.textMuted }}>
                  {item.taskTitles.map((t, i) => (
                    <li key={i}>{t}{f.problems![i]?.note ? `: ${f.problems![i]!.note}` : ""}</li>
                  ))}
                </ul>
              ) : null}
              {f.evidence.length > 0 ? <p className="mt-1 text-[12px]" style={{ color: hub.textMuted }}>Цифры: {f.evidence.map((e) => `${evidenceLabel(e.key)}: ${e.value}`).join(" · ")}</p> : null}

              {st ? (
                <div className="mt-1">
                  <Label>Цель</Label>
                  <p className="text-[13px] leading-5" style={{ color: hub.text }}>{st.goal}</p>
                  <Label>{st.steps.length === 1 ? "Что сделать" : "План по срокам"}</Label>
                  <ol className="list-decimal space-y-0.5 pl-5 text-[13px] leading-5" style={{ color: hub.text }}>
                    {st.steps.map((p, i) => {
                      const prog = f.ownerAccepted && state ? stepProgress(st, state, Date.now())[i] : null;
                      const human = !p.action;
                      return (
                        <li key={i}>
                          <span style={{ color: hub.textMuted }}>{p.day === 0 ? "сразу" : p.when || `день ${p.day}`}: </span>
                          {p.onlyIf ? <span className="mr-1 rounded px-1 text-[11px]" style={{ background: hub.borderSoft, color: hub.textMuted }}>если {describeCondition(p.onlyIf)}</span> : null}
                          <span style={{ textDecoration: prog?.status === "skipped" ? "line-through" : undefined, opacity: prog?.status === "skipped" ? 0.6 : 1 }}>{p.step}</span>
                          {p.action ? (
                            <span className="ml-1.5 text-[11px]" style={{ color: hub.textMuted }}>
                              ({describePlanAction(p.action)}: {prog?.status === "done" ? "выполнено" : "программа посчитает и проверит, выполните кнопкой в «Агентах»"})
                            </span>
                          ) : (
                            <span className="ml-1.5 text-[11px]" style={{ color: hub.textMuted }}>(это делаете вы{prog?.status === "done" ? ": отмечено «сделал»" : prog?.status === "skipped" ? ": пропущено" : ""})</span>
                          )}
                          {p.flow && f.nmId ? (
                            <a
                              className="ml-2 inline-block rounded border px-2 py-0.5 align-middle text-[11px] font-semibold"
                              style={{ borderColor: hub.ink, color: hub.ink }}
                              href={p.flow === "visual" ? "/studio/visual" : p.flow === "description" ? "/studio/description" : "/studio/auto-replies/workspace"}
                              onClick={() => {
                                const card = cardByNm?.get(f.nmId!);
                                if (card && p.flow !== "auto_replies") writeHubCardSeed({ title: card.title, vendorCode: card.vendorCode, externalId: f.nmId!, description: card.description });
                              }}
                            >
                              {p.flow === "visual" ? "Открыть в Потоке" : p.flow === "description" ? "Открыть SEO-описания" : "Открыть ответы на отзывы"}
                            </a>
                          ) : null}
                          {prog && human ? (
                            <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 align-middle">
                              {prog.status === "due" ? <HubBadge tone="warn">пора сделать</HubBadge> : null}
                              {prog.status !== "done" ? (
                                <button type="button" className="rounded border px-2 py-0.5 text-[11px]" style={{ borderColor: hub.borderSoft, color: hub.text }} disabled={busy === f.id} onClick={() => void markStep(f.id, i, "done")}>
                                  Сделал
                                </button>
                              ) : null}
                              {prog.status === "upcoming" || prog.status === "due" ? (
                                <button type="button" className="rounded border px-2 py-0.5 text-[11px]" style={{ borderColor: hub.borderSoft, color: hub.textMuted }} disabled={busy === f.id} onClick={() => void markStep(f.id, i, "skipped")}>
                                  Пропустить
                                </button>
                              ) : null}
                              {prog.status === "done" || prog.status === "skipped" ? (
                                <button type="button" className="text-[11px] underline" style={{ color: hub.textMuted }} disabled={busy === f.id} onClick={() => void markStep(f.id, i, "reset")}>
                                  отменить отметку
                                </button>
                              ) : null}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                  {st.checks.length > 0 ? (
                    <>
                      <Label>Контрольные точки</Label>
                      <ul className="list-disc space-y-0.5 pl-5 text-[13px] leading-5" style={{ color: hub.text }}>
                        {st.checks.map((c, i) => (
                          <li key={i}>
                            день {c.day}: {c.label}
                            {c.look.length > 0 ? <span style={{ color: hub.textMuted }}> ({c.look.map((l) => `${METRIC_LABEL[l.metric] ?? l.metric} ${l.expect === "up" ? "растёт" : l.expect === "down" ? "снижается" : "держится"}`).join(", ")})</span> : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {st.success.length > 0 || st.guards.length > 0 ? (
                    <>
                      <Label>Как поймём, что помогло</Label>
                      {st.success.length > 0 ? <p className="text-[13px] leading-5" style={{ color: hub.text }}>Успех: {st.success.map((c) => `${METRIC_LABEL[c.metric] ?? c.metric} ${c.op === ">=" ? "не ниже" : "не выше"} ${c.value}`).join("; ")}{st.reviewAfterDays ? ` (итог через ${st.reviewAfterDays} дн.)` : ""}.</p> : null}
                      {st.guards.length > 0 ? <p className="text-[13px] leading-5" style={{ color: hub.text }}>Не должно ухудшиться: {st.guards.map((c) => `${METRIC_LABEL[c.metric] ?? c.metric} ${c.op === ">=" ? "не ниже" : "не выше"} ${c.value}`).join("; ")}.</p> : null}
                    </>
                  ) : st.reviewAfterDays ? (
                    <p className="mt-1 text-[12px]" style={{ color: hub.textMuted }}>Наблюдаем {st.reviewAfterDays} дн. и показываем, как менялись цифры.</p>
                  ) : null}
                  {st.fallback ? (
                    <>
                      <Label>Если не поможет</Label>
                      <p className="text-[13px] leading-5" style={{ color: hub.text }}>{st.fallback}</p>
                    </>
                  ) : null}
                  {f.ownerAccepted && state ? (
                    <div className="mt-2 rounded-md px-2.5 py-2" style={{ background: hub.borderSoft }}>
                      <p className="text-[12px] font-semibold" style={{ color: hub.text }}>
                        {state.status === "worked" ? "Сработало" : state.status === "not_worked" ? "Не сработало" : state.status === "observed" ? "Наблюдение завершено" : "Ведётся"}
                        {state.acceptedAt ? <span className="font-normal" style={{ color: hub.textMuted }}> · принято {fmtDate(state.acceptedAt)}</span> : null}
                      </p>
                      {f.autopilot ? <p className="text-[12px] leading-4" style={{ color: hub.greenDark }}>Автопилот включён: безопасные шаги плана (пауза, убрать из кампании, минус-фразы, пополнение в лимите) выполняются сами, если это разрешено в общих правилах. Остальное по вашей кнопке.</p> : null}
                      <p className="text-[12px] leading-4" style={{ color: hub.textMuted }}>План: {stepCompliance(st, state, Date.now()).text}.</p>
                      {state.reason ? <p className="text-[12px] leading-4" style={{ color: hub.textMuted }}>{state.reason}</p> : null}
                      {effectReport(st, state, state.current ?? {}).length > 0 ? (
                        (state.checkpoints ?? []).length === 0 && state.status === "running" ? (
                          <div className="mt-1">
                            <p className="text-[12px] leading-4" style={{ color: hub.textMuted }}>Исходные показатели на момент принятия плана. Сравнение «было → стало» появится после первой контрольной точки.</p>
                            <table className="mt-1 w-full text-[12px]" style={{ color: hub.text }}>
                              <tbody>
                                {effectReport(st, state, state.current ?? {}).map((r) => (
                                  <tr key={r.metric}>
                                    <td>{r.label}</td>
                                    <td className="text-right">{r.before ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <table className="mt-1 w-full text-[12px]" style={{ color: hub.text }}>
                            <thead>
                              <tr style={{ color: hub.textMuted }}>
                                <th className="text-left font-normal">Показатель</th>
                                <th className="text-right font-normal">Было</th>
                                <th className="text-right font-normal">Стало</th>
                                <th className="text-right font-normal">Изменение</th>
                              </tr>
                            </thead>
                            <tbody>
                              {effectReport(st, state, state.current ?? {}).map((r) => (
                                <tr key={r.metric}>
                                  <td>{r.label}</td>
                                  <td className="text-right">{r.before ?? "—"}</td>
                                  <td className="text-right">{r.after ?? "—"}</td>
                                  <td className="text-right" style={{ color: r.better == null ? hub.textMuted : r.better ? hub.greenDark : hub.danger }}>
                                    {r.change == null ? "—" : `${r.change > 0 ? "+" : ""}${r.change}${r.changePct != null ? ` (${r.changePct > 0 ? "+" : ""}${r.changePct}%)` : ""}`}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      ) : null}
                      {(state.checkpoints ?? []).map((c) => (
                        <p key={`${c.day}-${c.label}`} className="mt-0.5 text-[12px] leading-4" style={{ color: hub.textMuted }}>
                          День {c.day}, {c.label}: {c.guardBroken ? "нарушено ограничение" : c.looksMet === true ? "ожидания оправдались" : c.looksMet === false ? "ожидания пока не оправдались" : c.successMet ? "цель достигнута" : "данных для вывода мало"}
                        </p>
                      ))}
                      {f.actionNote ? <p className="mt-1 text-[12px] leading-4" style={{ color: hub.textMuted }}>Очередной шаг цены пока нельзя: {f.actionNote.replace(/^Предложение ИИ: /, "")}. Предложение появится само, когда ограничитель разрешит.</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : f.action ? (
                <div className="mt-1.5 rounded-md px-2.5 py-2" style={{ background: hub.borderSoft }}>
                  <p className="text-[12px] leading-4" style={{ color: hub.text }}>
                    Действие, которое может выполнить программа: цену {f.action.direction === "raise" ? "повысить" : "снизить"} на ступень {f.action.stepPercent}%. {f.action.reason}
                  </p>
                </div>
              ) : null}
              {!st && f.humanAdvice ? <p className="mt-1.5 text-[13px] leading-5" style={{ color: hub.text }}>Что сделать: {f.humanAdvice}</p> : null}

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <HubBadge tone={second.tone} title={f.secondReason || undefined}>{second.text}</HubBadge>
                <div className="flex flex-wrap gap-2">
                  {running ? (
                    <HubButton
                      variant="secondary"
                      disabled={busy === f.id}
                      onClick={async () => {
                        setBusy(f.id);
                        const res = await setSellerHubPlanAutopilot(f.id, !f.autopilot);
                        if (res.ok) await load();
                        setBusy(null);
                      }}
                    >
                      {f.autopilot ? "Выключить автопилот" : "Включить автопилот"}
                    </HubButton>
                  ) : null}
                  {(st || (f.action && f.second === "agree")) && state?.status !== "worked" ? (
                    <HubButton
                      variant={running ? "secondary" : "primary"}
                      disabled={busy === f.id}
                      onClick={async () => {
                        setBusy(f.id);
                        const res = await acceptSellerHubAiFinding(f.id, !f.ownerAccepted);
                        // Сервер уже пересчитал предложения: перечитываем ленту, чтобы увидеть ход стратегии.
                        if (res.ok) await load();
                        setBusy(null);
                      }}
                    >
                      {f.ownerAccepted ? "Остановить ведение" : st ? "Принять стратегию" : "Принять к выполнению"}
                    </HubButton>
                  ) : null}
                  <HubButton
                    variant="secondary"
                    disabled={busy === f.id}
                    onClick={async () => {
                      setBusy(f.id);
                      const res = await dismissSellerHubAiFinding(f.id);
                      setBusy(null);
                      if (res.ok) setItems((prev) => prev.filter((x) => x.finding?.id !== f.id));
                    }}
                  >
                    Скрыть
                  </HubButton>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {!chatId && items.length > 3 ? (
        <div className="mt-3 flex justify-center">
          <HubButton variant="secondary" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Свернуть" : `Показать все (${items.length})`}
          </HubButton>
        </div>
      ) : null}
    </HubPanel>
  );
}
