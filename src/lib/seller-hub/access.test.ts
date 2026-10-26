import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSellerHubAllowed, sellerHubAllowedIds } from "./access";

describe("доступ к Seller Hub", () => {
  it("на боевом сервере без настроек закрыт для всех", () => {
    assert.equal(isSellerHubAllowed("u1", { NODE_ENV: "production" }), false);
  });

  it("на компьютере разработчика без настроек открыт", () => {
    assert.equal(isSellerHubAllowed("u1", { NODE_ENV: "development" }), true);
    assert.equal(isSellerHubAllowed("u1", {}), true);
  });

  it("список разрешённых: пускает только их, на любом окружении", () => {
    const env = { NODE_ENV: "production", SELLER_HUB_ALLOWED_USER_IDS: " u1 , u2 ,," };
    assert.deepEqual(sellerHubAllowedIds(env), ["u1", "u2"]);
    assert.equal(isSellerHubAllowed("u1", env), true);
    assert.equal(isSellerHubAllowed("u2", env), true);
    assert.equal(isSellerHubAllowed("u3", env), false);
    assert.equal(isSellerHubAllowed("u3", { ...env, NODE_ENV: "development" }), false);
  });

  it("публичный запуск открывает всем", () => {
    assert.equal(isSellerHubAllowed("u9", { NODE_ENV: "production", SELLER_HUB_PUBLIC: "1" }), true);
    assert.equal(isSellerHubAllowed("u9", { NODE_ENV: "production", SELLER_HUB_PUBLIC: "0" }), false);
  });

  it("пустой список не открывает раздел на боевом сервере", () => {
    assert.equal(isSellerHubAllowed("u1", { NODE_ENV: "production", SELLER_HUB_ALLOWED_USER_IDS: " , " }), false);
  });
});
