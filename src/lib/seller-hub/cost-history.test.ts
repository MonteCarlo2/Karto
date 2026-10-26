import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCostPricesToCatalog,
  costMapFromRecord,
  localOnlyCostEntries,
} from "./cost-history";
import type { SellerCatalogItem } from "./types";

function item(nmId: string, costPrice?: number | null): SellerCatalogItem {
  return {
    id: `id-${nmId}`,
    marketplaceId: "wildberries",
    externalId: nmId,
    title: nmId,
    vendorCode: nmId,
    costPrice: costPrice ?? null,
  };
}

describe("cost-history helpers", () => {
  it("applies server costs over catalog items", () => {
    const costs = costMapFromRecord({ "10": 740, "20": 802 });
    const rows = applyCostPricesToCatalog(
      [item("10", null), item("20", 1), item("30", 50)],
      costs,
    );
    assert.equal(rows[0]?.costPrice, 740);
    assert.equal(rows[1]?.costPrice, 802);
    assert.equal(rows[2]?.costPrice, 50);
  });

  it("lists local-only costs for migration to server", () => {
    const server = costMapFromRecord({ "10": 740 });
    const orphans = localOnlyCostEntries(
      [item("10", 740), item("20", 802), item("30", null)],
      server,
    );
    assert.deepEqual(orphans, [{ nmId: "20", costPrice: 802 }]);
  });
});
