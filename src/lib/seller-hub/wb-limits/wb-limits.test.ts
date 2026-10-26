import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FALLBACK_LIMIT, wbLimitFor } from "./index";
import { WbRateGate } from "./rate-gate";

describe("реестр лимитов WB", () => {
  it("статистика рекламы: 3 запроса в минуту, не чаще одного раза в 20 с (совпадает с тем, что зашито в клиенте)", () => {
    const l = wbLimitFor("GET", "/adv/v3/fullstats?ids=1&beginDate=2026-10-01");
    assert.equal(l.known, true);
    assert.equal(l.perPeriod, 3);
    assert.equal(l.periodMs, 60_000);
    assert.equal(l.intervalMs, 20_000);
    assert.equal(l.readOnly, true);
  });

  it("заказы Statistics: 1 запрос в минуту; хост и строка запроса не мешают", () => {
    const l = wbLimitFor("get", "https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=2026-10-01");
    assert.equal(l.known, true);
    assert.equal(l.perPeriod, 1);
    assert.equal(l.periodMs, 60_000);
  });

  it("методы одной категории делят один лимит: цены и скидки", () => {
    const a = wbLimitFor("GET", "/api/v2/list/goods/filter");
    const b = wbLimitFor("POST", "/api/v2/list/goods/filter");
    assert.equal(a.known, true);
    assert.equal(a.key.startsWith("group:"), true);
    assert.equal(a.key, b.key);
  });

  it("методы без общей категории имеют свой ключ, а действия отмечены как изменяющие", () => {
    const pause = wbLimitFor("GET", "/adv/v0/pause");
    const fullstats = wbLimitFor("GET", "/adv/v3/fullstats");
    assert.notEqual(pause.key, fullstats.key);
    assert.equal(pause.readOnly, false);
  });

  it("путь с параметром находит метод, постоянные сегменты важнее параметров", () => {
    const l = wbLimitFor("GET", "/api/v2/nm-report/downloads/file/abc-123");
    assert.equal(l.known, true);
    assert.equal(l.key, "GET /api/v2/nm-report/downloads/file/{downloadId}");
  });

  it("неизвестный метод: осторожный запасной лимит и пометка known=false", () => {
    const l = wbLimitFor("GET", "/api/неизвестный/метод");
    assert.equal(l.known, false);
    assert.equal(l.intervalMs, FALLBACK_LIMIT.intervalMs);
    assert.equal(l.burst, 1);
  });

  it("тип токена: сервисный читается отдельной колонкой", () => {
    const p = wbLimitFor("GET", "/adv/v3/fullstats", "personal");
    const s = wbLimitFor("GET", "/adv/v3/fullstats", "service");
    assert.equal(p.known && s.known, true);
  });
});

describe("шлюз лимитов", () => {
  const limit = wbLimitFor("GET", "/adv/v3/fullstats"); // 3 за 60 с, интервал 20 с, всплеск 1

  it("первый запрос идёт сразу, второй ждёт интервал с запасом", () => {
    const gate = new WbRateGate();
    assert.equal(gate.waitMs("c1", limit, 0), 0);
    gate.record("c1", limit, 0);
    const wait = gate.waitMs("c1", limit, 1000);
    assert.ok(wait >= 20_000 * 1.1 - 1000 - 1 && wait <= 21_100, `ждём ${wait}`);
  });

  it("не больше трёх запросов за 60 с, четвёртый ждёт окончания окна", () => {
    const gate = new WbRateGate();
    let now = 0;
    for (let i = 0; i < 3; i += 1) {
      now += gate.waitMs("c1", limit, now);
      gate.record("c1", limit, now);
    }
    // Три запроса ушли примерно в 0, 22, 44 с; четвёртый нельзя раньше, чем первый выйдет из окна в 60 с.
    const wait = gate.waitMs("c1", limit, now);
    assert.ok(now + wait >= 60_000, `следующий в ${now + wait}`);
  });

  it("всплеск: метод с burst 5 пропускает пять запросов подряд, шестой ждёт", () => {
    const gate = new WbRateGate();
    const burst = wbLimitFor("GET", "/adv/v0/pause"); // 5 в секунду, интервал 200 мс, всплеск 5
    for (let i = 0; i < 5; i += 1) {
      assert.equal(gate.waitMs("c1", burst, 0), 0, `запрос ${i + 1}`);
      gate.record("c1", burst, 0);
    }
    // Лимит «5 запросов в секунду»: шестой законно ждёт, пока первый не выйдет из окна в 1 с.
    assert.ok(gate.waitMs("c1", burst, 0) > 0);
    assert.equal(gate.waitMs("c1", burst, 300), 700);
    assert.equal(gate.waitMs("c1", burst, 1000), 0);
  });

  it("кабинеты не мешают друг другу: лимит считается на токен", () => {
    const gate = new WbRateGate();
    gate.record("c1", limit, 0);
    assert.ok(gate.waitMs("c1", limit, 100) > 0);
    assert.equal(gate.waitMs("c2", limit, 100), 0);
  });

  it("429: молчим не меньше Retry-After, без подсказки пауза не короче интервала", () => {
    const gate = new WbRateGate();
    gate.penalize("c1", limit, 0, 45_000);
    assert.ok(gate.waitMs("c1", limit, 1000) >= 44_000);
    const other = new WbRateGate();
    other.penalize("c1", limit, 0, null);
    assert.ok(other.waitMs("c1", limit, 0) >= limit.intervalMs * 2);
  });
});
