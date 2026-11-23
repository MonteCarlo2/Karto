"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, TriangleAlert } from "lucide-react";
import { updateSellerHubPrices } from "@/lib/seller-hub/client-api";
import { claimPriceSubmit, releasePriceSubmit } from "@/lib/seller-hub/price-write";
import type { SellerCatalogItem } from "@/lib/seller-hub/types";
import { hub, hubNumeric, hubSans } from "./hub-ui";

/**
 * Изменение скидки или цены товара прямо в переписке: строка товара, поле с новым значением, окно «Было → Станет» и подтверждение.
 * В тестовом режиме в кабинет ничего не уходит. В рабочем запись идёт тем же путём, что в «Ценах», со сверкой того, что владелец видел на экране.
 */
const rub = (v: number | null | undefined) => (v == null ? "нет данных" : `${Math.round(v).toLocaleString("ru-RU")} ₽`);

export function ChatPriceEdit({ item, field, value, pct, sandbox, onChanged }: { item: SellerCatalogItem; field: "discount" | "price"; value: number | null; /** Изменение в процентах от текущей цены: «подними на 3%». */ pct?: number | null; sandbox: boolean; onChanged?: (nmId: string, price: number, discount: number) => void }) {
  const current = field === "discount" ? item.discountPercent : item.price;
  const startValue = value ?? (field === "price" && pct != null && item.price != null ? Math.round(item.price * (1 + pct / 100)) : null);
  const [text, setText] = useState(startValue != null ? String(startValue) : "");
  const [stage, setStage] = useState<"edit" | "confirm" | "done" | "error">("edit");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const next = text.trim() === "" ? null : Number(text.replace(",", ".").replace(/\s/g, ""));
  const valid = next != null && Number.isFinite(next) && (field === "discount" ? next >= 0 && next <= 99 && Number.isInteger(next) : next > 0 && next < 10_000_000);
  const label = field === "discount" ? "Скидка продавца" : "Цена до скидки";
  const fmt = (v: number | null) => (v == null ? "нет данных" : field === "discount" ? `${v}%` : rub(v));
  const price = field === "discount" ? item.price : next;
  const disc = field === "discount" ? next : item.discountPercent;
  const finalNow = item.price != null && item.discountPercent != null ? Math.round(item.price * (1 - item.discountPercent / 100)) : null;
  const finalNext = valid && price != null && disc != null ? Math.round(price * (1 - disc / 100)) : null;

  async function apply() {
    if (!valid || next == null || !claimPriceSubmit(lock)) return;
    setBusy(true);
    try {
      if (sandbox) {
        setMessage("Тестовый режим: в кабинет ничего не отправлено. В рабочем режиме изменение ушло бы в Wildberries.");
        setStage("done");
        return;
      }
      const result = await updateSellerHubPrices({
        updates: [{ nmId: Number(item.externalId), ...(field === "discount" ? { discount: next } : { price: next }), expected: { price: item.price ?? null, discount: item.discountPercent ?? null } }],
      });
      if (result.outcome === "confirmed") {
        onChanged?.(item.externalId, field === "price" ? next : (item.price ?? 0), field === "discount" ? next : (item.discountPercent ?? 0));
        setMessage("Готово: Wildberries принял изменение и оно уже в кабинете.");
        setStage("done");
      } else if (result.stale?.length) {
        setMessage("Цена в кабинете уже изменилась. Откройте товар заново, чтобы увидеть актуальные значения.");
        setStage("error");
      } else {
        setMessage(result.message || "Не удалось отправить изменение. Ничего не изменилось.");
        setStage(result.ok ? "done" : "error");
      }
    } finally {
      releasePriceSubmit(lock);
      setBusy(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="rounded-[18px] p-4" style={{ backgroundColor: "rgba(46, 90, 67, 0.045)", boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.07)" }}>
      <div className="flex items-center gap-3.5">
        <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[6px]" style={{ backgroundColor: "rgba(1, 20, 8, 0.05)" }} aria-hidden>
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt="" className="h-full w-full object-contain" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[14.5px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
            {item.title}
          </span>
          <span className="mt-0.5 block truncate text-[12.5px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
            {item.vendorCode ? `${item.vendorCode} · ` : ""}nm {item.externalId}
          </span>
        </span>
      </div>

      {stage === "edit" || stage === "confirm" ? (
        <div className="mt-4">
          <p className="text-[12.5px] font-medium" style={{ ...hubSans, color: hub.textSubtle }}>
            {label}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <span className="text-[20px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
              {fmt(current ?? null)}
            </span>
            <ArrowRight className="h-4 w-4" style={{ color: hub.textSubtle }} aria-hidden />
            <label className="flex h-11 items-center gap-1.5 rounded-[12px] border bg-white px-3" style={{ borderColor: "rgba(1, 20, 8, 0.18)" }}>
              <input
                inputMode="decimal"
                value={text}
                disabled={stage === "confirm"}
                onChange={(e) => setText(e.target.value)}
                aria-label={`Новое значение: ${label}`}
                placeholder="новое"
                className="w-[90px] bg-transparent text-[18px] font-semibold outline-none"
                style={{ ...hubSans, ...hubNumeric, color: hub.text }}
              />
              <span className="text-[15px]" style={{ ...hubSans, color: hub.textSubtle }}>
                {field === "discount" ? "%" : "₽"}
              </span>
            </label>
          </div>
          {stage === "confirm" ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 rounded-[12px] bg-white/70 p-3 sm:max-w-[420px]">
              <div>
                <dt className="text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>Было</dt>
                <dd className="text-[15px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>{fmt(current ?? null)}{finalNow != null ? ` · покупатель ${rub(finalNow)}` : ""}</dd>
              </div>
              <div>
                <dt className="text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>Станет</dt>
                <dd className="text-[15px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.greenDark }}>{fmt(next)}{finalNext != null ? ` · покупатель ${rub(finalNext)}` : ""}</dd>
              </div>
            </dl>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {stage === "edit" ? (
              <button type="button" disabled={!valid || next === current} onClick={() => setStage("confirm")} className="inline-flex h-10 items-center rounded-full px-5 text-[14px] font-semibold outline-none transition-[filter,opacity] hover:brightness-95 disabled:opacity-40 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: hub.lime, color: "#011408" }}>
                Изменить
              </button>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={() => void apply()} className="inline-flex h-10 items-center rounded-full px-5 text-[14px] font-semibold outline-none transition-[filter] hover:brightness-95 disabled:opacity-60 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: hub.lime, color: "#011408" }}>
                  {busy ? "Отправляю…" : sandbox ? "Подтвердить (тест)" : "Подтвердить"}
                </button>
                <button type="button" disabled={busy} onClick={() => setStage("edit")} className="inline-flex h-10 items-center rounded-full border px-5 text-[14px] font-medium outline-none transition-colors hover:bg-white focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.16)", color: hub.text }}>
                  Назад
                </button>
              </>
            )}
            {!valid && text.trim() !== "" ? (
              <span className="text-[13px]" style={{ ...hubSans, color: "#C2410C" }}>
                {field === "discount" ? "Скидка: целое число от 0 до 99" : "Введите цену в рублях"}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 flex items-start gap-2 text-[14px] leading-[1.45]" role="status" style={{ ...hubSans, color: stage === "error" ? "#C2410C" : hub.text }}>
          {stage === "error" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: hub.greenDark }} aria-hidden />}
          <span>{message}</span>
        </p>
      )}
    </motion.div>
  );
}
