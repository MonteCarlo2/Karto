"use client";

import { useEffect, useMemo, useState } from "react";
import { loadSellerHubSupplyOrders, type SellerHubSupplyOrders } from "@/lib/seller-hub/client-api";
import { snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import { buildFulfillmentProposals, DEFAULT_COVER_DAYS, DEFAULT_EVENING_HOUR, DEFAULT_REMIND_HOURS } from "@/lib/seller-hub/fulfillment-center";
import { buildLogisticsCost } from "@/lib/seller-hub/logistics-cost";
import { buildShipSpeed, type SupplyOrdersInput } from "@/lib/seller-hub/ship-speed";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { useUserSetting } from "./use-user-setting";

/** Сколько последних закрытых поставок читаем для скорости отгрузки. Закрытые WB не меняет, поэтому на сервере они кэшируются на сутки. */
const SPEED_SUPPLIES = 15;

/**
 * Общие данные логистики для «Заказов и логистики» и раздела «Агенты»: скорость отгрузки по реальным датам поставок
 * и предложения «что сделать сейчас». Только чтение WB, нейросеть не используется.
 */
export function useFulfillment(snapshot: SellerCatalogSnapshot | undefined, connected: boolean | undefined) {
  const [remindHours, setRemindHours] = useUserSetting<number>("fulfillment.remindHours", DEFAULT_REMIND_HOURS);
  const [coverDays, setCoverDays] = useUserSetting<number>("fulfillment.coverDays", DEFAULT_COVER_DAYS);
  const [eveningHour, setEveningHour] = useUserSetting<number>("fulfillment.eveningHour", DEFAULT_EVENING_HOUR);
  /** Настоящее время для возраста заказов и вечернего напоминания; обновляется раз в минуту, до первого такта берём время выгрузки. */
  const [clockMs, setClockMs] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setClockMs(Date.now()), 0);
    const id = setInterval(() => setClockMs(Date.now()), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const rawSupplies = useMemo(() => snapshot?.supplies?.supplies ?? [], [snapshot?.supplies]);
  /** Поставки, переданные в доставку из этого экрана: до следующей выгрузки показываем их закрытыми и в предложениях тоже. */
  const [closedIds, setClosedIds] = useState<Set<string>>(new Set());
  const supplies = useMemo(
    () => (closedIds.size === 0 ? rawSupplies : rawSupplies.map((s) => (closedIds.has(s.id) && s.type === "fbs" ? { ...s, done: true, status: "Закрыта" } : s))),
    [rawSupplies, closedIds],
  );
  const snapshotMs = snapshotTimeMs(snapshot);
  const nowMs = snapshotMs > 0 ? Math.max(snapshotMs, clockMs) : 0;

  const closed = useMemo(
    () =>
      supplies
        .filter((s) => s.type === "fbs" && s.done && s.closedAt && Number.isFinite(Date.parse(s.closedAt)))
        .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""))
        .slice(0, SPEED_SUPPLIES),
    [supplies],
  );
  const closedKey = closed.map((s) => s.id).join(",");

  const [loaded, setLoaded] = useState<{ key: string; rows: SellerHubSupplyOrders; error?: string } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!connected || !closedKey) return;
    let cancelled = false;
    void loadSellerHubSupplyOrders({ supplies: closed.map((s) => ({ id: s.id, done: true })) }).then((res) => {
      if (cancelled) return;
      setLoaded({ key: closedKey, rows: res.ok && res.supplyOrders ? res.supplyOrders : [], error: res.ok ? undefined : res.error });
    });
    return () => {
      cancelled = true;
    };
    // closed целиком определяется closedKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, closedKey, reloadTick]);

  const ready = loaded != null && loaded.key === closedKey;
  const shipSpeed = useMemo(() => {
    if (!ready || nowMs <= 0) return null;
    // Новая ручка WB отдаёт только номера заданий: даты создания берём из выгрузки заказов, если они там есть.
    const created = new Map((snapshot?.orders?.orders ?? []).map((o) => [o.externalId, o]));
    const byId = new Map(
      loaded.rows.map((r) => [r.supplyId, r.orders.map((o) => (o.createdAt ? o : { ...o, createdAt: created.get(o.id)?.createdAt, nmId: o.nmId ?? created.get(o.id)?.nmId, article: o.article ?? created.get(o.id)?.article }))]),
    );
    const inputs: SupplyOrdersInput[] = closed.flatMap((s) => {
      const orders = byId.get(s.id);
      return orders && s.closedAt ? [{ supplyId: s.id, supplyName: s.name, closedAt: s.closedAt, orders }] : [];
    });
    return buildShipSpeed(inputs, nowMs);
  }, [ready, loaded, closed, nowMs, snapshot?.orders]);

  const costs = useMemo(() => {
    const titles = new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.title || i.vendorCode || i.externalId]));
    return buildLogisticsCost(snapshot?.realization, (id) => titles.get(id) ?? `Артикул ${id}`);
  }, [snapshot?.realization, snapshot?.items]);

  const proposals = useMemo(
    () =>
      nowMs > 0
        ? buildFulfillmentProposals({
            orders: snapshot?.orders?.orders ?? [],
            supplies,
            items: snapshot?.items ?? [],
            nowMs,
            remindHours,
            eveningHour,
            coverDays,
            shipSpeed,
            costs,
          })
        : [],
    [snapshot?.orders, snapshot?.items, supplies, nowMs, remindHours, eveningHour, coverDays, shipSpeed, costs],
  );

  return {
    proposals,
    shipSpeed,
    speedLoading: Boolean(connected && closedKey && !ready),
    speedError: ready ? loaded.error : undefined,
    speedSuppliesTotal: closed.length,
    /** Сколько закрытых поставок удалось прочитать из запрошенных: если меньше, цифры скорости считаны по части поставок. */
    speedCoverage: ready ? { read: loaded.rows.length, total: closed.length } : null,
    markSupplyClosed: (id: string) => setClosedIds((prev) => new Set(prev).add(id)),
    remindHours,
    setRemindHours,
    coverDays,
    setCoverDays,
    eveningHour,
    setEveningHour,
    reloadSpeed: () => setReloadTick((t) => t + 1),
  };
}
