import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validatePromoForCheckout } from "./checkout";

/** Подставной клиент: отдаёт заданные строки по таблицам, цепочки .eq/.limit/.maybeSingle ничего не фильтруют. */
function fakeDb(tables: Record<string, unknown[]>): SupabaseClient {
  const chain = (rows: unknown[]) => {
    const q: Record<string, unknown> = {
      eq: () => q,
      limit: () => Promise.resolve({ data: rows, error: null }),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    };
    return q;
  };
  return { from: (t: string) => ({ select: () => chain(tables[t] ?? []) }) } as unknown as SupabaseClient;
}

const campaign = {
  id: "c1",
  discount_percent: 20,
  discount_rub: null,
  payment_kind: "creative",
  tariff_indices: null,
  restrict_to_recipients: true,
  active: true,
  starts_at: "2026-01-01T00:00:00Z",
  ends_at: null,
  applies_to_all: true,
  reusable: true,
};

describe("промокод на всё и многоразовый", () => {
  const base = { userId: "u1", rawCode: "sorry20-kb7q4m" };

  it("даёт 20% на любой вид услуги", async () => {
    const db = fakeDb({ promo_campaigns: [campaign], promo_campaign_recipients: [{ user_id: "u1" }], promo_redemptions: [{ id: "r" }] });
    for (const kind of ["flow", "credits", "auto_replies"] as const) {
      const res = await validatePromoForCheckout(db, { ...base, paymentKind: kind, tariffIndex: 0 });
      assert.equal(res.ok, true, kind);
      if (res.ok) assert.equal(res.finalRub, Math.round(res.originalRub * 0.8));
    }
  });

  it("считает 20% точно для всех четырёх пакетов кредитов", async () => {
    const db = fakeDb({ promo_campaigns: [campaign], promo_campaign_recipients: [{ user_id: "u1" }] });
    const expected = [[249, 199], [590, 472], [1490, 1192], [2990, 2392]];
    for (let i = 0; i < expected.length; i += 1) {
      const res = await validatePromoForCheckout(db, { ...base, paymentKind: "credits", tariffIndex: i });
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.originalRub, expected[i][0]);
        assert.equal(res.finalRub, expected[i][1]);
      }
    }
  });

  it("работает повторно, даже если уже использовался", async () => {
    const db = fakeDb({ promo_campaigns: [campaign], promo_campaign_recipients: [{ user_id: "u1" }], promo_redemptions: [{ id: "r" }] });
    const res = await validatePromoForCheckout(db, { ...base, paymentKind: "credits", tariffIndex: 3 });
    assert.equal(res.ok, true);
  });

  it("недоступен чужому пользователю", async () => {
    const db = fakeDb({ promo_campaigns: [campaign], promo_campaign_recipients: [] });
    const res = await validatePromoForCheckout(db, { ...base, paymentKind: "flow", tariffIndex: 0 });
    assert.equal(res.ok, false);
  });

  it("обычный одноразовый код по-прежнему не работает второй раз", async () => {
    const once = { ...campaign, applies_to_all: false, reusable: false };
    const db = fakeDb({ promo_campaigns: [once], promo_campaign_recipients: [{ user_id: "u1" }], promo_redemptions: [{ id: "r" }] });
    const res = await validatePromoForCheckout(db, { ...base, paymentKind: "credits", tariffIndex: 0 });
    assert.equal(res.ok, false);
  });
});
