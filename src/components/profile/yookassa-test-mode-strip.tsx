"use client";

import { useEffect, useState } from "react";

/** Полоса в профиле при тестовом магазине ЮKassa — для скриншотов и отладки. */
export function YookassaTestModeStrip() {
  const [info, setInfo] = useState<{ test: boolean; shopId: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/payment/status")
      .then((r) => r.json())
      .then((d: { yookassaTestMode?: boolean; shopId?: string | null }) =>
        setInfo({ test: Boolean(d.yookassaTestMode), shopId: d.shopId ?? null })
      )
      .catch(() => setInfo({ test: false, shopId: null }));
  }, []);

  if (!info?.test) return null;

  return (
    <div
      className="mb-4 rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="status"
    >
      <p className="font-semibold">Тестовый магазин ЮKassa</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
        Shop ID {info.shopId ?? "—"}. Оплаты тестовыми картами; автоплатежи доступны. После скриншотов
        для поддержки верните боевой магазин:{" "}
        <code className="rounded bg-amber-100/80 px-1">scripts/use-yookassa-prod.ps1</code>
      </p>
    </div>
  );
}
