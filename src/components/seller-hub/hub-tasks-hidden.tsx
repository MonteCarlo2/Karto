"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff, Loader2, Undo2 } from "lucide-react";
import { loadSellerHubHiddenAiFindings, loadSellerHubTaskSettings, muteSellerHubTask, restoreSellerHubAiFinding, type HiddenAiFinding } from "@/lib/seller-hub/client-api";
import { TASK_TYPE_INFO } from "@/lib/seller-hub/task-engine/settings-form";
import type { SellerCatalogItem } from "@/lib/seller-hub/types";
import { HubBadge, HubButton, HubEmptyState, HubPhoto, hub, hubNumeric, hubSans } from "./hub-ui";

type Muted = { nmId: string; type: string };

/**
 * Вкладка «Скрытые»: всё, что человек убрал кнопкой «Скрыть». Отсюда любое можно вернуть обратно.
 * Правило продукта: всё, что сделано через нас, обратимо.
 */
export function HubTasksHidden({
  marketplaceId,
  items,
  onRestoredTask,
  onRestoredAi,
}: {
  marketplaceId: string;
  items: SellerCatalogItem[];
  onRestoredTask: () => void;
  onRestoredAi: () => void;
}) {
  const [muted, setMuted] = useState<Muted[] | null>(null);
  const [hiddenAi, setHiddenAi] = useState<HiddenAiFinding[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [settings, ai] = await Promise.all([loadSellerHubTaskSettings(marketplaceId), loadSellerHubHiddenAiFindings()]);
    setMuted(settings.ok ? settings.data.mutedProducts : []);
    setHiddenAi(ai.ok ? ai.findings : []);
    if (!settings.ok || !ai.ok) setError("Часть скрытых задач не загрузилась. Обновите страницу.");
  }, [marketplaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const byNm = new Map(items.map((row) => [String(row.externalId), row]));
  const typeLabel = (type: string) => TASK_TYPE_INFO.find((info) => info.type === type)?.label ?? "Задача";

  async function restoreTask(row: Muted) {
    const key = `m:${row.nmId}:${row.type}`;
    setBusy(key);
    setError(null);
    const res = await muteSellerHubTask(row.nmId, row.type, false, marketplaceId).catch(() => ({ ok: false as const, error: "Не удалось вернуть" }));
    if (res.ok) {
      setMuted((prev) => (prev ?? []).filter((m) => !(m.nmId === row.nmId && m.type === row.type)));
      onRestoredTask();
    } else setError(res.error);
    setBusy(null);
  }

  async function restoreAi(row: HiddenAiFinding) {
    setBusy(`a:${row.id}`);
    setError(null);
    const res = await restoreSellerHubAiFinding(row.id);
    if (res.ok) {
      setHiddenAi((prev) => (prev ?? []).filter((x) => x.id !== row.id));
      onRestoredAi();
    } else setError(res.error ?? "Не удалось вернуть");
    setBusy(null);
  }

  if (muted === null || hiddenAi === null) {
    return (
      <div className="flex items-center gap-2.5 py-10 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Загружаем скрытое…
      </div>
    );
  }

  if (muted.length === 0 && hiddenAi.length === 0) {
    return (
      <HubEmptyState
        icon={<EyeOff className="h-5 w-5" strokeWidth={1.5} />}
        title="Скрытого нет"
        description="Сюда попадает всё, что вы убрали кнопкой «Скрыть». Отсюда любую задачу можно вернуть обратно."
      />
    );
  }

  return (
    <div className="space-y-8">
      <p className="max-w-[70ch] text-[14px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
        Эти задачи вы убрали кнопкой «Скрыть». Пока они здесь, Karto по ним не напоминает. «Вернуть» включает их снова.
      </p>
      {error ? (
        <p role="alert" className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>
          {error}
        </p>
      ) : null}

      {hiddenAi.length > 0 ? (
        <section>
          <h3 className="text-[18px] font-bold tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
            Скрытые решения ИИ <span className="ml-1 text-[14px] font-medium" style={{ ...hubNumeric, color: hub.textSubtle }}>{hiddenAi.length}</span>
          </h3>
          <ul className="mt-3 space-y-2.5">
            {hiddenAi.map((row) => {
              const product = row.nmId ? byNm.get(row.nmId) : undefined;
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-4 rounded-[16px] border bg-white px-5 py-4" style={{ borderColor: hub.borderCard }}>
                  <HubPhoto src={product?.imageUrl} className="h-[56px] w-[42px] shrink-0 rounded-[8px]" iconClassName="h-4 w-4" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.isStrategy ? <HubBadge tone="ok">Стратегия</HubBadge> : <HubBadge tone="accent">Совет ИИ</HubBadge>}
                    </div>
                    <p className="mt-1.5 text-pretty text-[16px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>{row.title}</p>
                    {product ? <p className="mt-0.5 line-clamp-1 text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>{product.title}</p> : null}
                  </div>
                  <HubButton size="sm" variant="secondary" disabled={busy === `a:${row.id}`} onClick={() => void restoreAi(row)}>
                    <Undo2 className="h-4 w-4" strokeWidth={1.75} />
                    Вернуть
                  </HubButton>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {muted.length > 0 ? (
        <section>
          <h3 className="text-[18px] font-bold tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
            Отключённые задачи по товарам <span className="ml-1 text-[14px] font-medium" style={{ ...hubNumeric, color: hub.textSubtle }}>{muted.length}</span>
          </h3>
          <ul className="mt-3 space-y-2.5">
            {muted.map((row) => {
              const product = byNm.get(row.nmId);
              return (
                <li key={`${row.nmId}:${row.type}`} className="flex flex-wrap items-center gap-4 rounded-[16px] border bg-white px-5 py-4" style={{ borderColor: hub.borderCard }}>
                  <HubPhoto src={product?.imageUrl} className="h-[56px] w-[42px] shrink-0 rounded-[8px]" iconClassName="h-4 w-4" />
                  <div className="min-w-0 flex-1">
                    <p className="text-pretty text-[16px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>{typeLabel(row.type)}</p>
                    <p className="mt-0.5 line-clamp-1 text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>{product?.title ?? `Товар ${row.nmId}`}</p>
                  </div>
                  <HubButton size="sm" variant="secondary" disabled={busy === `m:${row.nmId}:${row.type}`} onClick={() => void restoreTask(row)}>
                    <Undo2 className="h-4 w-4" strokeWidth={1.75} />
                    Вернуть
                  </HubButton>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
