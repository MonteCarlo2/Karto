"use client";

import { useState } from "react";
import { ChevronDown, CircleCheck, ExternalLink, EyeOff, Info, Lightbulb, Target, TrendingUp } from "lucide-react";
import { actionLabel, viewLabel, briefText, evidenceRows, severityLabel } from "@/components/seller-hub/hub-task-present";
import { humanizeText, taskStory } from "@/lib/seller-hub/task-engine/story";
import type { SellerCatalogItem } from "@/lib/seller-hub/types";
import type { TopAction } from "@/components/seller-hub/top-actions";
import { ACTION_ICONS, ArticleChip, HubButton, HubPhoto, SEVERITY_ICONS, hub, hubNumeric, hubSans, hubSerif } from "@/components/seller-hub/hub-ui";

const SEVERITY_COLOR = { critical: "#B3282B", important: "#8A5A0B", opportunity: "#2F5F9A" } as const;
const SEVERITY_DOT = { critical: "#D33A3C", important: "#D29922", opportunity: "#4076B9" } as const;

/** «Задача — товар»: название делится на действие и товар, чтобы строка читалась с первого взгляда. */
function splitTitle(title: string): { head: string; product: string | null } {
  const index = title.indexOf(" — ");
  if (index < 0) return { head: title, product: null };
  return { head: title.slice(0, index), product: title.slice(index + 3) };
}

/**
 * «Главное сейчас»: несколько действий с наибольшим значением для магазина.
 * Строка: номер, что сделать, по какому товару, справа действия (главное, «Выполнено», «Скрыть») и стрелка подробностей.
 * Подробности раскрываются под строкой.
 */
export function HubTopActions({
  actions,
  canAct,
  saving,
  onOpen,
  onAct,
  fixFor,
  onComplete,
  muteFor,
  itemFor,
}: {
  actions: TopAction[];
  canAct: (action: TopAction) => boolean;
  saving: boolean;
  onOpen: (action: TopAction) => void;
  onAct: (action: TopAction) => void;
  /** Если платформа может исправить задачу сама (с подтверждением и возвратом), возвращает это действие. */
  fixFor: (action: TopAction) => (() => void) | undefined;
  onComplete: (action: TopAction) => void;
  muteFor: (action: TopAction) => (() => void) | undefined;
  /** Товар из каталога для строки: нужен, чтобы показать фото и название в раскрытом виде. */
  itemFor: (action: TopAction) => SellerCatalogItem | null;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (actions.length === 0) return null;
  return (
    <section
      aria-labelledby="top-actions-title"
      className="rounded-[22px] border-2 bg-white px-6 pb-1 pt-5 shadow-[0_1px_2px_rgba(1,20,8,0.04)] sm:px-7"
      style={{ borderColor: hub.limeEdge }}
    >
      <h2 id="top-actions-title" className="text-balance text-[28px] font-semibold leading-8 tracking-[-0.02em]" style={{ ...hubSerif, color: hub.text }}>
        Главное сейчас
      </h2>
      <ol className="mt-3">
        {actions.map((action, index) => {
          const fix = fixFor(action);
          const label = fix ? "Исправить цену" : actionLabel(action.actionType);
          const enabled = fix != null || (label != null && canAct(action));
          const open = openId === action.id;
          const severity = action.primary.severity;
          const SeverityIcon = SEVERITY_ICONS[severity];
          const ActionIcon = ACTION_ICONS[action.actionType];
          const mute = muteFor(action);
          const { head, product } = splitTitle(action.title);
          const item = itemFor(action);
          const story = taskStory(action.primary);
          const numbers = evidenceRows(action.primary.evidence).slice(0, 4);
          // «Дополнительно: короткий запас; цена менялась» разбираем на короткие пометки.
          const extraNotes = humanizeText(action.supportNote ?? "")
            .replace(/^Дополнительно:\s*/iu, "")
            .split(/;\s*|,\s+(?=[а-яё])/iu)
            .map((note) => note.trim().replace(/[.]+$/u, ""))
            .filter(Boolean)
            .map((note) => note.charAt(0).toUpperCase() + note.slice(1));
          return (
            <li key={action.id} className="hub-rise border-t" style={{ borderColor: hub.border, animationDelay: `${index * 50}ms` }}>
              <div className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-x-4 py-4 lg:grid-cols-[44px_minmax(0,1fr)_auto] lg:items-start">
                <span
                  className="text-[36px] font-medium leading-none tracking-[-0.02em]"
                  style={{ ...hubSerif, ...hubNumeric, color: hub.borderStrong }}
                  aria-hidden
                >
                  {index + 1}
                </span>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : action.id)}
                  className="group/row block w-full min-w-0 rounded-[10px] text-left outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--hub-lime-ring)]"
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-semibold" style={hubSans}>
                    <span className="inline-flex items-center gap-1.5" style={{ color: SEVERITY_COLOR[severity] }}>
                      <SeverityIcon className="h-3.5 w-3.5" strokeWidth={2} style={{ color: SEVERITY_DOT[severity] }} aria-hidden />
                      {severityLabel(severity)}
                    </span>
                    {action.proofs[0] ? (
                      <>
                        <span style={{ color: hub.borderStrong }} aria-hidden>·</span>
                        <span className="text-[13px]" style={{ ...hubNumeric, color: hub.text }}>{action.proofs[0]}</span>
                      </>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-pretty text-[18px] font-bold leading-[1.3] tracking-[-0.015em] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                    {head}
                    <span
                      className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border align-[2px] transition-colors group-hover/row:bg-[var(--hub-surface-muted)]"
                      style={{ borderColor: hub.borderCard, color: hub.textMuted }}
                      aria-hidden
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={2} />
                    </span>
                  </span>
                  {product ? (
                    <span className="mt-0.5 block truncate text-[14px] leading-6" style={{ ...hubSans, color: hub.textMuted }}>
                      {product}
                    </span>
                  ) : null}
                </button>

                <div className="col-start-2 mt-3 flex items-start gap-2 lg:col-start-3 lg:mt-0">
                  <div className="flex w-[240px] max-w-full flex-col gap-2">
                    {enabled && label ? (
                      <HubButton className="w-full" variant={index === 0 ? "primary" : "dark"} onClick={() => (fix ? fix() : onAct(action))}>
                        {ActionIcon ? <ActionIcon className="h-4 w-4" strokeWidth={1.75} /> : null}
                        {label}
                      </HubButton>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <HubButton className={`w-full ${mute ? "" : "col-span-2"}`} size="sm" variant="secondary" disabled={saving} onClick={() => onComplete(action)}>
                        <CircleCheck className="h-[18px] w-[18px]" strokeWidth={2.25} style={{ color: hub.greenDark }} />
                        Выполнено
                      </HubButton>
                      {mute ? (
                        <HubButton className="w-full" size="sm" variant="secondary" disabled={saving} title="Не создавать такие задачи по этому товару" onClick={mute}>
                          <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                          Скрыть
                        </HubButton>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="hub-expand col-span-full" data-open={open} aria-hidden={!open} inert={!open}>
                  <div>
                    <div className="mt-4 rounded-[18px] px-5 py-5 lg:ml-[60px]" style={{ backgroundColor: hub.canvas }}>
                      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                        <div className="min-w-0 space-y-4">
                          {product && item ? (
                            <div className="flex items-center gap-3.5">
                              <HubPhoto src={item.imageUrl} className="h-[84px] w-[64px] shrink-0 rounded-[10px]" iconClassName="h-5 w-5" />
                              <div className="min-w-0">
                                <p className="line-clamp-2 text-[15px] font-semibold leading-[1.35]" style={{ ...hubSans, color: hub.text }}>{item.title}</p>
                                <p className="mt-1 text-[12px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
                                  {action.primary.vendorCode ? <><ArticleChip value={action.primary.vendorCode} className="mr-1.5" /></> : null}nm {action.primary.nmId}
                                </p>
                              </div>
                            </div>
                          ) : null}

                          <div className="space-y-1.5">
                            <p className="max-w-[60ch] text-pretty text-[16px] font-semibold leading-[1.45]" style={{ ...hubSans, color: hub.text }}>
                              {story ? story.fact : briefText(action.primary.description, [action.primary.productTitle, item?.title, action.primary.vendorCode], 2, 220)}
                            </p>
                            {story?.cause ? (
                              <p className="max-w-[60ch] text-pretty text-[15px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>{story.cause}</p>
                            ) : null}
                          </div>

                          {story?.action || action.primary.recommendation ? (
                            <div className="flex items-start gap-2.5 rounded-[14px] border px-4 py-3" style={{ backgroundColor: hub.limeWash, borderColor: "rgba(165, 232, 58, 0.55)" }}>
                              <Lightbulb className="mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={1.75} style={{ color: hub.text }} aria-hidden />
                              <div>
                                <p className="text-[12px] font-semibold" style={{ ...hubSans, color: hub.textSubtle }}>Что сделать</p>
                                <p className="mt-0.5 text-pretty text-[15px] font-semibold leading-[1.45]" style={{ ...hubSans, color: hub.text }}>
                                  {story?.action ?? briefText(action.primary.recommendation, [], 1, 160)}
                                </p>
                              </div>
                            </div>
                          ) : null}

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[14px] bg-white px-4 py-3.5">
                              <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                                <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: hub.surfaceMuted }} aria-hidden>
                                  <Target className="h-3.5 w-3.5" strokeWidth={2} />
                                </span>
                                Почему это сейчас главное
                              </p>
                              <p className="mt-2 text-pretty text-[15px] leading-[1.55] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textMuted }}>{humanizeText(action.why)}</p>
                            </div>
                            <div className="rounded-[14px] bg-white px-4 py-3.5">
                              <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                                <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: hub.greenSoft, color: hub.greenDark }} aria-hidden>
                                  <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />
                                </span>
                                Что это даст
                              </p>
                              <p className="mt-2 text-pretty text-[15px] leading-[1.55] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textMuted }}>{humanizeText(action.effect)}</p>
                            </div>
                          </div>
                          {extraNotes.length > 0 ? (
                            <div>
                              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                                <Info className="h-4 w-4" strokeWidth={1.75} style={{ color: hub.textSubtle }} aria-hidden />
                                Ещё по этому товару
                              </p>
                              <ul className="flex flex-wrap gap-2">
                                {extraNotes.map((note) => (
                                  <li key={note} className="rounded-full border bg-white px-3 py-1 text-[13px] font-medium" style={{ ...hubSans, borderColor: hub.border, color: hub.text }}>
                                    {note}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-3">
                          {numbers.length > 0 ? (
                            <dl className="grid grid-cols-2 gap-2.5">
                              {numbers.map((row, rowIndex) => (
                                <div key={row.label} className="min-w-0 rounded-[14px] bg-white px-3.5 py-3">
                                  <dt className="text-[12px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>{row.label}</dt>
                                  <dd
                                    className={`mt-1 whitespace-nowrap font-bold leading-6 tracking-[-0.02em] ${rowIndex < 2 ? "text-[20px]" : "text-[16px]"}`}
                                    style={{ ...hubSans, ...hubNumeric, color: hub.text }}
                                  >
                                    {row.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ) : null}
                          <div className="flex flex-col gap-2">
                            {enabled && viewLabel(action.actionType) ? (
                              <HubButton className="w-full" size="sm" variant="secondary" onClick={() => onAct(action)}>
                                {ActionIcon ? <ActionIcon className="h-4 w-4" strokeWidth={1.75} /> : null}
                                {viewLabel(action.actionType)}
                              </HubButton>
                            ) : null}
                            <HubButton className="w-full" size="sm" variant="secondary" onClick={() => onOpen(action)}>
                              <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                              Открыть задачу целиком
                            </HubButton>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
