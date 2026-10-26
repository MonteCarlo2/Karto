import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TASK_THRESHOLDS } from "./config";
import { SETTING_FIELDS, TASK_TYPE_INFO, defaultValues, rowFromValues, validateDisabledTypes, validateValues, valuesFromRow } from "./settings-form";

describe("настройки задач: форма", () => {
  it("стандартные значения совпадают с порогами движка, целевая маржа по умолчанию выключена", () => {
    const d = defaultValues();
    assert.equal(d.leadTimeDays, DEFAULT_TASK_THRESHOLDS.leadTimeDays);
    assert.equal(d.noSalesDays, DEFAULT_TASK_THRESHOLDS.noSalesDays);
    assert.equal(d.excessCoverDays, DEFAULT_TASK_THRESHOLDS.excessCoverDays);
    assert.equal(d.salesChangePercent, DEFAULT_TASK_THRESHOLDS.salesChangePercent);
    assert.equal(d.targetMarginPercent, null);
  });

  it("проверка: только целые числа в границах, лишнее и отсутствующее заменяется стандартным", () => {
    assert.equal(validateValues({}).ok, true);
    const bad = validateValues({ noSalesDays: 5, leadTimeDays: 12.5, lowContentScore: "abc", salesChangePercent: 200 });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ["leadTimeDays", "lowContentScore", "noSalesDays", "salesChangePercent"]);
    const ok = validateValues({ noSalesDays: "30", targetMarginPercent: 25 });
    assert.ok(ok.ok);
    if (ok.ok) {
      assert.equal(ok.values.noSalesDays, 30);
      assert.equal(ok.values.targetMarginPercent, 25);
      assert.equal(ok.values.leadTimeDays, 14);
    }
  });

  it("целевую маржу можно очистить (выключить задачу), обязательное поле очистить нельзя", () => {
    const off = validateValues({ targetMarginPercent: null });
    assert.ok(off.ok);
    if (off.ok) assert.equal(off.values.targetMarginPercent, null);
    assert.equal(validateValues({ noSalesDays: null }).ok, false);
  });

  it("в базу пишутся все колонки явно: без значений базы по умолчанию (28 дней и 25%) вместо стандартов движка", () => {
    const row = rowFromValues(defaultValues());
    assert.equal(row.no_sales_days, 56);
    assert.equal(row.sales_change_percent, 20);
    assert.equal(row.sales_change_min_units, DEFAULT_TASK_THRESHOLDS.salesChangeMinUnits);
    assert.equal(row.excess_stock_days, DEFAULT_TASK_THRESHOLDS.excessStockDays);
    assert.equal(row.target_margin_percent, null);
    assert.equal(row.low_margin_percent, null);
    for (const f of SETTING_FIELDS) assert.ok(f.column in row, f.column);
  });

  it("чтение строки базы: пустые колонки дают стандартное значение, старая low_margin_percent считается целью", () => {
    const v = valuesFromRow({ no_sales_days: 30, lead_time_days: null, low_margin_percent: 18, excess_cover_days: 60.4 });
    assert.equal(v.noSalesDays, 30);
    assert.equal(v.leadTimeDays, 14);
    assert.equal(v.targetMarginPercent, 18);
    assert.equal(v.excessCoverDays, 60);
    assert.deepEqual(valuesFromRow(null), defaultValues());
  });

  it("список отключаемых типов: только известные; служебные и неизвестные отвергаются", () => {
    assert.deepEqual(validateDisabledTypes(["TASK_NO_SALES", "TASK_NO_SALES", "TASK_LOW_STOCK"]), ["TASK_NO_SALES", "TASK_LOW_STOCK"]);
    assert.equal(validateDisabledTypes(["TASK_FROM_EVENT"]), null);
    assert.equal(validateDisabledTypes(["DROP TABLE"]), null);
    assert.equal(validateDisabledTypes("x"), null);
    assert.deepEqual(validateDisabledTypes(undefined), []);
    assert.equal(new Set(TASK_TYPE_INFO.map((t) => t.type)).size, TASK_TYPE_INFO.length);
  });
});
