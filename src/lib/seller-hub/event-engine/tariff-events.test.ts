import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBoxTariffs } from "@/lib/services/wildberries/tariffs-client";
import type { SellerBoxTariffs } from "@/lib/seller-hub/types";
import { baselineOfSignals, diffStoreSignals, parseStoreSignalsBaseline, signalsFromSnapshot } from "./store-events";
import { describeTariffChange, diffTariffs, tariffSignalsFromSnapshot, type TariffSignals } from "./tariff-events";

const names = Array.from({ length: 12 }, (_, i) => `Склад ${i + 1}`);
const signals = (logistics: number, storage: number): TariffSignals => Object.fromEntries(names.map((n) => [n, [logistics, storage] as [number, number]]));

describe("тарифы WB: события", () => {
  it("рост логистики на 5% по сети складов даёт событие с фактами", () => {
    const changes = diffTariffs(signals(100, 1), signals(105, 1));
    assert.equal(changes.length, 1);
    assert.equal(changes[0]!.metric, "logistics");
    const text = describeTariffChange(changes[0]!);
    assert.equal(text.title, "WB повысил тарифы логистики");
    assert.match(text.detail, /\+5,0%/);
    assert.match(text.detail, /12 складам/);
    assert.match(text.detail, /100,00 ₽ → 105,00 ₽/);
  });

  it("снижение хранения называется снижением", () => {
    const [change] = diffTariffs(signals(100, 1), signals(100, 0.9));
    assert.equal(describeTariffChange(change!).title, "WB снизил тарифы хранения");
  });

  it("шум меньше 1,5% и изменение одного склада событий не дают", () => {
    assert.equal(diffTariffs(signals(100, 1), signals(101, 1)).length, 0);
    const one = signals(100, 1);
    one["Склад 1"] = [200, 1];
    assert.equal(diffTariffs(signals(100, 1), one).length, 0);
  });

  it("мало общих складов: список мог прийти не целиком, сравнения нет", () => {
    const few = Object.fromEntries(names.slice(0, 5).map((n) => [n, [105, 1] as [number, number]]));
    assert.equal(diffTariffs(signals(100, 1), few).length, 0);
    assert.equal(diffTariffs(null, signals(100, 1)).length, 0);
  });

  it("числа WB с запятой и прочерки разбираются", () => {
    const parsed = parseBoxTariffs(
      { response: { data: { dtNextBox: "2026-11-01", warehouseList: [{ warehouseName: "Коледино", geoName: "ЦФО", boxDeliveryBase: "48", boxDeliveryLiter: "11,2", boxStorageBase: "0,14", boxStorageLiter: "-", boxDeliveryMarketplaceBase: "40", boxDeliveryMarketplaceLiter: "11" }, { geoName: "без имени" }] } } },
      "2026-10-23",
      "2026-10-23T10:00:00Z",
    );
    assert.equal(parsed.warehouses.length, 1);
    assert.equal(parsed.warehouses[0]!.deliveryLiter, 11.2);
    assert.equal(parsed.warehouses[0]!.storageBase, 0.14);
    assert.equal(parsed.warehouses[0]!.storageLiter, null);
    assert.equal(parsed.nextFrom, "2026-11-01");
  });

  it("сигналы: эталонный короб 5 л, пустые тарифы дают null", () => {
    const t: SellerBoxTariffs = { loadedAt: "", date: "2026-10-23", nextFrom: null, warehouses: [{ name: "A", geo: "", deliveryBase: 50, deliveryLiter: 10, storageBase: 0.1, storageLiter: 0.05, fbsBase: null, fbsLiter: null }] };
    assert.deepEqual(tariffSignalsFromSnapshot(t), { A: [90, 0.3] });
    assert.equal(tariffSignalsFromSnapshot(undefined), null);
  });

  it("через снимок кабинета: память о тарифах переживает пустой снимок, событие создаётся один раз", () => {
    const snap = (mult: number, withTariffs = true) =>
      ({
        syncedAt: "2026-10-23T10:00:00Z",
        marketplaceId: "wildberries",
        items: [],
        tariffs: withTariffs
          ? { loadedAt: "", date: "2026-10-23", nextFrom: null, warehouses: names.map((name) => ({ name, geo: "", deliveryBase: 50 * mult, deliveryLiter: 10 * mult, storageBase: 0.1, storageLiter: 0.05, fbsBase: null, fbsLiter: null })) }
          : undefined,
      }) as unknown as Parameters<typeof signalsFromSnapshot>[0];
    const first = baselineOfSignals(signalsFromSnapshot(snap(1)));
    // Снимок без тарифов не стирает память.
    const withoutTariffs = baselineOfSignals(signalsFromSnapshot(snap(1, false)), first);
    assert.ok(withoutTariffs.tariffs);
    const events = diffStoreSignals({ now: "2026-10-23T12:00:00Z", previous: parseStoreSignalsBaseline(JSON.parse(JSON.stringify(withoutTariffs))), next: signalsFromSnapshot(snap(1.1)), titleOf: () => null });
    const tariff = events.filter((e) => e.kind === "tariff_logistics_changed");
    assert.equal(tariff.length, 1);
    assert.equal(tariff[0]!.group, "money");
  });
});
