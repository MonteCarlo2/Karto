"use client";

import { useEffect, useState } from "react";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import type { SellerHubConnection } from "@/lib/seller-hub/types";
import { formatSyncTime, hub, HubButton, HubInput, hubSans } from "./hub-ui";
import { useSellerHubSyncMode } from "./sync-mode-context";
import { Group, Row } from "./hub-account";

/** Раздел «Расчёты»: целевая маржа и налог, режим обновления данных. */
export function HubAccountData({ connection }: { connection: SellerHubConnection }) {
  const syncMode = useSellerHubSyncMode();
  const [target, setTarget] = useState("");
  const [tax, setTax] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    void (async () => {
      try {
        const res = await autoRepliesAuthorizedFetch("/api/seller-hub/settings?marketplaceId=wildberries", { method: "GET", timeoutMs: 15_000 });
        const data = (await res.json()) as { targetMarginPercent?: number | null; taxRatePercent?: number | null };
        if (off) return;
        setTarget(data.targetMarginPercent == null ? "" : String(data.targetMarginPercent));
        setTax(data.taxRatePercent == null ? "" : String(data.taxRatePercent));
        setLoaded(true);
      } catch {
        if (!off) setStatus("Не удалось загрузить настройки расчётов.");
      }
    })();
    return () => {
      off = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await autoRepliesAuthorizedFetch("/api/seller-hub/settings", {
        method: "PATCH",
        body: JSON.stringify({ marketplaceId: "wildberries", targetMarginPercent: target.trim() === "" ? null : Number(target.replace(",", ".")), taxRatePercent: tax.trim() === "" ? null : Number(tax.replace(",", ".")) }),
        timeoutMs: 15_000,
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setStatus(res.ok && data.ok ? "Сохранено. Задачи пересчитаются при следующем прогоне." : (data.error ?? "Не сохранилось."));
    } catch {
      setStatus("Не сохранилось.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Group title="Расчёты" hint="Необязательно. Маржа = цена − услуги Wildberries − себестоимость. Налог учитывается, только если вы его указали.">
        <Row title="Целевая маржа, %" hint="Без неё задача «маржа ниже целевой» не создаётся.">
          <div className="w-[120px]">
            <HubInput value={target} onChange={(e) => setTarget(e.target.value)} placeholder="20" inputMode="decimal" disabled={!loaded} />
          </div>
        </Row>
        <Row title="Ставка налога, %" hint="Например, 6 для УСН «Доходы». Пусто: налог не учитывается.">
          <div className="w-[120px]">
            <HubInput value={tax} onChange={(e) => setTax(e.target.value)} placeholder="6" inputMode="decimal" disabled={!loaded} />
          </div>
        </Row>
        <Row title="Сохранить расчёты" hint={status ?? undefined}>
          <HubButton size="sm" onClick={() => void save()} loading={saving} disabled={!loaded}>
            Сохранить
          </HubButton>
        </Row>
      </Group>

      <Group title="Данные" hint="Каталог, заказы, остатки и реклама обновляются сами.">
        <Row title="Как обновляются данные" hint={syncMode === "background" ? "Сервер обновляет кабинет в фоне, даже когда страница закрыта." : syncMode === "browser" ? "Данные обновляются, пока открыта платформа." : "Проверяю режим обновления…"}>
          <span className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            {syncMode === "background" ? "В фоне" : syncMode === "browser" ? "В браузере" : "…"}
          </span>
        </Row>
      </Group>
    </>
  );
}
